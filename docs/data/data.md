# Data Schema Proposal

## Goals
- Store a clean player pool for mock drafts.
- Store fantasy-relevant rankings and projections that change over time.
- Store user mock drafts in a way that is easy to query later.
- Avoid coupling the whole app to one outside API's player identifier format.

## Recommendation
Use your own internal player key as the main foreign key in your database.

Do not use player name as the join key. Names are not stable enough because:
- multiple players can share the same name
- sources format names differently
- suffixes and punctuation vary
- a player's display name can change over time

Also do not make one external API ID the core database key. External IDs are useful, but different sources use different IDs and some sources can be incomplete.

The safest pattern is:
- create a `players` table with your own internal `player_id`
- create a `player_external_ids` table that maps your `player_id` to `gsis_id`, `espn_id`, `yahoo_id`, `sleeper_id`, `pfr_id`, and any others you care about
- have all app tables reference your internal `player_id`

## Core Tables

### `players`
One row per real player in your system.

Suggested columns:
- `player_id` BIGINT PRIMARY KEY AUTO_INCREMENT
- `canonical_name` VARCHAR(100) NOT NULL
- `normalized_name` VARCHAR(100) NOT NULL
- `primary_position` VARCHAR(10)
- `current_team` VARCHAR(10)
- `jersey_number` INT
- `birth_date` DATE
- `rookie_year` INT
- `years_exp` INT
- `is_active` BOOLEAN NOT NULL DEFAULT TRUE
- `created_at` DATETIME NOT NULL
- `updated_at` DATETIME NOT NULL

Notes:
- `canonical_name` is the display name you want to show in the app.
- `normalized_name` is for matching/import cleanup only.
- `current_team` and `is_active` describe the latest known state, not historical truth for every season.

### `player_external_ids`
Maps your internal player to IDs from outside systems.

Suggested columns:
- `player_id` BIGINT NOT NULL
- `source` VARCHAR(50) NOT NULL
- `external_id` VARCHAR(100) NOT NULL
- `created_at` DATETIME NOT NULL

Constraints:
- PRIMARY KEY (`source`, `external_id`)
- UNIQUE (`player_id`, `source`)
- FOREIGN KEY (`player_id`) REFERENCES `players`(`player_id`)

Suggested `source` values:
- `nfl_gsis`
- `espn`
- `yahoo`
- `sleeper`
- `pfr`
- `pff`
- `fantasypros`

Notes:
- This is the table that keeps you flexible across APIs.
- If you later change data providers, your app tables do not need to change.

### `player_snapshots`
One row per player per import run. This stores current fantasy context like ADP and projections without overwriting history.

Suggested columns:
- `snapshot_id` BIGINT PRIMARY KEY AUTO_INCREMENT
- `snapshot_date` DATE NOT NULL
- `season` INT NOT NULL
- `player_id` BIGINT NOT NULL
- `team` VARCHAR(10)
- `position` VARCHAR(10)
- `projected_points` DECIMAL(10,2)
- `projected_points_ppr` DECIMAL(10,2)
- `overall_rank` INT
- `position_rank` INT
- `adp` DECIMAL(10,2)
- `tier` INT
- `source` VARCHAR(50) NOT NULL
- `created_at` DATETIME NOT NULL

Constraints:
- UNIQUE (`snapshot_date`, `source`, `player_id`)
- FOREIGN KEY (`player_id`) REFERENCES `players`(`player_id`)

Notes:
- This should hold values that change frequently.
- If you import rankings every day, this table becomes your ranking history.
- `source` matters because rankings from different systems are not the same thing.

### `player_season_stats`
One row per player per season for completed or in-progress season totals.

