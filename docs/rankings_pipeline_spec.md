# Rankings seed pipeline — spec & walkthrough

Status: implemented. This doubles as a spec and a read-along guide for
understanding `src/data/fetch_rankings.py` + `scripts/seed_rankings.py`. It's
written so you can work through it **offline** (see [Offline mode](#offline-mode)).

## Goal

Load FantasyPros ECR/ADP rankings into Supabase `player_rankings`, one row per
player per snapshot, resolving each external ranking row to *our* internal
`player_id`. Re-runs are idempotent (upsert keyed on
`player_id,source,scoring,ecr_type,season,scrape_date`), so the GitHub Action
(`.github/workflows/refresh-data.yml`) can run it daily without creating
duplicates.

The hard part is not fetching — it's **identity resolution**: FantasyPros names
a player one way, we store them another. Getting the wrong `player_id` silently
corrupts rankings, so resolution is id-first with a guard and a fallback.

## Data sources

| Source | Loader | Shape (columns we use) |
| --- | --- | --- |
| FantasyPros rankings | `nflreadpy.load_ff_rankings()` | `id, player, pos, team, ecr, best, worst, sd, page_type, ecr_type, scrape_date` |
| nflverse id crosswalk | `nflreadpy.load_ff_playerids()` | `fantasypros_id, gsis_id, birthdate` |
| our players | Supabase `players` | `player_id, normalized_name, primary_position, current_team, birth_date` |
| our id map | Supabase `player_external_ids` | `player_id, external_id` (rows where `provider='nflverse'`, `external_id`=gsis_id) |

`ff_rankings` has no `adp` and no `season`; season is inferred from
`scrape_date`. `ecr_type` two-letter codes fan out by scoring/format — see the
map in `fetch_rankings.py`.

## Data flow

```
load_ff_rankings ─▶ build_ranking_payloads()          # fetch_rankings.py
                     ├─ filter to page_type + ecr_type
                     ├─ normalize name/pos, clean numerics
                     ├─ infer season from scrape_date
                     └─ carry `id` through as fantasypros_id
                              │
                              ▼  list[dict] (player_id NOT yet resolved)
                     seed_rankings.main()               # seed_rankings.py
                     ├─ load lookups (players, gsis→player_id, fp→gsis crosswalk)
                     ├─ resolve player_id per row  ◀── the algorithm below
                     └─ chunked upsert into player_rankings
```

`fetch_rankings.py` is pure transform (no DB). `seed_rankings.py` owns all the
Supabase I/O and the matching. That split is why the fetch layer is the easiest
place to start reading.

## Matching algorithm

For each ranking row, in order:

1. **id-first.** `fantasypros_id` → (crosswalk) → `gsis_id` → (`player_external_ids`)
   → `player_id`. This chain crosses two independent sources, so it's **guarded**
   by comparing `ff_playerids.birthdate` against our `players.birth_date`. On a
   hard birthdate conflict the match is **rejected** (logged, not written) and we
   fall through to step 2.
2. **name fallback.** `(normalized_name, primary_position)`, tie-broken by
   `current_team`. Covers rookies / DST the crosswalk doesn't carry.
3. Unmatched → skipped (counted).

The final line prints the breakdown: `matched (id N, name M), unmatched, id-rejected`.

### Design notes / rationale
- **Why id-first:** names collide (two "Mike Williams") and change (trades,
  suffixes); a stable id chain is unambiguous when it exists.
- **Why the birthdate guard:** an id chain across sources can be wrong if either
  source has a bad mapping. Birthdate is the strongest cross-source signal; team
  and position abbreviations differ too often between sources to reject on.
- **Why name is only a fallback:** it's the weaker signal, kept for the ~5% the
  crosswalk misses.

## Offline mode

`scripts/cache_offline.py` snapshots all four inputs to `scripts/_offline/*.parquet`
(gitignored). Set `DRAFTLAB_OFFLINE_DIR` and every loader reads parquet instead
of the network; the seeder then can't reach Supabase, so it forces `--dry-run`
(resolve + print stats, write nothing).

```bash
# once, online:
python scripts/cache_offline.py
# then anywhere, no network:
DRAFTLAB_OFFLINE_DIR=scripts/_offline python scripts/seed_rankings.py --dry-run
```

`offline_frame(name)` in `fetch_rankings.py` is the shared hook: returns the
cached frame, or `None` when offline is off. If offline is *on* but a file is
missing it raises (rather than silently hitting the network).

## Tests

`scripts/test_seed_rankings.py` (stdlib `unittest`) covers the pure helpers —
id normalization, date coercion, the birthdate guard, and the name/team
fallback. No network. Run from `scripts/`:
`python -m unittest test_seed_rankings`.

## Open questions / known issues

- **Birthdate guard may be too strict.** An offline dry-run rejected ~15 matches
  that look like single-field typos in one source (e.g. `ladd mcconkey`
  `2001-11-01` vs `2001-11-11`). These are almost certainly *correct* matches
  being rejected. Candidate fix: only reject when the dates disagree in more than
  one field (or by more than a tolerance), instead of on any inequality. Good
  first offline exercise — the guard is `_validate_id_match` and is unit-tested.
- **`_norm_id` vs `_clean_id` duplication.** Near-identical id normalizers live
  in both files; worth reconciling (pin behavior with a test first).
- **id matches can resolve to inactive players.** `gsis_to_player_id` isn't
  filtered to active players, while the name fallback is. Confirm that's intended.
