-- pgTAP: structural assertions for the schema from migrations 0001 + 0002.
-- Run with: supabase test db

BEGIN;
SELECT plan(22);

-- ── Tables exist ──────────────────────────────────────────────────────────
SELECT has_table('public', 'players', 'players table exists');
SELECT has_table('public', 'player_external_ids', 'player_external_ids table exists');
SELECT has_table('public', 'player_rankings', 'player_rankings table exists');
SELECT has_table('public', 'drafts', 'drafts table exists');

-- ── players ───────────────────────────────────────────────────────────────
SELECT has_column('public', 'players', 'player_id', 'players.player_id exists');
SELECT col_is_pk('public', 'players', 'player_id', 'players.player_id is PK');
SELECT col_not_null('public', 'players', 'canonical_name', 'players.canonical_name NOT NULL');
SELECT col_is_unique(
  'public', 'players',
  ARRAY['normalized_name', 'current_team', 'primary_position'],
  'players name/team/position is unique'
);

-- ── player_external_ids (phase 1: stable id mappings) ─────────────────────
SELECT col_is_pk(
  'public', 'player_external_ids',
  ARRAY['player_id', 'provider'],
  'player_external_ids PK is (player_id, provider)'
);
SELECT col_is_unique(
  'public', 'player_external_ids',
  ARRAY['provider', 'external_id'],
  'player_external_ids (provider, external_id) is unique'
);
SELECT col_is_fk('public', 'player_external_ids', 'player_id',
  'player_external_ids.player_id is a FK');

-- ── player_rankings (phase 2: history keyed by scrape_date) ───────────────
SELECT has_column('public', 'player_rankings', 'scrape_date', 'player_rankings.scrape_date exists');
SELECT col_not_null('public', 'player_rankings', 'scrape_date',
  'player_rankings.scrape_date is NOT NULL (phase 2)');
SELECT col_is_unique(
  'public', 'player_rankings',
  ARRAY['player_id', 'source', 'scoring', 'ecr_type', 'season', 'scrape_date'],
  'player_rankings uniqueness includes scrape_date (phase 2)'
);
SELECT has_index('public', 'player_rankings', 'idx_player_rankings_latest',
  'player_rankings has the latest-snapshot index (phase 2)');
SELECT col_is_fk('public', 'player_rankings', 'player_id',
  'player_rankings.player_id is a FK');

-- ── drafts ────────────────────────────────────────────────────────────────
SELECT has_column('public', 'drafts', 'picks', 'drafts.picks exists');
SELECT col_type_is('public', 'drafts', 'picks', 'jsonb', 'drafts.picks is jsonb');

-- ── RLS enabled on all four tables ────────────────────────────────────────
SELECT is(relrowsecurity, true, 'RLS enabled on ' || relname)
FROM pg_class
WHERE relkind = 'r'
  AND relnamespace = 'public'::regnamespace
  AND relname IN ('players', 'player_external_ids', 'player_rankings', 'drafts')
ORDER BY relname;

SELECT * FROM finish();
ROLLBACK;
