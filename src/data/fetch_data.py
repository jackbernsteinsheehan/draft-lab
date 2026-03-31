import nflreadpy as nfl
import pandas as pd

"""
Main is build_player_payloads(roster_year)"""


PLAYER_DB_FIELDS = (
    "canonical_name",
    "normalized_name",
    "primary_position",
    "current_team",
    "jersey_number",
    "birth_date",
    "rookie_year",
    "years_exp",
    "is_active",
)

NAME_COLUMNS = ("full_name", "player_name", "display_name", "name")
TEAM_COLUMNS = ("team", "recent_team", "player_team")
POSITION_COLUMNS = ("position", "position_group", "pos")
JERSEY_COLUMNS = ("jersey_number", "jersey")
EXPERIENCE_COLUMNS = ("years_exp", "years_experience")
ACTIVE_STATUS_VALUES = {"ACT"}


def _find_first_column(df: pd.DataFrame, candidates: tuple[str, ...]) -> str | None:
    """Return the first matching column name from a dataframe."""
    for column in candidates:
        if column in df.columns:
            return column
    return None


def _normalize_name(value: object) -> str:
    """Create a stable text key for fallback matching."""
    if pd.isna(value):
        return ""

    normalized = str(value).strip().lower()
    normalized = "".join(
        char if char.isalnum() or char == " " else " " for char in normalized
    )
    return " ".join(normalized.split())


def _clean_int(value: object) -> int | None:
    """Convert a value to int when possible, otherwise return None."""
    if pd.isna(value):
        return None

    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _clean_date(value: object) -> str | None:
    """Convert a value to ISO date format when possible."""
    if pd.isna(value):
        return None

    parsed = pd.to_datetime(value, errors="coerce")
    if pd.isna(parsed):
        return None

    return parsed.date().isoformat()


def _clean_bool(value: object) -> bool:
    """Convert roster status values into a simple active flag."""
    if isinstance(value, bool):
        return value
    if pd.isna(value):
        return False
    return str(value).strip().upper() in ACTIVE_STATUS_VALUES


def _prepare_player_frame(rosters: pd.DataFrame) -> pd.DataFrame:
    """Map roster data into the app's player table fields."""
    roster = rosters.copy()

    name_col = _find_first_column(roster, NAME_COLUMNS)
    team_col = _find_first_column(roster, TEAM_COLUMNS)
    position_col = _find_first_column(roster, POSITION_COLUMNS)
    jersey_col = _find_first_column(roster, JERSEY_COLUMNS)
    experience_col = _find_first_column(roster, EXPERIENCE_COLUMNS)

    if name_col is None:
        raise ValueError("Could not find a player name column in roster data.")

    player_frame = pd.DataFrame()
    player_frame["canonical_name"] = roster[name_col].astype("string").str.strip()
    player_frame["normalized_name"] = player_frame["canonical_name"].map(_normalize_name)
    player_frame["primary_position"] = (
        roster[position_col].astype("string").str.strip() if position_col else None
    )
    player_frame["current_team"] = (
        roster[team_col].astype("string").str.strip() if team_col else None
    )
    player_frame["jersey_number"] = (
        roster[jersey_col].map(_clean_int) if jersey_col else None
    )
    player_frame["birth_date"] = (
        roster["birth_date"].map(_clean_date) if "birth_date" in roster.columns else None
    )
    player_frame["rookie_year"] = (
        roster["rookie_year"].map(_clean_int) if "rookie_year" in roster.columns else None
    )
    player_frame["years_exp"] = (
        roster[experience_col].map(_clean_int) if experience_col else None
    )
    player_frame["is_active"] = (
        roster["status"].map(_clean_bool) if "status" in roster.columns else True
    )

    player_frame = player_frame.dropna(subset=["canonical_name"])
    player_frame = player_frame[player_frame["canonical_name"].str.len() > 0]
    player_frame = player_frame.drop_duplicates(
        subset=["normalized_name", "current_team", "primary_position"],
        keep="first",
    )

    return player_frame


def fetch_player_table_source(roster_year: int) -> pd.DataFrame:
    """Fetch raw roster data and map it to the player table shape."""
    rosters = nfl.load_rosters(seasons=roster_year).to_pandas()
    return _prepare_player_frame(rosters)


def build_player_payloads(roster_year: int) -> list[dict]:
    """
    Build clean player payloads for `Connection.insert_player()` and
    `Connection.update_player_data()`.
    """
    player_frame = fetch_player_table_source(roster_year)
    payload_frame = player_frame.loc[:, PLAYER_DB_FIELDS].copy()

    # Convert pandas missing values (NaN, <NA>, NaT) into Python None
    payload_frame = payload_frame.astype(object).where(pd.notna(payload_frame), None)

    return payload_frame.to_dict(orient="records")


if __name__ == "__main__":
    payloads = build_player_payloads(roster_year=2026)
    print(payloads)