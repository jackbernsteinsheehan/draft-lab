-- Data freshness, phase 2: keep ranking history instead of overwriting.
--
-- Previously player_rankings was unique on
-- (player_id, source, scoring, ecr_type, season), so re-seeding replaced the
-- season's row and no ADP history survived. Add scrape_date to the key so each
-- day's snapshot accumulates; same-day re-runs stay idempotent.
--
-- Safe to re-run: backfills nulls, drops/recreates the constraint and index.

-- Backfill any legacy rows missing a scrape_date so the column can be NOT NULL.
UPDATE player_rankings SET scrape_date = CURRENT_DATE WHERE scrape_date IS NULL;

ALTER TABLE player_rankings ALTER COLUMN scrape_date SET NOT NULL;

ALTER TABLE player_rankings DROP CONSTRAINT IF EXISTS uq_player_rankings;
ALTER TABLE player_rankings
    ADD CONSTRAINT uq_player_rankings
    UNIQUE (player_id, source, scoring, ecr_type, season, scrape_date);

-- "Latest snapshot" lookups order by scrape_date DESC within a source/scoring.
CREATE INDEX IF NOT EXISTS idx_player_rankings_latest
    ON player_rankings (source, scoring, ecr_type, scrape_date DESC);
