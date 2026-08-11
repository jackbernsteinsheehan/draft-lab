# Data Freshness Plan

## Related Docs
- [Update Strategy](/Users/jackbernstein-sheehan/Documents/projects/draft-lab/docs/data/updates.md)
- [Fetch Layer](/Users/jackbernstein-sheehan/Documents/projects/draft-lab/docs/data/fetch.md)
- [Players Table](/Users/jackbernstein-sheehan/Documents/projects/draft-lab/docs/data/players.md)

## Goal
Keep player and ranking data current automatically, without duplicating players
on roster moves and without losing historical ADP.

Three decisions locked in:
1. **Fix the team-change bug** by matching players on a stable external ID.
2. **Keep ranking history** (snapshot ADP over time, not overwrite).
3. **Schedule a daily refresh** via GitHub Actions.

---

## Problem 1: Team changes create duplicate players

`scripts/seed_supabase.py` upserts players with
`on_conflict="normalized_name,current_team,primary_position"`. When a player
changes teams, the conflict key changes, so the upsert **inserts a new row**
instead of updating the existing player. Roster moves — the main thing we're
refreshing for — silently duplicate.

### Fix: match on `gsis_id` via `player_external_ids`

nflverse rosters already expose a stable `gsis_id` (confirmed present alongside
`espn_id`, `sleeper_id`, `sportradar_id`, etc.). The `player_external_ids` table
already exists but is unpopulated.

**Phase 1a — carry the ID through the fetch layer** (`src/data/fetch_data.py`)
- Add `gsis_id` to the extracted columns (source column `gsis_id`) and to the
  payload returned by `build_player_payloads`. Keep it separate from
  `PLAYER_DB_FIELDS` since it belongs in `player_external_ids`, not `players`.

**Phase 1b — backfill mappings for existing rows** *(folded into 1c, no separate script)*
- On the first ID-aware run the gsis→player_id map is empty, so every player
  takes the "unmapped" path: it's upserted on the name key (matching the
  existing row and returning its `player_id`), then a
  `(player_id, provider='nflverse', external_id=gsis_id)` mapping is written.
- This backfills mappings automatically; subsequent runs match by `gsis_id`.

**Phase 1c — switch the sync to ID-based matching** (`scripts/seed_supabase.py`)
- Load existing `player_external_ids` for `provider='nflverse'` into a
  `gsis_id -> player_id` map.
- For each incoming roster player:
  - If `gsis_id` maps to an existing `player_id` → **update** that `players` row
    (this is where a team change now correctly updates instead of duplicating).
  - Else → **insert** the `players` row, then insert the `player_external_ids`
    mapping.
- Players with no `gsis_id` fall back to the current name+team+position upsert.

The existing unique constraint on `(normalized_name, current_team,
primary_position)` stays as a backstop but is no longer the primary match key.

---

## Problem 2: Rankings overwrite instead of accumulating

`player_rankings` is unique on
`(player_id, source, scoring, ecr_type, season)`. Re-running `seed_rankings.py`
overwrites the season's row, so we can't answer "what was this player's ADP last
week?" or "what ADP did this saved draft use?".

### Fix: add `scrape_date` to the uniqueness key

**Migration `0002_*.sql`**
- Make `scrape_date` `NOT NULL`.
- Replace `uq_player_rankings` with
  `UNIQUE (player_id, source, scoring, ecr_type, season, scrape_date)`.
- Add index on `(source, scoring, ecr_type, scrape_date DESC)` for
  "latest snapshot" queries.

**`scripts/seed_rankings.py`**
- Change `ON_CONFLICT` to include `scrape_date`. Same-day re-runs stay
  idempotent; different days accumulate into history.

**`web/src/lib/adp-resolve.ts`** — required, not optional
- Currently orders by `season` desc only and takes the first row per player.
  With multiple `scrape_date`s per season this picks an arbitrary snapshot.
- Order by `scrape_date` desc (then `season` desc) so the "current ADP" always
  reflects the newest snapshot.

Note: this does **not** retroactively pin ADP onto already-saved drafts (that
would need a `scrape_date`/`ranking_snapshot` column on `drafts`) — out of scope
here, but the history table is the prerequisite for it later.

---

## Problem 3: Nothing runs on a schedule

Today both seeders are run by hand. "Fresh" ultimately means a cron job.

### Fix: daily GitHub Actions workflow

**`requirements.txt`** (new — none exists today)
- Pin the runtime deps the seeders import: `nflreadpy`, `pandas`, `supabase`,
  `python-dotenv`.

**`.github/workflows/refresh-data.yml`**
- Triggers: `schedule` (daily cron, e.g. `0 9 * * *` UTC) + `workflow_dispatch`
  for manual runs.
- Steps: checkout → `setup-python` → `pip install -r requirements.txt` →
  `python scripts/seed_supabase.py` → `python scripts/seed_rankings.py`.
- Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` as encrypted repo
  secrets (service-role key stays server-side; never in the web bundle).

### Cost
Free for this use case: public repos get unlimited Actions minutes; private
repos get 2,000 min/month. A daily run of both seeders is ~3–5 min
(~90–150 min/month). Caveats: scheduled runs can be delayed under load (fine for
daily), and cron pauses after 60 days of repo inactivity (non-issue while
active).

### Cadence
Daily is sufficient per `updates.md` (offseason/preseason). Can bump to twice
daily on heavy-news days later by adjusting the cron.

---

## Sequencing
1. **Phase 2 (rankings history)** — self-contained, lowest risk, immediate value.
2. **Phase 1 (external IDs)** — 1a fetch → 1b backfill → 1c ID-based sync, in order.
3. **Phase 3 (scheduling)** — wire the Action once both seeders are correct, so
   we're not automating a script that still duplicates on team changes.

## Tests
pgTAP tests under `supabase/tests/` (run with `supabase test db`):
- `schema_test.sql` — structural assertions for both migrations (tables, keys,
  the scrape_date-inclusive uniqueness on `player_rankings`, RLS enabled).
- `ranking_history_test.sql` — behavioral: multiple scrape_dates accumulate,
  duplicate same-day snapshots are rejected.

## Out of scope (future)
- `player_change_log` audit table.
- Pinning the ranking snapshot used onto each saved draft.
- Injury/depth-chart fields.
- Improving `seed_rankings.py` matching to use external IDs too (still name-based).
