-- Draft Lab schema: players, player_external_ids, player_rankings, drafts, and
-- their RLS policies. No seed or demo data. Everything uses IF NOT EXISTS /
-- DROP ... IF EXISTS, so it's safe to re-run against an existing database.
--
-- To rebuild from scratch, uncomment the teardown block below, or run
-- `supabase db reset` to drop the database and replay this file.

-- Teardown (optional):
-- DROP TABLE IF EXISTS drafts CASCADE;
-- DROP TABLE IF EXISTS player_rankings CASCADE;
-- DROP TABLE IF EXISTS player_external_ids CASCADE;
-- DROP TABLE IF EXISTS players CASCADE;
-- DROP FUNCTION IF EXISTS set_updated_at() CASCADE;

-- Extensions: gen_random_uuid() for drafts.id.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Shared updated_at trigger function.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Canonical player identities. Translated from src/db/sql.py (MySQL) to Postgres.
CREATE TABLE IF NOT EXISTS players (
    player_id        BIGSERIAL PRIMARY KEY,
    canonical_name   VARCHAR(100) NOT NULL,
    normalized_name  VARCHAR(100) NOT NULL,
    primary_position VARCHAR(10),
    current_team     VARCHAR(10),
    jersey_number    INT,
    birth_date       DATE,
    rookie_year      INT,
    years_exp        INT,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_players_normalized_name_team_position
        UNIQUE (normalized_name, current_team, primary_position)
);

CREATE INDEX IF NOT EXISTS idx_players_canonical_name   ON players (canonical_name);
CREATE INDEX IF NOT EXISTS idx_players_current_team     ON players (current_team);
CREATE INDEX IF NOT EXISTS idx_players_primary_position ON players (primary_position);
CREATE INDEX IF NOT EXISTS idx_players_is_active        ON players (is_active);

DROP TRIGGER IF EXISTS players_set_updated_at ON players;
CREATE TRIGGER players_set_updated_at
BEFORE UPDATE ON players
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- External provider ID mappings (nflverse, sleeper, etc.).
CREATE TABLE IF NOT EXISTS player_external_ids (
    player_id   BIGINT NOT NULL REFERENCES players (player_id) ON DELETE CASCADE,
    provider    VARCHAR(32) NOT NULL,
    external_id VARCHAR(64) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (player_id, provider),
    CONSTRAINT uq_provider_external_id UNIQUE (provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_player_external_ids_player_id
    ON player_external_ids (player_id);

DROP TRIGGER IF EXISTS player_external_ids_set_updated_at ON player_external_ids;
CREATE TRIGGER player_external_ids_set_updated_at
BEFORE UPDATE ON player_external_ids
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Reference data: anyone can read, writes restricted to service role.
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_external_ids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "players are public read" ON players;
CREATE POLICY "players are public read"
    ON players FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "player_external_ids are public read" ON player_external_ids;
CREATE POLICY "player_external_ids are public read"
    ON player_external_ids FOR SELECT
    USING (true);

-- Player rankings: ECR/ADP snapshots, sourced from FantasyPros via nflverse
-- (`nflreadpy.load_ff_rankings`). Re-runnable: seeders upsert on
-- (player_id, source, scoring, ecr_type, season).
CREATE TABLE IF NOT EXISTS player_rankings (
    id             BIGSERIAL PRIMARY KEY,
    player_id      BIGINT NOT NULL REFERENCES players (player_id) ON DELETE CASCADE,
    source         TEXT NOT NULL,            -- e.g. 'fantasypros'
    scoring        TEXT NOT NULL,            -- 'std' | 'half' | 'ppr'
    ecr_type       TEXT NOT NULL,            -- 'draft' | 'weekly' | 'ros' | ...
    season         INT  NOT NULL,
    ecr            NUMERIC(7,2),             -- expert consensus rank
    adp            NUMERIC(7,2),
    position_rank  INT,
    tier           INT,
    best_rank      INT,
    worst_rank     INT,
    std_dev        NUMERIC(7,2),
    scrape_date    DATE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_player_rankings
        UNIQUE (player_id, source, scoring, ecr_type, season)
);

CREATE INDEX IF NOT EXISTS idx_player_rankings_player_id ON player_rankings (player_id);
CREATE INDEX IF NOT EXISTS idx_player_rankings_lookup
    ON player_rankings (source, scoring, ecr_type, season);
CREATE INDEX IF NOT EXISTS idx_player_rankings_adp ON player_rankings (adp);

DROP TRIGGER IF EXISTS player_rankings_set_updated_at ON player_rankings;
CREATE TRIGGER player_rankings_set_updated_at
BEFORE UPDATE ON player_rankings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE player_rankings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "player_rankings are public read" ON player_rankings;
CREATE POLICY "player_rankings are public read"
    ON player_rankings FOR SELECT
    USING (true);

-- Drafts: a saved mock draft for an authenticated user.
CREATE TABLE IF NOT EXISTS drafts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    num_teams     INT NOT NULL,
    num_rounds    INT NOT NULL,
    user_slot     INT NOT NULL,
    user_team     TEXT NOT NULL,
    -- Array of { overall, round, slot, team, player_id }.
    picks         JSONB NOT NULL,
    -- Primary classified strategy (e.g. "Zero RB", "Robust RB", "Hero RB", "Balanced").
    strategy      TEXT,
    -- All matched strategy tags (e.g. ["Zero RB", "Early QB"]).
    strategy_tags TEXT[] NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drafts_user_id    ON drafts (user_id);
CREATE INDEX IF NOT EXISTS idx_drafts_strategy   ON drafts (strategy);
CREATE INDEX IF NOT EXISTS idx_drafts_created_at ON drafts (created_at DESC);

DROP TRIGGER IF EXISTS drafts_set_updated_at ON drafts;
CREATE TRIGGER drafts_set_updated_at
BEFORE UPDATE ON drafts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drafts owner select" ON drafts;
CREATE POLICY "drafts owner select"
    ON drafts FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "drafts owner insert" ON drafts;
CREATE POLICY "drafts owner insert"
    ON drafts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "drafts owner update" ON drafts;
CREATE POLICY "drafts owner update"
    ON drafts FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "drafts owner delete" ON drafts;
CREATE POLICY "drafts owner delete"
    ON drafts FOR DELETE
    USING (auth.uid() = user_id);
