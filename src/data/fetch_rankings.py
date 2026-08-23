"""Fetch FantasyPros ECR rankings via nflverse (`nflreadpy.load_ff_rankings`).

The nflverse `ff_rankings` table is a flat snapshot of FantasyPros' published
rankings. As of 2026 the relevant columns are:

    id, player, pos, team, ecr, best, worst, sd, page_type, ecr_type, scrape_date

`id` is the FantasyPros player id; we carry it through as `fantasypros_id` so the
seeder can resolve players by id (via nflverse `ff_playerids`, whose
`fantasypros_id -> gsis_id` crosswalk chains to our `player_external_ids`)
instead of relying on name matching. There is no `adp` and no `season`; we infer
season from `scrape_date`. The
`ecr_type` column uses two-letter codes that fan out by scoring/format:

    ro  = redraft overall (default — used as half-PPR-equivalent)
    rp  = redraft PPR
    rsf = redraft superflex
    bp  = best-ball PPR
    bo  = best-ball overall
    do  = dynasty overall
    dp  = dynasty PPR
    dsf = dynasty superflex
    drk = dynasty rookies

Public entry point: `build_ranking_payloads(scoring='half', page_type='redraft-overall')`.
"""

from __future__ import annotations

import os
from pathlib import Path

import nflreadpy as nfl
import pandas as pd

# When DRAFTLAB_OFFLINE_DIR points at a directory (see scripts/cache_offline.py),
# the nflverse frames are read from parquet on disk instead of the network. This
# is what lets the pipeline run with no connectivity (e.g. on a plane).
OFFLINE_ENV = "DRAFTLAB_OFFLINE_DIR"


def offline_frame(name: str) -> pd.DataFrame | None:
    """Read `{name}.parquet` from the offline dir, or None if offline is off.

    If offline is on but the file is missing we raise rather than silently fall
    back to the network — the whole point offline is to *not* touch the network.
    """
    d = os.getenv(OFFLINE_ENV)
    if not d:
        return None
    path = Path(d) / f"{name}.parquet"
    if not path.exists():
        raise FileNotFoundError(
            f"{OFFLINE_ENV} is set but {path} is missing; "
            f"run `python scripts/cache_offline.py` once while online."
        )
    return pd.read_parquet(path)


# Map our scoring label to FantasyPros' ecr_type code on redraft-overall.
_SCORING_TO_ECR_TYPE = {
    "half":      "ro",
    "overall":   "ro",
    "std":       "ro",  # FantasyPros folded standard into "Overall"; closest match
    "ppr":       "rp",
    "superflex": "rsf",
}


def _normalize_name(value: object) -> str:
    if pd.isna(value):
        return ""
    s = str(value).strip().lower()
    s = "".join(ch if ch.isalnum() or ch == " " else " " for ch in s)
    return " ".join(s.split())


def _normalize_position(value: object) -> str | None:
    if pd.isna(value):
        return None
    up = str(value).strip().upper()
    if up in {"DEF", "D/ST", "DST"}:
        return "DST"
    if up == "PK":
        return "K"
    return up


def _clean_int(v):
    if pd.isna(v):
        return None
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def _clean_float(v):
    if pd.isna(v):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _clean_id(v):
    """Normalize an external id to a comparable string (drop trailing .0, blanks)."""
    if pd.isna(v):
        return None
    s = str(v).strip()
    if s.endswith(".0"):
        s = s[:-2]
    return s or None


def fetch_ff_rankings_frame() -> pd.DataFrame:
    cached = offline_frame("ff_rankings")
    if cached is not None:
        return cached
    return nfl.load_ff_rankings().to_pandas()


def build_ranking_payloads(
    *,
    scoring: str = "half",
    page_type: str = "redraft-overall",
    season: int | None = None,
) -> list[dict]:
    """Return rows ready for `player_rankings` (player_id resolved by caller).

    - `scoring`: 'half' | 'ppr' | 'superflex' | 'std' (std falls back to overall).
    - `page_type`: nflverse `page_type` value, e.g. 'redraft-overall'.
    - `season`: defaults to year inferred from the latest `scrape_date`.
    """
    scoring = scoring.lower()
    ecr_type = _SCORING_TO_ECR_TYPE.get(scoring)
    if ecr_type is None:
        raise ValueError(
            f"unknown scoring {scoring!r}; supported: {sorted(_SCORING_TO_ECR_TYPE)}"
        )

    df = fetch_ff_rankings_frame()
    missing = {"player", "pos", "page_type", "ecr_type"} - set(df.columns)
    if missing:
        raise ValueError(f"ff_rankings missing required columns: {sorted(missing)}")

    df = df[df["page_type"] == page_type]
    df = df[df["ecr_type"] == ecr_type]
    if df.empty:
        return []

    # Infer season from scrape_date if not provided.
    if season is None:
        if "scrape_date" in df.columns and df["scrape_date"].notna().any():
            season = int(pd.to_datetime(df["scrape_date"], errors="coerce").dt.year.max())
        else:
            from datetime import date
            season = date.today().year

    out = pd.DataFrame()
    out["player_raw"]   = df["player"].astype("string")
    out["position"]     = df["pos"].map(_normalize_position)
    out["team"]         = df["team"].astype("string").str.strip() if "team" in df else None
    out["ecr"]          = df["ecr"].map(_clean_float) if "ecr" in df else None
    out["best_rank"]    = df["best"].map(_clean_int) if "best" in df else None
    out["worst_rank"]   = df["worst"].map(_clean_int) if "worst" in df else None
    out["std_dev"]      = df["sd"].map(_clean_float) if "sd" in df else None
    out["scrape_date"]  = (
        pd.to_datetime(df["scrape_date"], errors="coerce") if "scrape_date" in df else None
    )
    out["fantasypros_id"] = df["id"].map(_clean_id) if "id" in df else None

    out["normalized_name"] = out["player_raw"].map(_normalize_name)
    out = out[out["normalized_name"].str.len() > 0]
    out = out[out["position"].notna()]
    out = (
        out.sort_values("ecr", na_position="last")
        .drop_duplicates(subset=["normalized_name", "position"], keep="first")
    )

    rows: list[dict] = []
    for _, r in out.iterrows():
        rows.append(
            {
                "normalized_name": r["normalized_name"],
                "position":        r["position"],
                "team":            r["team"] if pd.notna(r["team"]) else None,
                "fantasypros_id":  r["fantasypros_id"] if pd.notna(r["fantasypros_id"]) else None,
                "scoring":         scoring,
                "ecr_type":        ecr_type,
                "season":          season,
                "ecr":             r["ecr"],
                "adp":             None,    # not present in nflverse ff_rankings
                "position_rank":   None,    # not present on the overall page
                "tier":            None,    # not present
                "best_rank":       r["best_rank"],
                "worst_rank":      r["worst_rank"],
                "std_dev":         r["std_dev"],
                "scrape_date":     (
                    r["scrape_date"].date().isoformat()
                    if r["scrape_date"] is not None and pd.notna(r["scrape_date"])
                    else None
                ),
            }
        )
    return rows


if __name__ == "__main__":
    import json
    rows = build_ranking_payloads(scoring="half")
    print(f"{len(rows)} rows")
    print(json.dumps(rows[:5], indent=2, default=str))
