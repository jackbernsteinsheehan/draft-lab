# Player External IDs Table

## Related Docs
- [Players Table](/Users/jackbernstein-sheehan/Documents/projects/draft-lab/docs/data/players.md)
- [Data Schema Proposal](/Users/jackbernstein-sheehan/Documents/projects/draft-lab/docs/data/data.md)

## Purpose
The `player_external_ids` table maps the app's internal `player_id` to identifiers issued by outside data providers (nflreadpy's `gsis_id`, Sleeper's `player_id`, FantasyPros' slug, ESPN, PFR, Yahoo, etc.).

It lets imports match an incoming row to an existing internal player without relying on name + team + position string matching.

## Schema

```sql
CREATE TABLE IF NOT EXISTS player_external_ids (
    player_id BIGINT NOT NULL,
    provider VARCHAR(32) NOT NULL,
    external_id VARCHAR(64) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (player_id, provider),
    UNIQUE KEY uq_provider_external_id (provider, external_id),
    KEY idx_player_external_ids_player_id (player_id),
    CONSTRAINT fk_player_external_ids_player
        FOREIGN KEY (player_id) REFERENCES players (player_id)
        ON DELETE CASCADE
);
```

## Column Notes
- `player_id`: FK into `players.player_id`. Cascade deletes so orphan mappings don't linger.
- `provider`: Short tag for the source. Use lowercase, stable strings (`gsis`, `sleeper`, `fantasypros`, `espn`, `pfr`, `yahoo`).
- `external_id`: The provider's own id, stored as text. Numeric ids (Sleeper, ESPN) and string ids (gsis, slugs) both fit.

## Constraints
- `PRIMARY KEY (player_id, provider)` — a player has at most one id per provider.
- `UNIQUE (provider, external_id)` — a given provider id maps to exactly one internal player.

If a provider ever exposes multiple ids for the same player (rare, but happens around mid-season trades or with legacy ids), pick the canonical one for this table and handle the alias upstream.

## Connection API

### `create_player_external_ids_table()`
Idempotent DDL. Safe to call on every startup.

### `upsert_external_id(player_id: int, provider: str, external_id: str) -> None`
Inserts the mapping, or replaces the existing `external_id` for the `(player_id, provider)` pair. Use this during imports when a provider's id for a known player may change.

### `get_player_id_by_external(provider: str, external_id: str) -> int | None`
Returns the internal `player_id`, or `None` if no mapping exists. This is the lookup path the fetch layer should use when ingesting rows that carry a provider id.

### `get_external_ids(player_id: int) -> dict[str, str]`
Returns `{provider: external_id}` for a single player. Useful when calling out to multiple providers for the same player (rankings, projections, news).

### `delete_external_id(player_id: int, provider: str) -> bool`
Removes one mapping. Returns `True` if a row was deleted.

## Import Flow
The recommended order when ingesting a roster row that carries a provider id:

1. Call `get_player_id_by_external(provider, external_id)`.
2. If it returns an int, the player already exists — update fields via `update_player_data`.
3. If it returns `None`, fall back to name+team+position matching against `players`. If still no match, `insert_player` to create one.
4. Either way, call `upsert_external_id` to record the mapping for next time.

This keeps the unique-key fallback in `players` as a second line of defense — once a provider id is recorded, subsequent imports skip the string match entirely.
