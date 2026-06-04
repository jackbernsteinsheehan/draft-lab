"""Seed `player_rankings` from nflverse FantasyPros ECR/ADP.

Resolves each ranking row to an internal `player_id` by matching on
`(normalized_name, primary_position)`, with `current_team` as a tiebreaker.

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

from src.data.fetch_rankings import build_ranking_payloads  # noqa: E402

SOURCE = "fantasypros"
CHUNK_SIZE = 500
ON_CONFLICT = "player_id,source,scoring,ecr_type,season"


def _fetch_player_lookup(client) -> dict[tuple[str, str], list[dict]]:
    """Return a map: (normalized_name, primary_position) -> [player rows].

    Multiple rows can share a key (e.g. same name on different teams), which
    is why we keep a list and tiebreak by team at match time.
    """
    lookup: dict[tuple[str, str], list[dict]] = {}
    page = 0
    page_size = 1000
    while True:
        start = page * page_size
        end = start + page_size - 1
        res = (
            client.table("players")
            .select("player_id, normalized_name, primary_position, current_team")
            .eq("is_active", True)
            .range(start, end)
            .execute()
        )
        rows = res.data or []
        if not rows:
            break
        for r in rows:
            key = (r["normalized_name"] or "", r["primary_position"] or "")
            lookup.setdefault(key, []).append(r)
        if len(rows) < page_size:
            break
        page += 1
    return lookup


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
    args = parser.parse_args()

    load_dotenv(ROOT / ".env")
    load_dotenv(ROOT / "web" / ".env.local", override=False)

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

    client = create_client(url, key)
    print("Loading active player lookup from Supabase…")
    lookup = _fetch_player_lookup(client)
    print(f"  {sum(len(v) for v in lookup.values())} active players loaded")

    payloads: list[dict] = []
    unmatched = 0
    for row in rankings:
        pid = _resolve_player_id(row, lookup)
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

    print(f"  matched {len(payloads)}, unmatched {unmatched}")
    if not payloads:
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
