-- Re-seed the test user's mock drafts using FantasyPros ADP/ECR from
-- `player_rankings` so each strategy actually contains plausible players for
-- the pick number (e.g. round-1 WRs aren't WR60s anymore).
--
-- Idempotent: deletes the existing seeded strategy rows for the test user
-- and re-inserts them. No-op if the test user or rankings are missing.

DO $$
DECLARE
    v_user_id      UUID;
    v_email        TEXT := 'test@draftlab.local';
    v_num_teams    INT  := 12;
    v_num_rounds   INT  := 15;
    v_user_slot    INT  := 1;
    v_user_team    TEXT := 'You';

    -- 15-round position scripts per strategy.
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
    round_num      INT;
    slot_num       INT;
    overall_pick   INT;
    chosen_id      BIGINT;
    used_ids       BIGINT[];
    picks          JSONB;
BEGIN
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;
    IF v_user_id IS NULL THEN
        RAISE NOTICE 'test user (%) not found; skipping draft reseed', v_email;
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM player_rankings WHERE source = 'fantasypros' AND scoring = 'half'
    ) THEN
        RAISE NOTICE 'FantasyPros half-PPR rankings not present; skipping draft reseed';
        RETURN;
    END IF;

    -- Clear existing seeded drafts so this migration is re-runnable.
    DELETE FROM drafts
     WHERE user_id = v_user_id
       AND strategy IN (
           'Zero RB','Robust RB','Hero RB','Balanced','WR Heavy','WR Hammer','Early TE'
       );

    FOR script IN SELECT * FROM jsonb_array_elements(scripts)
    LOOP
        positions_arr := script->'positions';
        used_ids := ARRAY[]::BIGINT[];
        picks := '[]'::jsonb;

        FOR round_num IN 1..v_num_rounds LOOP
            pos := positions_arr->>(round_num - 1);
            IF round_num % 2 = 1 THEN
                slot_num := v_user_slot;
            ELSE
                slot_num := v_num_teams - v_user_slot + 1;
            END IF;
            overall_pick := (round_num - 1) * v_num_teams + slot_num;

            chosen_id := NULL;

            -- 1. Best available player at this position whose ADP/ECR is
            --    consistent with the current pick (allow small reaches).
            SELECT p.player_id INTO chosen_id
              FROM players p
              JOIN player_rankings r ON r.player_id = p.player_id
             WHERE p.primary_position = pos
               AND p.is_active
               AND r.source = 'fantasypros'
               AND r.scoring  = 'half'
               AND COALESCE(r.adp, r.ecr) >= GREATEST(overall_pick - 6, 1)
               AND NOT (p.player_id = ANY(used_ids))
             ORDER BY COALESCE(r.adp, r.ecr) ASC
             LIMIT 1;

            -- 2. Drop the ADP gate (relevant for late-round K/DST/TE2).
            IF chosen_id IS NULL THEN
                SELECT p.player_id INTO chosen_id
                  FROM players p
                  JOIN player_rankings r ON r.player_id = p.player_id
                 WHERE p.primary_position = pos
                   AND p.is_active
                   AND r.source = 'fantasypros'
                   AND r.scoring  = 'half'
                   AND NOT (p.player_id = ANY(used_ids))
                 ORDER BY COALESCE(r.adp, r.ecr) ASC NULLS LAST
                 LIMIT 1;
            END IF;

            -- 3. Any unrated active player at the position (last resort).
            IF chosen_id IS NULL THEN
                SELECT p.player_id INTO chosen_id
                  FROM players p
                 WHERE p.primary_position = pos
                   AND p.is_active
                   AND NOT (p.player_id = ANY(used_ids))
                 ORDER BY p.player_id ASC
                 LIMIT 1;
            END IF;

            IF chosen_id IS NULL THEN
                RAISE NOTICE 'no % available for strategy % at round %',
                    pos, script->>'strategy', round_num;
                CONTINUE;
            END IF;

            used_ids := array_append(used_ids, chosen_id);
            picks := picks || jsonb_build_object(
                'overall',   overall_pick,
                'round',     round_num,
                'slot',      slot_num,
                'team',      v_user_team,
                'player_id', chosen_id
            );
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
