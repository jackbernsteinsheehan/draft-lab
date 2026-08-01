# Draft Lab — First Release Plan

**Architecture (locked):** Next.js 16 on Vercel → Supabase directly via
`@supabase/ssr`. No application server. The mock-draft engine and strategy
classifier run in the browser. Python seed scripts run only in CI (GitHub
Action), never in the request path.

**Decisions:**
- Hosting: **Vercel**.
- Data seeding: **automated via GitHub Action**.
- Audience: shipping privately is cheap; the "public / LinkedIn-worthy" work is
  scoped as an explicit delta in Phase 2 so it can be decided independently.

Legend: `[ ]` todo · `[x]` done · **(you)** = needs your accounts / interactive
login, cannot be done from the repo.

---

## Phase 0 — Baseline ship

Gets the app live and working end-to-end. Not yet public-facing quality.

Repo-side (done in this pass):
- [x] Remove stale `DB_PASSWORD` from `web/.env.local.example`.
- [x] Rewrite `README.md` to the shipped Supabase / no-server architecture.
- [x] Confirm production build is clean (`npm run build` → exit 0, all routes render).

Account-side **(you)**:
- [ ] Create a production Supabase project (pick a region close to you).
- [ ] Apply migrations: `supabase link` to the project, then `supabase db push`
      (or paste `supabase/migrations/*.sql` into the SQL editor in order).
- [ ] Seed once, manually, so there's data to smoke-test (Phase 1 automates this):
      ```bash
      # root .env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for the PROD project
      python scripts/seed_supabase.py
      python scripts/seed_rankings.py
      ```
- [ ] Create the Vercel project from the `web/` directory. Set env vars:
      `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] **Supabase → Auth → URL Configuration:** add the Vercel production URL (and
      preview URL if used) to **Redirect URLs**, and set **Site URL**. Without
      this, `/auth/callback` fails in production — easiest step to forget.
- [ ] Smoke test the full flow: guest draft → sign up → save → `/analyze`.

## Phase 1 — Automated seeding (GitHub Action)

- [ ] Add `requirements.txt` (or `pyproject.toml`) for the pipeline — there is no
      dependency manifest today, so CI can't install. Pin: `nflreadpy`, `pandas`,
      `supabase`, `python-dotenv` (+ anything `src/data/fetch_data.py` imports).
- [ ] Workflow `.github/workflows/seed.yml`:
  - Triggers: `schedule` (cron) + `workflow_dispatch` (manual run button).
  - Steps: checkout → setup-python → install deps → run both seed scripts.
  - Secrets (repo settings): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. The
    service-role key lives **only** here — never in Vercel or the client bundle.
  - Upserts are already idempotent, so re-runs are safe.
- [ ] Cadence: daily through draft season (August), weekly otherwise.

## Phase 2 — Public / LinkedIn-mentionable delta

Baseline + Phase 1 = a working private app. To make it usable by a stranger and
worth linking publicly, the incremental work is:

**Must-have for public (~1 day)**
- [ ] Auth flow completeness: enable email confirmation, add password reset, and
      real error/empty states in `web/src/app/auth/`. Optional: magic-link to cut
      signup friction. (Today it's a bare email form — fine for you, rough for
      strangers.)
- [ ] RLS audit: verify `drafts` owner policies hold, reference tables are
      read-only, and no service-role key can reach the browser bundle.
- [ ] OG / meta tags + favicon + descriptive `<title>` in `web/src/app/layout.tsx`
      (currently `title: "draft-lab"`, generic description). This is what makes a
      shared link render a real preview card on LinkedIn. Highest visibility per
      unit effort.
- [ ] Mobile pass on the draft room (dense layout; recruiters click from phones).

**Nice-to-have polish (~1 day, optional)**
- [ ] Short "How it works" section surfacing the strategy classifier — the actual
      differentiator.
- [ ] Confirm the existing "analytics" work is wired, or add lightweight page
      analytics.
- [ ] Seed a public demo draft so `/analyze` isn't empty before signup.

## Explicitly deferred to v2

- Projected point totals / scoring simulation (README's original roadmap).
- Cross-run strategy comparison and richer analytics.
- Rate limiting (Supabase defaults are sufficient at portfolio scale).

---

## Effort summary

| Scope | Effort | Result |
|-------|--------|--------|
| Phase 0 + 1 | ~1 day | Live private app, data auto-refreshing |
| + Phase 2 must-haves | +~1 day | Public-ready, shareable |
| + Phase 2 polish | +~1 day | Portfolio-grade |
