# Mock Draft Engine

## Related Docs
- [Players Table](/Users/jackbernstein-sheehan/Documents/projects/draft-lab/docs/data/players.md)

## Purpose
The mock draft engine simulates a fantasy football draft. It manages the available player pool, team rosters, and pick processing. Source: [`src/services/mock_draft/mock.py`](/Users/jackbernstein-sheehan/Documents/projects/draft-lab/src/services/mock_draft/mock.py).

## `Player`

Immutable dataclass (`frozen=True, slots=True`). One instance per known player; updates produce new objects rather than mutating in place.

| Field | Type | Notes |
|---|---|---|
| `player_id` | `int` | Internal id from the `players` table. The only safe identity key. |
| `name` | `str` | `canonical_name` from the players table. |
| `position` | `Optional[str]` | QB / RB / WR / TE / K / DST. |
| `team` | `Optional[str]` | NFL team abbreviation. `None` for free agents. |
| `bye_week` | `Optional[int]` | Injected at load time; not stored on the `players` row. |
| `adp` | `Optional[float]` | Average draft position. Injected; no source wired yet. |
| `projected_points` | `Optional[float]` | Season projection. Not yet sourced. |
| `position_rank` | `Optional[int]` | e.g. WR7. Derived. |
| `tier` | `Optional[int]` | If tiering is enabled. |
| `injury_status` | `Optional[str]` | Q / D / O / IR / `None`. |
| `is_rookie` | `bool` | Defaults to `False`. |

Fields not on this class — headshot, jersey number, height/weight, college, stats, news — belong on a future `PlayerDetail` object lazy-loaded when the user clicks a row.

## `DraftBoard`

Holds draft state. Constructed with `num_teams` and `num_rounds`.

### State
- `available_players: dict[int, Player]` — keyed by `player_id` for O(1) lookup.
- `current_teams: dict[str, list[int]]` — team name → ordered list of picked `player_id`s (pick order is meaningful).

### Methods

#### `populate_players(players: Iterable[Player]) -> None`
Replace the available pool.

#### `create_team(name: str) -> None`
Add a team. Raises `ValueError` if the name is already taken.

#### `process_pick(player_id: int, team: str) -> Player`
Move a player from `available_players` onto a team's roster. Returns the picked `Player`. Raises `KeyError` if the team doesn't exist or the player isn't available.

#### `get_player(player_id: int) -> Optional[Player]`
Look up a still-available player by id.

#### `_pick_player(self)`
Stub for CPU pick logic — to be implemented once an ADP source is wired.

## Loaders

### `compute_bye_weeks(season: int) -> dict[str, int]`
Derives `{team_abbr: bye_week}` from `nfl.load_schedules(seasons=season)`.

### `load_players_from_db(connection, *, bye_weeks=None, adp=None, fantasy_positions=("QB","RB","WR","TE","K","DST")) -> list[Player]`
Reads the `players` table, filters to active fantasy-relevant players, and constructs `Player` objects. Bye weeks and ADP are injected by the caller — the loader does not know how to fetch them.

Example:
```python
from src.data.sql import Connection
from src.services.mock_draft.mock import (
    DraftBoard, compute_bye_weeks, load_players_from_db,
)

con = Connection()
byes = compute_bye_weeks(season=2026)
adp = {}  # populate from chosen ADP source
players = load_players_from_db(con, bye_weeks=byes, adp=adp)

draft = DraftBoard(num_teams=10, num_rounds=15)
draft.populate_players(players)
```

## Design Notes

### Why `Player` is immutable
Frozen dataclasses prevent accidental mutation as a `Player` reference flows between the board, rosters, and the (future) UI layer. ADP/projection refreshes should produce new `Player` instances rather than patch in place.

### Why ADP and bye_week are injected
External data providers (Sleeper, FantasyPros, ESPN) have not been chosen. Keeping the loader source-agnostic means changing providers requires changing only the fetch helper, not `mock.py`.

### Why `available_players` is keyed by `player_id`
The previous version matched players by display name, which is fragile (duplicate names across positions, "Jr." suffix variants). Using the internal `player_id` from the `players` table makes pick processing unambiguous and O(1).

## Open Items
- Choose an ADP source and add a `fetch_adp() -> dict[player_id, float]` helper.
- Implement `_pick_player` once ADP is available.
- Build a `PlayerDetail` object and a lazy `get_player_detail(player_id)` fetcher for the UI click flow.
- When `player_external_ids` is added (see [players doc](/Users/jackbernstein-sheehan/Documents/projects/draft-lab/docs/data/players.md)), revisit whether ADP should key off provider IDs rather than internal `player_id`.