Suggested columns:
- `player_id` BIGINT NOT NULL
- `season` INT NOT NULL
- `season_type` VARCHAR(10) NOT NULL
- `team` VARCHAR(10)
- `position` VARCHAR(10)
- `games` INT
- `fantasy_points` DECIMAL(10,2)
- `fantasy_points_ppr` DECIMAL(10,2)
- `passing_yards` DECIMAL(10,2)
- `passing_tds` DECIMAL(10,2)
- `rushing_yards` DECIMAL(10,2)
- `rushing_tds` DECIMAL(10,2)
- `receptions` DECIMAL(10,2)
- `receiving_yards` DECIMAL(10,2)
- `receiving_tds` DECIMAL(10,2)
- `created_at` DATETIME NOT NULL
- `updated_at` DATETIME NOT NULL

Constraints:
- PRIMARY KEY (`player_id`, `season`, `season_type`)
- FOREIGN KEY (`player_id`) REFERENCES `players`(`player_id`)

Notes:
- Start with only the stat columns you actually need.
- You do not need to mirror every upstream stat field on day one.

## Draft Tables

### `mock_drafts`
One row per mock draft.

Suggested columns:
- `draft_id` BIGINT PRIMARY KEY AUTO_INCREMENT
- `user_id` VARCHAR(100) NOT NULL
- `created_at` DATETIME NOT NULL
- `draft_type` VARCHAR(20) NOT NULL
- `num_teams` INT NOT NULL
- `scoring_format` VARCHAR(20)
- `roster_format` VARCHAR(50)
- `source_snapshot_date` DATE

Notes:
- `source_snapshot_date` lets you know which rankings/projections were used when the draft was run.

### `mock_draft_picks`
One row per draft pick.

Suggested columns:
- `draft_id` BIGINT NOT NULL
- `pick_number` INT NOT NULL
- `round_number` INT NOT NULL
- `team_slot` INT NOT NULL
- `player_id` BIGINT NOT NULL
- `player_team_at_draft` VARCHAR(10)
- `player_position_at_draft` VARCHAR(10)
- `created_at` DATETIME NOT NULL

Constraints:
- PRIMARY KEY (`draft_id`, `pick_number`)
- FOREIGN KEY (`draft_id`) REFERENCES `mock_drafts`(`draft_id`)
- FOREIGN KEY (`player_id`) REFERENCES `players`(`player_id`)

Notes:
- Store `player_team_at_draft` and `player_position_at_draft` if you want historical draft results to remain understandable even after player team changes.
- Do not store only the player name here.

## Why This Scales Better
- Player metadata is stored once.
- Draft picks stay small and easy to query.
- Rankings and projections can be refreshed without overwriting prior values.
- New APIs can be added through `player_external_ids` instead of forcing a schema rewrite.

This should scale comfortably for a fantasy draft app. The row counts are small by database standards, and the schema is relational in a way that supports analytics later.

## How To Choose the Internal `player_id`
Use an auto-increment integer or UUID generated by your app.

Recommended choice:
- `player_id` BIGINT AUTO_INCREMENT

Why:
- simple
- fast joins
- easy to debug
- decoupled from upstream providers

Then, when importing a player:
1. Try to match on trusted external IDs first, especially `gsis_id`.
2. If no external ID match exists, try a fallback match using normalized name plus position plus team.
3. If still no match exists, create a new row in `players`.
4. Insert any new outside IDs into `player_external_ids`.

## Best External ID to Prefer
If your current pipeline is mostly `nflreadpy`, prefer `gsis_id` as your best upstream identifier when available.

Why `gsis_id` is a good default:
- it is NFL-native
- it appears widely in nflverse data
- it is better for identity than player display name

But it still should not be your database primary key. It should be your strongest matching key inside `player_external_ids`.

## Minimal First Version
If you want to keep the first implementation small, start with just:
- `players`
- `player_external_ids`
- `player_snapshots`
- `mock_drafts`
- `mock_draft_picks`

You can add `player_season_stats` after the draft flow is working.

## Suggested Import Flow
1. Pull roster data and rankings/projections.
2. Match each imported player to an internal `player_id`.
3. Upsert the `players` table.
4. Upsert the `player_external_ids` table.
5. Insert a new `player_snapshots` batch for that day.

This gives you a clean operational model and leaves room to grow into stronger analysis later.
