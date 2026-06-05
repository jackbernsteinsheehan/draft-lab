-- Seed mock drafts for a deterministic test user.
--
-- Creates (idempotently):
--   * an auth.users row for test@draftlab.local / password "testtest123"
--   * one drafts row per scripted strategy below
--
-- Player IDs are resolved from the `players` table at apply time; this
-- migration is a no-op for a given strategy if the player table is empty or
-- if a draft for that strategy already exists for the test user.

DO $$
DECLARE
    v_user_id       UUID;
    v_email         TEXT := 'test@draftlab.local';
    v_password      TEXT := 'testtest123';
    v_num_teams     INT  := 12;
    v_num_rounds    INT  := 15;
    v_user_slot     INT  := 1;
    v_user_team     TEXT := 'You';

    qb_ids  BIGINT[];
    rb_ids  BIGINT[];
    wr_ids  BIGINT[];
    te_ids  BIGINT[];
    k_ids   BIGINT[];
    dst_ids BIGINT[];

    -- Per-draft scripts: 15 positions for the user's picks, one row per strategy.
    scripts JSONB := $j$[
        {
            "strategy": "Zero RB",
            "tags": ["Zero RB", "Late QB"],
            "positions": ["WR","WR","WR","WR","RB","TE","RB","WR","RB","WR","RB","QB","TE","DST","K"]
        },
        {
            "strategy": "Robust RB",
            "tags": ["Robust RB", "Late QB"],
            "positions": ["RB","RB","WR","RB","WR","WR","TE","WR","RB","WR","QB","TE","WR","DST","K"]
        },
        {
            "strategy": "Hero RB",
            "tags": ["Hero RB", "Late QB"],
            "positions": ["RB","WR","WR","WR","WR","TE","QB","RB","WR","RB","RB","TE","WR","DST","K"]
        },
        {
            "strategy": "Balanced",
            "tags": ["Balanced", "Late QB"],
            "positions": ["RB","WR","RB","WR","TE","QB","WR","RB","RB","WR","WR","TE","QB","DST","K"]
        },
        {
            "strategy": "WR Heavy",
            "tags": ["WR Heavy", "Early QB"],
            "positions": ["WR","WR","QB","WR","RB","RB","TE","WR","RB","RB","WR","TE","QB","DST","K"]
        },
        {
            "strategy": "WR Hammer",
            "tags": ["WR Hammer", "Late QB"],
            "positions": ["WR","WR","WR","WR","WR","RB","RB","QB","TE","RB","RB","TE","WR","DST","K"]
        },
        {
            "strategy": "Early TE",
            "tags": ["Early TE", "Late QB"],
            "positions": ["RB","WR","TE","RB","WR","WR","RB","WR","QB","WR","RB","TE","WR","DST","K"]
        }
    ]$j$::jsonb;

    script         JSONB;
    positions_arr  JSONB;
    pos            TEXT;
    pool_ids       BIGINT[];
    pool_index     INT;
    counters       JSONB;
    picks          JSONB;
    pick_obj       JSONB;
    r              INT;
    slot           INT;
    overall        INT;
    chosen_id      BIGINT;
    have_players   BOOLEAN;
