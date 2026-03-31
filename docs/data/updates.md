# Update Strategy

## Related Docs
- [Data Schema Proposal](/Users/jackbernstein-sheehan/Documents/projects/draft-lab/docs/data/data.md)
- [Players Table](/Users/jackbernstein-sheehan/Documents/projects/draft-lab/docs/data/players.md)
- [Fetch Layer](/Users/jackbernstein-sheehan/Documents/projects/draft-lab/docs/data/fetch.md)

## Goal
Keep player data current without depending on a single API to provide a perfect stream of every roster, injury, or ranking change.

## Recommendation
Use a snapshot-and-diff model.

Instead of asking "what changed?" from an outside API, the app should:
1. pull a fresh snapshot from the source
2. compare it to the most recent stored snapshot or current table values
3. update changed fields in the database
4. optionally log those changes for auditing and analysis

This is usually more reliable than waiting for one provider to expose a complete change feed.

## Why Not Rely on a Single Change API
There usually is not one clean source that covers all of the following well at the same time:
- roster moves
- injuries
- depth chart movement
- ADP changes
- projection changes
- team changes

Different sources are better at different parts of the problem, and some change data may be delayed, incomplete, or unavailable.

## Suggested Sources by Use Case

### Roster State
Use the roster and weekly roster datasets as the main source of truth for who is currently attached to a team.

Good for:
- active players
- current team
- roster status

### Fantasy Draft Context
Use rankings and projection snapshots for:
- projected points
- overall rank
- positional rank
- ADP

These should be treated as changing snapshot values, not permanent player attributes.

### Role and Usage Context
Use depth chart or similar data for:
- starter/backup context
- positional competition
- opportunity changes

### Injuries
Treat injuries as a status signal, not as core identity data.

Injury data is often the hardest thing to keep clean and current across free sources. It is better to treat injury status as a regularly refreshed field than build the system around assuming you will get a perfect injury event feed.

## Recommended Update Cadence

### Offseason
- refresh once per day

### Preseason and Training Camp
- refresh once or twice per day

### Regular Season
- refresh daily at minimum
- consider more frequent refreshes on heavy news days if rankings are important to the draft experience

## How Updates Should Flow

### Step 1: Fetch Fresh Data
Pull the latest clean player snapshot from the fetch layer.

Example fields:
- canonical name
- normalized name
- current team
- primary position
- active status
- jersey number
- birth date
- rookie year
- years experience

For rankings/projections, fetch those into a separate snapshot structure.

### Step 2: Match to Existing Players
For each incoming player:
1. try matching by trusted external ID
2. if no external ID match exists, fallback to normalized name + position + team
3. if no match is found, create a new player row

This is one reason the future `player_external_ids` table matters so much.

### Step 3: Compare Old and New Values
For matched players, compare only the tracked fields.

Examples:
- `current_team`
- `primary_position`
- `jersey_number`
- `is_active`

If nothing changed, do nothing.

If something changed, update that row.

### Step 4: Store Snapshot Data Separately
Do not overwrite rankings and projections directly into the `players` table if you want history.

Instead, store them in a separate snapshot table such as `player_snapshots`.

That allows you to answer questions like:
- what was this player's ADP last week?
- what rankings were used when a mock draft ran?

### Step 5: Optionally Log Changes
If you want auditability, add a change log table later.

Example:

```sql
player_change_log (
    change_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    player_id BIGINT NOT NULL,
    field_name VARCHAR(50) NOT NULL,
    old_value VARCHAR(255),
    new_value VARCHAR(255),
    source VARCHAR(50),
    detected_at DATETIME NOT NULL
)
```

This is optional for the first version, but useful later for debugging and analytics.

## What Should Live in `players` vs Snapshot Tables

### Keep in `players`
Fields that represent the latest stable identity or profile:
- canonical name
- normalized name
- current team
- primary position
- jersey number
- birth date
- rookie year
- years experience
- active flag

### Keep in snapshots
Fields that naturally change over time:
- ADP
- projected points
- overall rank
- positional rank
- tier
- injury designation if you want historical tracking

## Practical First Version
For the first working version of the app:
1. refresh the player import once per day
2. compare each incoming player to the current `players` row
3. call `update_player_data()` only when one of the tracked player fields changes
4. insert a fresh ranking/projection snapshot each import run

That gives you a simple, reliable update model without overengineering the first pass.

## Future Improvements
- add `player_external_ids`
- add `player_snapshots`
- add `player_change_log`
- add scheduled jobs for daily refreshes
- add source-specific freshness timestamps

## Summary
The best way to keep the data current is not to search for one API that documents every change.

The better design is:
- maintain stable player identity locally
- import fresh snapshots on a schedule
- diff against current values
- update only changed fields
- store time-varying fantasy data in snapshot tables
