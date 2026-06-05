-- Player rankings: ECR/ADP snapshots, currently sourced from FantasyPros via
-- nflverse (`nflreadpy.load_ff_rankings`). Re-runnable: we upsert on
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
