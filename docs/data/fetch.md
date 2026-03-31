# Fetch Layer

## Related Docs
- [Data Schema Proposal](/Users/jackbernstein-sheehan/Documents/projects/draft-lab/docs/data/data.md)
- [Players Table](/Users/jackbernstein-sheehan/Documents/projects/draft-lab/docs/data/players.md)
- [Update Strategy](/Users/jackbernstein-sheehan/Documents/projects/draft-lab/docs/data/updates.md)

## Purpose
[`fetch_data.py`](/Users/jackbernstein-sheehan/Documents/projects/draft-lab/src/data/fetch_data.py) is responsible for pulling player data from `nflreadpy` and converting it into clean payloads that match the fields expected by the database connection layer.

This module does not insert or update database rows directly. Its job is to:
- fetch raw roster data
- clean and normalize relevant player fields
- return payload dictionaries ready for `Connection.insert_player()` or `Connection.update_player_data()`

## Main Entry Point

```python
build_player_payloads(roster_year: int) -> list[dict]
```

This is the main function to call from the import/sync workflow.

It returns a list of player payloads shaped for the `players` table.

Example:

```python
[
    {
        "canonical_name": "Aaron Rodgers",
        "normalized_name": "aaron rodgers",
        "primary_position": "QB",
        "current_team": "PIT",
        "jersey_number": 8,
        "birth_date": "1983-12-02",
        "rookie_year": 2005,
        "years_exp": 21,
        "is_active": True,
    }
]
```

## Output Contract
The payloads returned by `build_player_payloads()` are designed to match the allowed fields in [`sql.py`](/Users/jackbernstein-sheehan/Documents/projects/draft-lab/src/data/sql.py).

Current payload fields:
- `canonical_name`
- `normalized_name`
- `primary_position`
- `current_team`
- `jersey_number`
- `birth_date`
- `rookie_year`
- `years_exp`
- `is_active`

## Module Flow

### `fetch_player_table_source(roster_year)`
Loads the roster dataset from `nflreadpy` and maps it into the app's player-table structure.

### `_prepare_player_frame(rosters)`
Builds a normalized dataframe with the app's player columns.

This method:
- finds the best available source columns for name, team, position, jersey number, and experience
- converts values into the target schema
- removes rows with missing player names
- removes duplicate rows using `normalized_name + current_team + primary_position`

### Cleaning Helpers
The helper methods keep the fetch logic consistent:
- `_normalize_name(value)` creates a stable fallback name key
- `_clean_int(value)` converts numeric-looking values to `int`
- `_clean_date(value)` converts date values to ISO format like `YYYY-MM-DD`
- `_clean_bool(value)` converts roster status into a simple `is_active` boolean

## Design Decisions

### Why This Module Only Handles Base Player Fields
This file is currently focused on the `players` table only.

That means it prepares stable player identity/profile fields, not changing fantasy snapshot values like:
- ADP
- projected points
- rank
- tier

Those time-varying values should eventually be handled by a separate snapshot-oriented fetch flow.

### Why the Fetch Layer Cleans the Data
The connection layer should not need to know about:
- upstream API column names
- data cleaning rules
- string normalization
- date parsing

That logic belongs here, so the DB layer can stay simple and operate on app-shaped data.

## Usage Example

```python
from data.fetch_data import build_player_payloads
from data.sql import Connection

payloads = build_player_payloads(roster_year=2026)

con = Connection()
try:
    for payload in payloads:
        con.insert_player(payload)
finally:
    con.close()
```

## Current Limitation
This module currently prepares insert/update payloads, but it does not yet:
- check whether a player already exists in the database
- match on external IDs
- diff payloads against existing rows
- perform batch inserts or updates

That orchestration should happen in a future sync/import workflow built on top of this fetch layer.
