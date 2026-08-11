-- pgTAP: behavioral test for phase-2 ranking history.
-- Verifies that scrape_date is part of the uniqueness key: multiple snapshots
-- per season accumulate, while a duplicate same-day snapshot is rejected.
-- Run with: supabase test db

BEGIN;
SELECT plan(3);

-- Setup: one player to attach rankings to (rolled back at end).
INSERT INTO players (canonical_name, normalized_name, primary_position, current_team)
VALUES ('Test Player', 'test player', 'WR', 'KC');

-- Two snapshots for the same player/season on different dates → both persist.
SELECT lives_ok($$
  INSERT INTO player_rankings
    (player_id, source, scoring, ecr_type, season, adp, scrape_date)
  VALUES
    ((SELECT player_id FROM players WHERE normalized_name = 'test player'),
     'fantasypros', 'half', 'draft', 2026, 10.0, DATE '2026-08-01'),
    ((SELECT player_id FROM players WHERE normalized_name = 'test player'),
     'fantasypros', 'half', 'draft', 2026, 11.0, DATE '2026-08-02')
$$, 'two scrape_dates for the same player/season both insert (history accrues)');

SELECT is(
  (SELECT count(*)::int FROM player_rankings
     WHERE player_id = (SELECT player_id FROM players WHERE normalized_name = 'test player')),
  2,
  'both daily snapshots are retained'
);

-- A second row for an existing scrape_date violates the unique constraint.
SELECT throws_ok($$
  INSERT INTO player_rankings
    (player_id, source, scoring, ecr_type, season, adp, scrape_date)
  VALUES
    ((SELECT player_id FROM players WHERE normalized_name = 'test player'),
     'fantasypros', 'half', 'draft', 2026, 12.0, DATE '2026-08-01')
$$, '23505', NULL, 'duplicate same-day snapshot is rejected (idempotent re-run)');

SELECT * FROM finish();
ROLLBACK;