BEGIN
    -- 1. Ensure test auth user exists.
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;
    IF v_user_id IS NULL THEN
        v_user_id := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, created_at, updated_at,
            raw_app_meta_data, raw_user_meta_data,
            is_sso_user, is_anonymous,
            confirmation_token, recovery_token,
            email_change_token_new, email_change_token_current, email_change,
            phone_change, phone_change_token, reauthentication_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            v_user_id,
            'authenticated', 'authenticated',
            v_email,
            crypt(v_password, gen_salt('bf')),
            NOW(), NOW(), NOW(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{}'::jsonb,
            FALSE, FALSE,
            '', '',
            '', '', '',
            '', '', ''
        );
        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, provider_id,
            last_sign_in_at, created_at, updated_at
        ) VALUES (
            gen_random_uuid(),
            v_user_id,
            jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
            'email',
            v_user_id::text,
            NOW(), NOW(), NOW()
        );
    END IF;

    -- 2. Collect player_id pools by position. Order by player_id for determinism.
    SELECT COALESCE(array_agg(player_id ORDER BY player_id), '{}')
      INTO qb_ids  FROM players WHERE primary_position = 'QB'  AND is_active;
    SELECT COALESCE(array_agg(player_id ORDER BY player_id), '{}')
      INTO rb_ids  FROM players WHERE primary_position = 'RB'  AND is_active;
    SELECT COALESCE(array_agg(player_id ORDER BY player_id), '{}')
      INTO wr_ids  FROM players WHERE primary_position = 'WR'  AND is_active;
    SELECT COALESCE(array_agg(player_id ORDER BY player_id), '{}')
      INTO te_ids  FROM players WHERE primary_position = 'TE'  AND is_active;
    SELECT COALESCE(array_agg(player_id ORDER BY player_id), '{}')
      INTO k_ids   FROM players WHERE primary_position = 'K'   AND is_active;
    SELECT COALESCE(array_agg(player_id ORDER BY player_id), '{}')
      INTO dst_ids FROM players WHERE primary_position = 'DST' AND is_active;

    have_players := array_length(qb_ids, 1) IS NOT NULL
                AND array_length(rb_ids, 1) IS NOT NULL
                AND array_length(wr_ids, 1) IS NOT NULL
                AND array_length(te_ids, 1) IS NOT NULL;

    IF NOT have_players THEN
        RAISE NOTICE 'players table not seeded with QB/RB/WR/TE; skipping draft seeding';
        RETURN;
    END IF;

    -- 3. For each script, build picks JSON and insert if not already present.
    FOR script IN SELECT * FROM jsonb_array_elements(scripts)
    LOOP
        -- Idempotency guard: one draft per (user, strategy).
        IF EXISTS (
            SELECT 1 FROM drafts
             WHERE user_id = v_user_id
               AND strategy = (script->>'strategy')
        ) THEN
            CONTINUE;
        END IF;

        positions_arr := script->'positions';
        counters := '{"QB":0,"RB":0,"WR":0,"TE":0,"K":0,"DST":0}'::jsonb;
        picks := '[]'::jsonb;

        FOR r IN 1..v_num_rounds LOOP
            pos := positions_arr->>(r - 1);
            -- Snake: odd rounds forward (slot 1), even rounds reverse (slot 12).
            IF r % 2 = 1 THEN
                slot := v_user_slot;
            ELSE
                slot := v_num_teams - v_user_slot + 1;
            END IF;
            overall := (r - 1) * v_num_teams + slot;

            CASE pos
                WHEN 'QB'  THEN pool_ids := qb_ids;
                WHEN 'RB'  THEN pool_ids := rb_ids;
                WHEN 'WR'  THEN pool_ids := wr_ids;
                WHEN 'TE'  THEN pool_ids := te_ids;
                WHEN 'K'   THEN pool_ids := k_ids;
                WHEN 'DST' THEN pool_ids := dst_ids;
                ELSE pool_ids := wr_ids;
            END CASE;

            -- Fall back to any non-empty pool if requested one is empty.
            IF array_length(pool_ids, 1) IS NULL THEN
                pool_ids := wr_ids;
            END IF;

            pool_index := (counters->>pos)::int;
            IF pool_index >= array_length(pool_ids, 1) THEN
                pool_index := array_length(pool_ids, 1) - 1;
            END IF;
            chosen_id := pool_ids[pool_index + 1]; -- 1-indexed
            counters := jsonb_set(counters, ARRAY[pos], to_jsonb(pool_index + 1));

            pick_obj := jsonb_build_object(
                'overall', overall,
                'round', r,
                'slot', slot,
                'team', v_user_team,
                'player_id', chosen_id
            );
            picks := picks || pick_obj;
        END LOOP;

        INSERT INTO drafts (
            user_id, num_teams, num_rounds, user_slot, user_team,
            picks, strategy, strategy_tags
        ) VALUES (
            v_user_id, v_num_teams, v_num_rounds, v_user_slot, v_user_team,
            picks, script->>'strategy',
            ARRAY(SELECT jsonb_array_elements_text(script->'tags'))
        );
    END LOOP;
END $$;
