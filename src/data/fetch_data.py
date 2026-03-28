import nflreadpy as nfl
import pandas as pd


NAME_COLUMNS = (
    "full_name",
    "player_display_name",
    "player_name",
    "display_name",
    "player",
    "name",
)
TEAM_COLUMNS = ("team", "recent_team", "player_team")
POSITION_COLUMNS = ("position", "position_group", "pos")
ID_COLUMNS = ("gsis_id", "player_id", "playerid")


def _find_first_column(df: pd.DataFrame, candidates: tuple[str, ...]) -> str | None:
    """Return the first matching column name from a dataframe."""
    for column in candidates:
        if column in df.columns:
            return column
    return None


def _normalize_name(series: pd.Series) -> pd.Series:
    """Create a stable text key for name-based joins."""
    return (
        series.fillna("")
        .astype(str)
        .str.strip()
        .str.lower()
        .str.replace(r"[^a-z0-9]+", " ", regex=True)
        .str.replace(r"\s+", " ", regex=True)
        .str.strip()
    )


def _prepare_base_rosters(rosters: pd.DataFrame) -> pd.DataFrame:
    """Standardize the roster dataframe for downstream joins."""
    roster = rosters.copy()

    name_col = _find_first_column(roster, NAME_COLUMNS)
    team_col = _find_first_column(roster, TEAM_COLUMNS)
    position_col = _find_first_column(roster, POSITION_COLUMNS)
    id_col = _find_first_column(roster, ID_COLUMNS)

    if name_col is None:
        raise ValueError("Could not find a player name column in roster data.")

    rename_map = {name_col: "player_name"}
    if team_col:
        rename_map[team_col] = "team"
    if position_col:
        rename_map[position_col] = "position"
    if id_col:
        rename_map[id_col] = "player_id"

    roster = roster.rename(columns=rename_map)
    roster["player_name_key"] = _normalize_name(roster["player_name"])

    preferred_columns = [
        column
        for column in ("player_name", "player_name_key", "team", "position", "player_id")
        if column in roster.columns
    ]
    remaining_columns = [column for column in roster.columns if column not in preferred_columns]
    roster = roster[preferred_columns + remaining_columns]

    return roster.drop_duplicates(subset=["player_name_key", "team"], keep="first")


def filter_active(df):
    draft_pool = df[
    df["position"].isin(["QB", "RB", "WR", "TE", "K"])
    & df["rank_ecr"].notna()].copy()
    return draft_pool


def _prepare_join_frame(df: pd.DataFrame, prefix: str) -> pd.DataFrame:
    """Normalize player identifiers and prefix non-key columns to avoid collisions."""
    frame = df.copy()

    name_col = _find_first_column(frame, NAME_COLUMNS)
    if name_col is None:
        player_like_columns = [
            column
            for column in frame.columns
            if "player" in column.lower() or "name" in column.lower()
        ]
        if player_like_columns:
            name_col = player_like_columns[0]

    if name_col is None:
        raise ValueError(
            f"Could not find a player name column in {prefix} data. "
            f"Available columns: {list(frame.columns)}"
        )

    frame["player_name_key"] = _normalize_name(frame[name_col])

    id_col = _find_first_column(frame, ID_COLUMNS)
    if id_col is not None:
        frame["player_id"] = frame[id_col].astype(str)

    prefixed_columns: dict[str, str] = {}
    for column in frame.columns:
        if column in {"player_name_key", "player_id"}:
            continue
        prefixed_columns[column] = f"{prefix}_{column}"

    frame = frame.rename(columns=prefixed_columns)

    sort_columns = ["player_name_key"]
    if "player_id" in frame.columns:
        sort_columns.append("player_id")
    frame = frame.sort_values(sort_columns)

    dedupe_columns = ["player_name_key"]
    if "player_id" in frame.columns:
        dedupe_columns.append("player_id")

    return frame.drop_duplicates(subset=dedupe_columns, keep="first")


def build_player_snapshot(roster_year: int, stats_year: int | None = None) -> pd.DataFrame:
    """
    Build a single dataframe with current rostered players, recent stats,
    and current draft rankings.

    `roster_year` is the current roster pool you want in the DB.
    `stats_year` defaults to the previous season, which is usually the
    most useful offseason baseline.
    """
    if stats_year is None:
        stats_year = roster_year - 1

    rosters = nfl.load_rosters(seasons=roster_year).to_pandas()
    stats = nfl.load_player_stats(seasons=stats_year, summary_level="reg").to_pandas()
    rankings = nfl.load_ff_rankings("draft").to_pandas()

    roster_frame = _prepare_base_rosters(rosters)
    stats_frame = _prepare_join_frame(stats, "stats")
    rankings_frame = _prepare_join_frame(rankings, "rank")

    if "player_id" in roster_frame.columns and "player_id" in stats_frame.columns:
        merged = roster_frame.merge(
            stats_frame,
            on=["player_name_key", "player_id"],
            how="left",
        )
    else:
        merged = roster_frame.merge(stats_frame, on="player_name_key", how="left")

    if "player_id" in merged.columns and "player_id" in rankings_frame.columns:
        merged = merged.merge(
            rankings_frame,
            on=["player_name_key", "player_id"],
            how="left",
        )
    else:
        merged = merged.merge(rankings_frame, on="player_name_key", how="left")

    return merged


def get_player_names(year: int) -> list[str]:
    """Pull the rostered player names for a given roster year."""
    snapshot = build_player_snapshot(roster_year=year)
    return snapshot["player_name"].dropna().drop_duplicates().tolist()

def get_draft_info(roster_year, stats_year):
    snapshot = build_player_snapshot(roster_year, stats_year)
    draft_pool = filter_active(snapshot)
    return draft_pool

if __name__ == "__main__":
    data = get_draft_info(roster_year=2026, stats_year=2025)
    print(data)