# Draft Lab

Draft Lab is a fantasy football pre-draft research tool. Run mock drafts against
ADP-driven CPU opponents, then have each roster automatically classified by draft
strategy (Zero RB, Robust RB, Hero RB, WR Heavy, Early QB/TE…) so you can compare
what you *intended* to draft against what you actually built.

## Architecture

No application server. The web app talks to Supabase directly via `supabase-js`
(`@supabase/ssr`); Supabase Row Level Security enforces per-user access. Player
and ADP/ECR data is loaded into Supabase by an offline Python pipeline that runs
in CI, never in the request path.

```
Next.js 16 (Vercel)  ──supabase-js──▶  Supabase (Postgres + Auth + RLS)
                                              ▲
        Python seed pipeline (GitHub Action) ─┘  players, player_rankings
```

- **`web/`** — Next.js 16 / React 19 app. The mock-draft engine and strategy
  classifier run in the browser (`web/src/lib/`); reads/writes go straight to
  Supabase. See `web/README.md`.
- **`src/`** — Python data pipeline. Pulls rosters and FantasyPros ECR/ADP from
  [nflreadpy](https://nflreadpy.nflverse.com/) and normalizes player identities.
- **`scripts/`** — one-shot / scheduled seeders (`seed_supabase.py`,
  `seed_rankings.py`) that upsert into Supabase using the service-role key.
- **`supabase/migrations/`** — schema: `players`, `player_external_ids`,
  `player_rankings`, `drafts`. Reference tables are public-read; `drafts` is
  owner-scoped via RLS.

## Data model

- `players` / `player_external_ids` — canonical player identities + ID mappings.
- `player_rankings` — ECR/ADP snapshots (FantasyPros via nflverse), re-runnable
  upserts keyed on `(player_id, source, scoring, ecr_type, season)`.
- `drafts` — a saved mock draft (picks JSONB + classified `strategy` / `strategy_tags`),
  one row per user, protected by RLS.

## Running the web app

```bash
cd web
cp .env.local.example .env.local   # fill in Supabase URL + anon key
npm install
npm run dev
```

## Seeding data

Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in a root `.env`
(service-role key bypasses RLS — never expose it to the browser).

```bash
python scripts/seed_supabase.py            # players (rosters)
python scripts/seed_rankings.py            # ADP/ECR (half-PPR redraft by default)
```

In production these run on a schedule via GitHub Actions.

## Release

See [`docs/release_plan.md`](docs/release_plan.md) for the first-release plan and
deployment checklist.
