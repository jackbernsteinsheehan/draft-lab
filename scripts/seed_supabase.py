"""Seed the Supabase `players` table from nflreadpy rosters.

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

from src.data.fetch_data import build_player_payloads  # noqa: E402

CHUNK_SIZE = 500
ON_CONFLICT = "normalized_name,current_team,primary_position"
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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, default=2026)
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
        print(
            "supabase-py is not installed. Run: pip install supabase",
            file=sys.stderr,
        )
        return 1

    print(f"Fetching roster payloads for {args.year}…")
    payloads = build_player_payloads(roster_year=args.year)
    print(f"  {len(payloads)} rows prepared")

    client = create_client(url, key)
    inserted = 0
    for i in range(0, len(payloads), CHUNK_SIZE):
        chunk = payloads[i : i + CHUNK_SIZE]
        client.table("players").upsert(chunk, on_conflict=ON_CONFLICT).execute()
        inserted += len(chunk)
        print(f"  upserted {inserted}/{len(payloads)}")

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
