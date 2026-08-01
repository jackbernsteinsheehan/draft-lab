from dataclasses import dataclass
from typing import Callable, Iterable, Iterator, Optional

import nflreadpy as nfl
import pandas as pd

'''
==== Functionality for running a mock draft. Player and DraftBoard classes, helper functions ====
'''

@dataclass(frozen=True, slots=True)
class Player:
    player_id: int
    name: str
    position: Optional[str] = None
    team: Optional[str] = None
    bye_week: Optional[int] = None
    adp: Optional[float] = None
    projected_points: Optional[float] = None
    position_rank: Optional[int] = None
    tier: Optional[int] = None
    injury_status: Optional[str] = None
    is_rookie: bool = False


class DraftBoard:
    def __init__(self, num_teams: int, num_rounds: int):
        self.num_teams = num_teams
        self.num_rounds = num_rounds

        self.available_players: dict[int, Player] = {}
        self.current_teams: dict[str, list[int]] = {}

    def populate_players(self, players: Iterable[Player]) -> None:
        """Set the available pool. Keyed by player_id for O(1) lookups."""
        self.available_players = {p.player_id: p for p in players}

    def create_team(self, name: str) -> None:
        if name in self.current_teams:
            raise ValueError(f"team name already in use: {name}")
        self.current_teams[name] = []

    def process_pick(self, player_id: int, team: str) -> Player:
        """Move a player from the pool onto a team's roster. Returns the picked Player."""
        if team not in self.current_teams:
            raise KeyError(f"team not found: {team}")
        if player_id not in self.available_players:
            raise KeyError(f"player not available: {player_id}")

        player = self.available_players.pop(player_id)
        self.current_teams[team].append(player_id)
        return player

    def get_player(self, player_id: int) -> Optional[Player]:
        return self.available_players.get(player_id)

    def _pick_player(self):
        pass


# ____________________ Draft Driver ____________________ #

def snake_order(draft_order: list[str], num_rounds: int) -> Iterator[tuple[int, int, str]]:
    """Yield (overall_pick, round, team) for a snake draft.

    Round 1 walks `draft_order` forward, round 2 reverses, and so on.
    """
    overall = 0
    for rnd in range(1, num_rounds + 1):
        slots = draft_order if rnd % 2 == 1 else list(reversed(draft_order))
        for team in slots:
            overall += 1
            yield overall, rnd, team


def run_draft(
    board: DraftBoard,
    draft_order: list[str],
    user_team: str,
    cpu_pick_fn: Callable[[DraftBoard, str], int],
    user_pick_fn: Callable[[DraftBoard, str, int, int], int],
) -> None:
    """Drive a snake draft to completion.

    `draft_order` is the list of team names in slot order (slot 1 .. slot N).
    Every team in `draft_order` must already exist on the board.
    `cpu_pick_fn(board, team) -> player_id` chooses a CPU pick.
    `user_pick_fn(board, team, overall_pick, round) -> player_id` chooses the user's pick.
    Both functions must return an available `player_id`; `process_pick` enforces it.
    """
    if user_team not in draft_order:
        raise ValueError(f"user_team {user_team!r} not in draft_order")
    if len(set(draft_order)) != len(draft_order):
        raise ValueError("draft_order contains duplicate team names")
    missing = [t for t in draft_order if t not in board.current_teams]
    if missing:
        raise KeyError(f"teams not on board: {missing}")
    if len(draft_order) != board.num_teams:
        raise ValueError(
            f"draft_order has {len(draft_order)} teams, board expects {board.num_teams}"
        )

    for overall, rnd, team in snake_order(draft_order, board.num_rounds):
        if team == user_team:
            pid = user_pick_fn(board, team, overall, rnd)
        else:
            pid = cpu_pick_fn(board, team)
        board.process_pick(pid, team)


# ____________________ Loaders ____________________ #

def compute_bye_weeks(season: int) -> dict[str, int]:
    """Derive a {team_abbr: bye_week} map from the season schedule."""
    schedule = nfl.load_schedules(seasons=season).to_pandas()
    weeks = set(schedule["week"].dropna().astype(int).unique())

    byes: dict[str, int] = {}
    for team in pd.unique(pd.concat([schedule["home_team"], schedule["away_team"]])):
        if pd.isna(team):
            continue
        played = set(
            schedule.loc[
                (schedule["home_team"] == team) | (schedule["away_team"] == team),
                "week",
            ].dropna().astype(int)
        )
        missing = weeks - played
        if len(missing) == 1:
            byes[str(team)] = missing.pop()
    return byes


def load_players_from_db(
    connection,
    *,
    bye_weeks: Optional[dict[str, int]] = None,
    adp: Optional[dict[int, float]] = None,
    fantasy_positions: Iterable[str] = ("QB", "RB", "WR", "TE", "K", "DST"),
) -> list[Player]:
    """Build a list of Player objects from the `players` table.

    `bye_weeks` and `adp` are injected by the caller so this loader stays
    decoupled from whichever external source provides them.
    """
    bye_weeks = bye_weeks or {}
    adp = adp or {}
    positions = tuple(fantasy_positions)

    placeholders = ", ".join(["%s"] * len(positions))
    rows = connection.fetch_all(
        f"""
        SELECT player_id, canonical_name, primary_position, current_team, rookie_year, years_exp
        FROM players
        WHERE is_active = TRUE
          AND primary_position IN ({placeholders})
        """,
        params=positions,
    )

    players: list[Player] = []
    for row in rows:
        team = row["current_team"]
        players.append(
            Player(
                player_id=int(row["player_id"]),
                name=row["canonical_name"],
                position=row["primary_position"],
                team=team,
                bye_week=bye_weeks.get(team) if team else None,
                adp=adp.get(int(row["player_id"])),
                is_rookie=(row["years_exp"] in (0, None) and row["rookie_year"] is not None),
            )
        )
    return players
