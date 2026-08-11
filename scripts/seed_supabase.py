"""Seed / refresh the Supabase `players` table from nflreadpy rosters.

Matches players on nflverse's stable `gsis_id` (via `player_external_ids`) so
roster moves *update* the existing player instead of inserting a duplicate.

Flow:
  1. Load existing gsis_id -> player_id mappings from `player_external_ids`.
  2. Players whose gsis_id is already mapped are upserted by `player_id`
     (updates in place, including team changes).
  3. Players with no mapping are upserted on the name/team/position key, then a
     `player_external_ids` row is written for each. On the first run this also
     backfills mappings for players seeded before ID-based sync existed.

Reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `.env`. Service-role
key bypasses RLS — never ship it to the browser.

Usage:
    python scripts/seed_supabase.py            # roster year defaults to 2026
    python scripts/seed_supabase.py --year 2025
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.data.fetch_data import PLAYER_DB_FIELDS, build_player_payloads  # noqa: E402

CHUNK_SIZE = 500
NAME_KEY = "normalized_name,current_team,primary_position"
PROVIDER = "nflverse"
INT_FIELDS = ("jersey_number", "rookie_year", "years_exp")


def _coerce_ints(rows: list[dict]) -> list[dict]:
    """Pandas upcasts int columns to float when any row is None; undo that."""
    for row in rows:
        for field in INT_FIELDS:
            v = row.get(field)
            if v is None:
                continue
            if isinstance(v, float):
                row[field] = int(v)
    return rows


def _player_columns(payload: dict) -> dict:
    """Strip non-column extras (gsis_id) down to real `players` fields."""
    return {k: payload[k] for k in PLAYER_DB_FIELDS if k in payload}


def _name_key(payload: dict) -> tuple:
    return (
        payload.get("normalized_name"),
        payload.get("current_team"),
        payload.get("primary_position"),
    )


def _load_gsis_map(client) -> dict[str, int]:
    """Return external_id -> player_id for provider='nflverse'."""
    mapping: dict[str, int] = {}
    page, page_size = 0, 1000
    while True:
        start = page * page_size
        res = (
            client.table("player_external_ids")
            .select("player_id, external_id")
            .eq("provider", PROVIDER)
            .range(start, start + page_size - 1)
            .execute()
        )
        rows = res.data or []
        for r in rows:
            if r.get("external_id"):
                mapping[str(r["external_id"])] = int(r["player_id"])
        if len(rows) < page_size:
            break
        page += 1
    return mapping


def _chunked(rows: list, size: int = CHUNK_SIZE):
    for i in range(0, len(rows), size):
        yield rows[i : i + size]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, default=2026)
    args = parser.parse_args()

    load_dotenv(ROOT / ".env")
    load_dotenv(ROOT / "web" / ".env.local", override=False)

    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env", file=sys.stderr)
        return 1

    try:
        from supabase import create_client
    except ImportError:
        print("supabase-py is not installed. Run: pip install supabase", file=sys.stderr)
        return 1

    print(f"Fetching roster payloads for {args.year}…")
    payloads = _coerce_ints(build_player_payloads(roster_year=args.year))
    print(f"  {len(payloads)} rows prepared")

    client = create_client(url, key)
    gsis_map = _load_gsis_map(client)
    print(f"  {len(gsis_map)} existing nflverse id mappings loaded")

    # Split into known players (update by id) vs. new/unmapped (upsert by name).
    known: list[dict] = []   # players rows carrying player_id
    unmapped: list[dict] = []  # full payloads (still carry gsis_id)
    for p in payloads:
        gsis = p.get("gsis_id")
        pid = gsis_map.get(str(gsis)) if gsis else None
        if pid is not None:
            known.append({**_player_columns(p), "player_id": pid})
        else:
            unmapped.append(p)

    # 1. Update already-mapped players in place (handles team changes).
    updated = 0
    for chunk in _chunked(known):
        client.table("players").upsert(chunk, on_conflict="player_id").execute()
        updated += len(chunk)
        print(f"  updated {updated}/{len(known)} mapped players")

    # 2. Upsert unmapped players on the name key, then map their gsis_id.
    new_mappings = 0
    for chunk in _chunked(unmapped):
        rows = [_player_columns(p) for p in chunk]
        res = client.table("players").upsert(rows, on_conflict=NAME_KEY).execute()
        returned = res.data or []
        # Match returned player_id back to gsis_id via the name key (unique).
        by_key = {_name_key(r): r["player_id"] for r in returned if r.get("player_id")}
        id_rows = []
        for p in chunk:
            gsis = p.get("gsis_id")
            pid = by_key.get(_name_key(p))
            if gsis and pid is not None:
                id_rows.append(
                    {"player_id": pid, "provider": PROVIDER, "external_id": str(gsis)}
                )
        for id_chunk in _chunked(id_rows):
            client.table("player_external_ids").upsert(
                id_chunk, on_conflict="player_id,provider"
            ).execute()
            new_mappings += len(id_chunk)
        print(f"  upserted {len(chunk)} unmapped players (+{len(id_rows)} id mappings)")

    print(f"Done. {updated} updated, {len(unmapped)} unmapped processed, "
          f"{new_mappings} id mappings written.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
