# Switching Draft Lab to Supabase

This doc describes how to move Draft Lab off local MySQL (`src/db/sql.py` using `mysql.connector` + `unix_socket`) onto Supabase. Supabase is hosted Postgres with auth, REST/RPC, and a Python client on top.

## Why Supabase
- Hosted Postgres — no local socket, no `mysql.connector`, accessible from anywhere (useful once a UI exists).
- Built-in auth — replaces having to roll user accounts for storing per-user mock-draft history.
- Row Level Security (RLS) — enforce "users can only read/write their own drafts" at the DB layer.
- Auto-generated REST + Python client — can shrink or replace parts of the planned FastAPI layer.

## What changes in this repo
The pieces that touch the DB today:
- `src/db/sql.py` — `Connection` class, schema creation, player CRUD.
- `src/db/test_sql.py` — tests against that connection.
- `src/data/fetch_data.py` — pulls from `nflreadpy` and (eventually) writes via `Connection`.

Everything in `src/services/mock_draft/` is in-memory per the design memo and does not talk to the DB directly, so it is unaffected by the swap.

## Migration steps

### 1. Create the Supabase project
1. Sign up at supabase.com, create a project, pick a region close to you.
2. From **Project Settings → Database**, grab:
   - Host, port (5432 direct, 6543 pooled), database name (`postgres`), user (`postgres`), password.
   - The connection string (the "Transaction" pooled URI is what app code should use).
3. Add to `.env`:
   ```
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_ANON_KEY=<anon key>
   SUPABASE_SERVICE_ROLE_KEY=<service role key>   # server-side only, never ship to a browser
   DATABASE_URL=postgresql://postgres:<pw>@<host>:6543/postgres
   ```
   Stop using `DB_HOST` / `DB_USER` / `DB_PASSWORD` / `DB_SOCKET`.

### 2. Pick an access pattern
Two reasonable options:

**a) Direct Postgres via `psycopg` (closest to today's code).**
Keeps the `Connection` class shape; you swap the driver and rewrite SQL dialect bits. Best if you want to keep raw SQL and FastAPI as planned.

**b) Supabase Python client (`supabase-py`).**
Higher-level: `client.table("players").insert({...}).execute()`. Skips most hand-written SQL but couples you to the client's query builder. Good for rapid UI work; less natural for the bulk `nflreadpy` ingest path.

Recommendation: **use psycopg for `fetch_data.py` (bulk inserts) and `supabase-py` for read paths the UI will eventually hit.** They share the same database.

### 3. Translate the schema to Postgres
The `players` table in `sql.py` is MySQL-flavored. Postgres equivalent:

```sql
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
```

Key dialect differences to remember as the schema grows:
- `BIGINT AUTO_INCREMENT` → `BIGSERIAL` (or `GENERATED ALWAYS AS IDENTITY`).
- `DATETIME ... ON UPDATE CURRENT_TIMESTAMP` → use a trigger (see below) or set `updated_at = NOW()` in app code.
- Backticks → double quotes for identifiers.
- `%s` placeholders still work with psycopg.

`updated_at` trigger:
```sql
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER players_set_updated_at
BEFORE UPDATE ON players
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

Run this through the Supabase SQL editor or as a migration file.

### 4. Rewrite `src/db/sql.py`
- Replace `mysql.connector` with `psycopg` (v3) or `psycopg2`.
- Drop the `unix_socket` path; build the connection from `DATABASE_URL`.
- Use a connection pool (`psycopg_pool.ConnectionPool`) instead of one long-lived `self.conn` — Supabase's pooler will kill idle connections.
- `RETURNING player_id` replaces `cursor.lastrowid`:
  ```sql
  INSERT INTO players (...) VALUES (...) RETURNING player_id;
  ```
- `cursor(dictionary=True)` → `psycopg.rows.dict_row`.
- `INSERT ... ON DUPLICATE KEY UPDATE` (if/when added) → `INSERT ... ON CONFLICT (...) DO UPDATE SET ...`.

The public surface (`insert_player`, `update_player_data`, `get_table_data`, `show_tables`, etc.) can stay the same so callers in `fetch_data.py` don't change.

### 5. Migrate existing data
If there is real data in local MySQL worth keeping:
1. `mysqldump --compatible=postgresql --no-create-info` → CSV per table is usually cleaner than the dump.
2. Or: query MySQL, write to CSV, `\copy players FROM 'players.csv' CSV HEADER` via `psql` against Supabase.
3. After load, run `SELECT setval(pg_get_serial_sequence('players','player_id'), MAX(player_id)) FROM players;` so new inserts don't collide.

If the local DB is just scratch data, skip this and re-run `fetch_data.py` against Supabase.

### 6. Add auth + RLS before the UI
This is the payoff for using Supabase rather than raw Postgres:
- Future tables like `mock_drafts` should have a `user_id UUID REFERENCES auth.users(id)` column.
- Enable RLS: `ALTER TABLE mock_drafts ENABLE ROW LEVEL SECURITY;`
- Policy:
  ```sql
  CREATE POLICY "own drafts" ON mock_drafts
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  ```
- `players` is reference data — leave RLS off, or enable it with a `SELECT` policy of `true`.

The ingestion job (`fetch_data.py`) should use the **service role key** to bypass RLS; user-facing reads should use the **anon key** plus a logged-in JWT.

### 7. Update tests
- `src/db/test_sql.py` should point at a Supabase test schema or a local Postgres container, not local MySQL.
- Easiest local story: `docker run postgres:16` and use the same `DATABASE_URL` shape.

### 8. Rip out the old deps
- Remove `mysql-connector-python` from requirements.
- Add `psycopg[binary,pool]` and (optionally) `supabase`.
- Delete `DB_SOCKET` / `DB_HOST` references.

## Open questions to decide before starting
- Keep FastAPI as the only client-facing API, or let the UI hit Supabase directly via `supabase-js` and reserve FastAPI for jobs like `fetch_data` and the mock-draft engine?
- Where does the mock-draft engine run — Supabase Edge Functions, FastAPI, or in-browser? That decision drives whether draft results are POSTed to a FastAPI endpoint or written straight to a Supabase table.
- Are nflreadpy pulls run locally on a cron, on a schedule via GitHub Actions, or as a Supabase Edge Function? The service-role key only belongs in the first two.
