"""Seed `player_rankings` from nflverse FantasyPros ECR/ADP.

Resolves each ranking row to an internal `player_id` **id-first**:
  1. `fantasypros_id` -> `gsis_id` via nflverse `ff_playerids` crosswalk, then
     `gsis_id` -> `player_id` via `player_external_ids` (provider 'nflverse').
     An id match is cross-source, so it's guarded by a birthdate check against
     our `players` row; a hard conflict is rejected (logged, not written).
  2. Fallback to name matching on `(normalized_name, primary_position)` with
     `current_team` as a tiebreaker (rookies/DST the crosswalk doesn't cover).

Usage:
    python scripts/seed_rankings.py                                 # half-PPR redraft overall
    python scripts/seed_rankings.py --scoring ppr
    python scripts/seed_rankings.py --page-type redraft-overall --scoring superflex
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.data.fetch_rankings import (  # noqa: E402
    OFFLINE_ENV,
    build_ranking_payloads,
    offline_frame,
)

SOURCE = "fantasypros"
NFLVERSE_PROVIDER = "nflverse"  # provider label in player_external_ids for gsis_id
CHUNK_SIZE = 500
# Includes scrape_date so each day's snapshot accumulates as history; same-day
# re-runs upsert onto the same row. Matches uq_player_rankings (migration 0002).
ON_CONFLICT = "player_id,source,scoring,ecr_type,season,scrape_date"


def _norm_id(v) -> str | None:
    """Normalize an external id to a comparable string (drop trailing .0, nan)."""
    if v is None:
        return None
    s = str(v).strip()
    if not s or s.lower() in ("nan", "none", "nat"):
        return None
    if s.endswith(".0"):
        s = s[:-2]
    return s or None


def _iso_date(v) -> str | None:
    """Coerce a date-ish value to an ISO 'YYYY-MM-DD' string, or None."""
    if v is None:
        return None
    s = str(v)
    if not s or s[:3] in ("nan", "NaT", "Non"):
        return None
    return s[:10]


def _build_player_maps(rows: list[dict]):
    """Build (name_lookup, players_by_id) from a list of `players` rows."""
    lookup: dict[tuple[str, str], list[dict]] = {}
    by_id: dict[int, dict] = {}
    for r in rows:
        key = (r["normalized_name"] or "", r["primary_position"] or "")
        lookup.setdefault(key, []).append(r)
        by_id[int(r["player_id"])] = r
    return lookup, by_id


def _fetch_player_lookup(client):
    """Return (name_lookup, players_by_id).

    - name_lookup: (normalized_name, primary_position) -> [player rows]. Multiple
      rows can share a key (same name, different teams); we tiebreak by team.
    - players_by_id: player_id -> row, used to validate id-based matches.
    """
    cached = offline_frame("players")
    if cached is not None:
        return _build_player_maps(cached.to_dict("records"))

    rows: list[dict] = []
    page = 0
    page_size = 1000
    while True:
        start = page * page_size
        end = start + page_size - 1
        res = (
            client.table("players")
            .select("player_id, normalized_name, primary_position, current_team, birth_date")
            .eq("is_active", True)
            .range(start, end)
            .execute()
        )
        page_rows = res.data or []
        if not page_rows:
            break
        rows.extend(page_rows)
        if len(page_rows) < page_size:
            break
        page += 1
    return _build_player_maps(rows)


def _load_gsis_to_player_id(client) -> dict[str, int]:
    """Return gsis_id -> player_id from player_external_ids (provider 'nflverse')."""
    mapping: dict[str, int] = {}
    cached = offline_frame("player_external_ids")
    if cached is not None:
        for r in cached.to_dict("records"):
            eid = _norm_id(r.get("external_id"))
            if eid:
                mapping[eid] = int(r["player_id"])
        return mapping

    page, size = 0, 1000
    while True:
        res = (
            client.table("player_external_ids")
            .select("player_id, external_id")
            .eq("provider", NFLVERSE_PROVIDER)
            .range(page * size, page * size + size - 1)
            .execute()
        )
        rows = res.data or []
        if not rows:
            break
        for r in rows:
            eid = _norm_id(r.get("external_id"))
            if eid:
                mapping[eid] = int(r["player_id"])
        if len(rows) < size:
            break
        page += 1
    return mapping


def _load_crosswalk() -> dict[str, dict]:
    """Return fantasypros_id -> {gsis_id, birth_date} from nflverse ff_playerids."""
    df = offline_frame("ff_playerids")
    if df is None:
        import nflreadpy as nfl

        df = nfl.load_ff_playerids().to_pandas()
    xwalk: dict[str, dict] = {}
    for r in df.to_dict("records"):
        fp = _norm_id(r.get("fantasypros_id"))
        gsis = _norm_id(r.get("gsis_id"))
        if not fp or not gsis:
            continue
        xwalk[fp] = {"gsis_id": gsis, "birth_date": _iso_date(r.get("birthdate"))}
    return xwalk


def _validate_id_match(pid: int, cross: dict, players_by_id: dict) -> str | None:
    """Return a reason string if an id match looks wrong, else None.

    Birthdate is the strongest cross-source signal and is unambiguous; team and
    position abbreviations differ too often between sources to reject on.
    """
    p = players_by_id.get(pid)
    if not p:
        return None  # nothing to compare against; trust the id chain
    cb, pb = cross.get("birth_date"), _iso_date(p.get("birth_date"))
    if cb and pb and cb != pb:
        return f"birthdate {cb} != players {pb}"
    return None


def _resolve_player_id(row: dict, lookup) -> int | None:
    key = (row["normalized_name"], row["position"])
    matches = lookup.get(key)
    if not matches:
        return None
    if len(matches) == 1:
        return matches[0]["player_id"]
    team = (row.get("team") or "").strip().upper()
    if team:
        for m in matches:
            if (m.get("current_team") or "").strip().upper() == team:
                return m["player_id"]
    return matches[0]["player_id"]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int, default=None,
                        help="Override season; default is inferred from scrape_date.")
    parser.add_argument("--scoring", default="half",
                        choices=["half", "ppr", "superflex", "std"])
    parser.add_argument("--page-type", default="redraft-overall",
                        help="nflverse page_type, e.g. redraft-overall, redraft-rb.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Resolve player_ids and print match stats, but don't upsert.")
    args = parser.parse_args()

    load_dotenv(ROOT / ".env")
    load_dotenv(ROOT / "web" / ".env.local", override=False)

    # Offline mode (DRAFTLAB_OFFLINE_DIR) reads every input from cached parquet and
    # can't reach Supabase, so it implies --dry-run and needs no credentials.
    offline = bool(os.getenv(OFFLINE_ENV))
    dry_run = args.dry_run or offline

    client = None
    if not offline:
        url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            print(
                "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env",
                file=sys.stderr,
            )
            return 1
        try:
            from supabase import create_client
        except ImportError:
            print("supabase-py is not installed. Run: pip install supabase", file=sys.stderr)
            return 1
        client = create_client(url, key)

    if offline:
        print(f"OFFLINE mode ({OFFLINE_ENV}={os.getenv(OFFLINE_ENV)}) — reading cached parquet, no writes.")

    print(
        f"Fetching FantasyPros rankings (page_type={args.page_type}, "
        f"scoring={args.scoring}, season={args.season or 'auto'})…"
    )
    rankings = build_ranking_payloads(
        scoring=args.scoring, page_type=args.page_type, season=args.season
    )
    print(f"  {len(rankings)} ranking rows fetched")
    if not rankings:
        print("Nothing to seed.", file=sys.stderr)
        return 0

    print("Loading active player lookup…")
    lookup, players_by_id = _fetch_player_lookup(client)
    print(f"  {sum(len(v) for v in lookup.values())} active players loaded")

    gsis_to_pid = _load_gsis_to_player_id(client)
    print(f"  {len(gsis_to_pid)} gsis->player_id mappings loaded")
    crosswalk = _load_crosswalk()
    print(f"  {len(crosswalk)} fantasypros->gsis crosswalk rows loaded")

    payloads: list[dict] = []
    by_id_ct = by_name_ct = unmatched = rejected = 0
    for row in rankings:
        pid = None

        # 1. id-first: fantasypros_id -> gsis_id -> player_id, birthdate-guarded.
        fp = _norm_id(row.get("fantasypros_id"))
        cross = crosswalk.get(fp) if fp else None
        if cross:
            cand = gsis_to_pid.get(cross["gsis_id"])
            if cand is not None:
                reason = _validate_id_match(cand, cross, players_by_id)
                if reason:
                    rejected += 1
                    print(f"  ! id match rejected for {row['normalized_name']}: {reason}")
                else:
                    pid = cand
                    by_id_ct += 1

        # 2. fallback: name + position (rookies/DST the crosswalk misses).
        if pid is None:
            pid = _resolve_player_id(row, lookup)
            if pid is not None:
                by_name_ct += 1

        if pid is None:
            unmatched += 1
            continue
        payloads.append(
            {
                "player_id":     pid,
                "source":        SOURCE,
                "scoring":       row["scoring"],
                "ecr_type":      row["ecr_type"],
                "season":        row["season"],
                "ecr":           row["ecr"],
                "adp":           row["adp"],
                "position_rank": row["position_rank"],
                "tier":          row["tier"],
                "best_rank":     row["best_rank"],
                "worst_rank":    row["worst_rank"],
                "std_dev":       row["std_dev"],
                "scrape_date":   row["scrape_date"],
            }
        )

    print(
        f"  matched {len(payloads)} (id {by_id_ct}, name {by_name_ct}), "
        f"unmatched {unmatched}, id-rejected {rejected}"
    )
    if not payloads:
        return 0

    if dry_run:
        print(f"Dry run — {len(payloads)} rows resolved, nothing written.")
        return 0

    upserted = 0
    for i in range(0, len(payloads), CHUNK_SIZE):
        chunk = payloads[i : i + CHUNK_SIZE]
        client.table("player_rankings").upsert(chunk, on_conflict=ON_CONFLICT).execute()
        upserted += len(chunk)
        print(f"  upserted {upserted}/{len(payloads)}")

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
