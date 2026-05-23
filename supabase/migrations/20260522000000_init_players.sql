-- Initial schema: players and player_external_ids
-- Translated from src/db/sql.py (MySQL) to Postgres for Supabase.

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

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS players_set_updated_at ON players;
CREATE TRIGGER players_set_updated_at
BEFORE UPDATE ON players
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

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
