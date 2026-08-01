# First release plan

Next.js 16 on Vercel talking to Supabase directly through `@supabase/ssr`, no
application server. The mock-draft engine and strategy classifier run in the
browser; the Python seed scripts only ever run in CI, never in the request path.
Hosting is Vercel, data seeding is automated with a GitHub Action.

## Getting it live

Most of the remaining work here is account setup rather than code.

Spin up a production Supabase project and apply the schema — `supabase link`
then `supabase db push`, or paste `supabase/migrations/0001_init.sql` into the
SQL editor. Then seed it once by hand so there's data to test against (the
GitHub Action takes this over afterward):

```bash
# root .env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for the prod project
python scripts/seed_supabase.py
python scripts/seed_rankings.py
```

Deploy the `web/` directory to Vercel with `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` set. The one easy-to-miss step: in Supabase
under Auth → URL Configuration, add the Vercel production URL to the redirect
allowlist and set the Site URL, otherwise `/auth/callback` breaks in prod.

Then walk the whole flow to confirm it holds together: guest draft → sign up →
save → analyze.

The repo-side prep is already done — the stale `DB_PASSWORD` is out of the env
example, the README reflects the real architecture, and the production build is
clean.

## Automated seeding

The pipeline has no dependency manifest yet, so the first step is a
`requirements.txt` (`nflreadpy`, `pandas`, `supabase`, `python-dotenv`, plus
whatever `src/data/fetch_data.py` pulls in) — CI can't install without it.

From there, a `.github/workflows/seed.yml` that runs on a schedule with a
`workflow_dispatch` manual trigger: checkout, set up Python, install, run both
seed scripts. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` live in the repo
secrets and nowhere else — the service-role key never touches Vercel or the
client bundle. The upserts are idempotent so re-runs are harmless. Daily through
August, weekly the rest of the year.

## Making it public

Shipping this privately is nearly free once the steps above are done. Turning it
into something worth linking publicly is the part that takes real time.

The things that actually matter before strangers use it: fleshing out the auth
flow (email confirmation, password reset, real error and empty states in
`web/src/app/auth/` — maybe magic-link to cut signup friction, since right now
it's a bare email form); a pass over RLS to confirm the `drafts` owner policies
hold, the reference tables stay read-only, and no service-role key leaks into
the client; OG/meta tags, a favicon, and a real `<title>` in
`web/src/app/layout.tsx` so a shared link renders a proper preview card; and a
mobile pass on the draft room, which is dense.

Beyond that, some polish if there's time: a short "how it works" section that
puts the strategy classifier front and center since it's the differentiator,
confirming the analytics wiring, and seeding a public demo draft so `/analyze`
isn't empty before signup.

## Later

Projected point totals and scoring simulation, cross-run strategy comparison and
richer analytics, and rate limiting all wait for a second pass — the Supabase
defaults are fine at this scale.
