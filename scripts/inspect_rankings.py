"""Print the schema and distinct filter values of nflverse `ff_rankings`.

Useful for figuring out what `--scoring` / `--ecr-type` / `--season` values
seed_rankings.py should pass when nothing matches.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import nflreadpy as nfl  # noqa: E402


def main() -> int:
    df = nfl.load_ff_rankings().to_pandas()
    print(f"shape: {df.shape}")
    print(f"columns: {sorted(df.columns)}")
    print()

    for col in ("scoring", "scoring_type", "page_type", "ecr_type", "type", "season", "year"):
        if col in df.columns:
            vals = df[col].dropna().unique().tolist()
            print(f"{col} distinct ({len(vals)}): {vals[:30]}")

    print()
    print("first 3 rows:")
    print(df.head(3).to_dict(orient="records"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
