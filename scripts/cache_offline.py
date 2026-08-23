"""Snapshot every pipeline input to local parquet so the seeder runs offline.

Run this once **while you still have a network connection**. It writes four
parquet files into `scripts/_offline/`:

    ff_rankings.parquet         nflverse FantasyPros ECR/ADP  (fetch_rankings.py)
    ff_playerids.parquet        nflverse id crosswalk         (seed_rankings.py)
    players.parquet             Supabase `players` (active)   (seed_rankings.py)
    player_external_ids.parquet Supabase gsis_id mappings     (seed_rankings.py)

Afterwards, point the seeder at the snapshot and it never touches the network:

    DRAFTLAB_OFFLINE_DIR=scripts/_offline python scripts/seed_rankings.py --dry-run

The two nflverse files are always written. The two Supabase files need
SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in `.env`; without them we warn and
skip, so the id-crosswalk half of matching won't have anything to resolve
against offline (name-fallback still works).

Usage:
    python scripts/cache_offline.py
    python scripts/cache_offline.py --out some/other/dir
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
NFLVERSE_PROVIDER = "nflverse"
DEFAULT_OUT = ROOT / "scripts" / "_offline"


def _cache_nflverse(out: Path) -> None:
    import nflreadpy as nfl

    for name, loader in (
        ("ff_rankings", nfl.load_ff_rankings),
        ("ff_playerids", nfl.load_ff_playerids),
    ):
        print(f"Fetching nflverse {name}…")
        df = loader().to_pandas()
        df.to_parquet(out / f"{name}.parquet")
        print(f"  wrote {name}.parquet ({len(df)} rows)")


def _fetch_all(client, table: str, select: str, provider: str | None = None) -> list[dict]:
    """Page through a Supabase table, mirroring the seeder's own queries."""
    rows: list[dict] = []
    page, size = 0, 1000
    while True:
        q = client.table(table).select(select)
        if table == "players":
            q = q.eq("is_active", True)
        if provider:
            q = q.eq("provider", provider)
        res = q.range(page * size, page * size + size - 1).execute()
        page_rows = res.data or []
        if not page_rows:
            break
        rows.extend(page_rows)
        if len(page_rows) < size:
            break
        page += 1
    return rows


def _cache_supabase(out: Path) -> bool:
    load_dotenv(ROOT / ".env")
    load_dotenv(ROOT / "web" / ".env.local", override=False)
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print(
            "! No Supabase creds in .env — skipping players / player_external_ids. "
            "Offline id-matching will have nothing to resolve against.",
            file=sys.stderr,
        )
        return False

    import pandas as pd
    from supabase import create_client

    client = create_client(url, key)
    print("Fetching Supabase players (active)…")
    players = _fetch_all(
        client, "players",
        "player_id, normalized_name, primary_position, current_team, birth_date",
    )
    pd.DataFrame(players).to_parquet(out / "players.parquet")
    print(f"  wrote players.parquet ({len(players)} rows)")

    print("Fetching Supabase player_external_ids (nflverse)…")
    ext = _fetch_all(
        client, "player_external_ids", "player_id, external_id",
        provider=NFLVERSE_PROVIDER,
    )
    pd.DataFrame(ext).to_parquet(out / "player_external_ids.parquet")
    print(f"  wrote player_external_ids.parquet ({len(ext)} rows)")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=str(DEFAULT_OUT),
                        help="Directory to write the parquet snapshot into.")
    args = parser.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    print(f"Caching pipeline inputs into {out}/\n")

    _cache_nflverse(out)
    _cache_supabase(out)

    print(
        f"\nDone. Run the pipeline offline with:\n"
        f"  DRAFTLAB_OFFLINE_DIR={out} python scripts/seed_rankings.py --dry-run"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
