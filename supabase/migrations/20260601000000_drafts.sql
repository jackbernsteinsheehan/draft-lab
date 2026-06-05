-- Drafts: stores a completed/in-progress mock draft for an authenticated user.

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
