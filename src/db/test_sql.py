"""Test suite for player_external_ids methods on `Connection`.

Run directly: `python src/db/test_sql.py`.
Inserts test players, exercises each external-id method, and cleans up.
"""

from sql import Connection


TEST_MARKER = "__test_extid__"


def _insert_test_player(db: Connection, suffix: str) -> int:
    name = f"{TEST_MARKER}_{suffix}"
    return db.insert_player(
        {
            "canonical_name": name,
            "normalized_name": name,
            "primary_position": "WR",
            "current_team": "TST",
        }
    )


def _cleanup(db: Connection, player_ids: list[int]) -> None:
    for pid in player_ids:
        db.execute("DELETE FROM player_external_ids WHERE player_id = %s", (pid,))
        db.execute("DELETE FROM players WHERE player_id = %s", (pid,))


def test_upsert_inserts_new_row(db: Connection, player_id: int) -> None:
    db.upsert_external_id(player_id, "sleeper", "SL-1001")
    mapping = db.get_external_ids(player_id)
    assert mapping == {"sleeper": "SL-1001"}, f"unexpected mapping: {mapping}"
    print("ok  upsert_inserts_new_row")


def test_upsert_updates_existing_row(db: Connection, player_id: int) -> None:
    db.upsert_external_id(player_id, "sleeper", "SL-1001")
    db.upsert_external_id(player_id, "sleeper", "SL-2002")
    mapping = db.get_external_ids(player_id)
    assert mapping == {"sleeper": "SL-2002"}, f"unexpected mapping: {mapping}"
    print("ok  upsert_updates_existing_row")


def test_upsert_multiple_providers(db: Connection, player_id: int) -> None:
    db.upsert_external_id(player_id, "sleeper", "SL-1")
    db.upsert_external_id(player_id, "espn", "ESPN-9")
    mapping = db.get_external_ids(player_id)
    assert mapping == {"sleeper": "SL-1", "espn": "ESPN-9"}, mapping
    print("ok  upsert_multiple_providers")


def test_get_player_id_by_external_found(db: Connection, player_id: int) -> None:
    db.upsert_external_id(player_id, "espn", "ESPN-42")
    found = db.get_player_id_by_external("espn", "ESPN-42")
    assert found == player_id, f"expected {player_id}, got {found}"
    print("ok  get_player_id_by_external_found")


def test_get_player_id_by_external_missing(db: Connection) -> None:
    found = db.get_player_id_by_external("espn", "does-not-exist-xyz")
    assert found is None, f"expected None, got {found}"
    print("ok  get_player_id_by_external_missing")


def test_get_external_ids_empty(db: Connection, player_id: int) -> None:
    mapping = db.get_external_ids(player_id)
    assert mapping == {}, f"expected empty dict, got {mapping}"
    print("ok  get_external_ids_empty")


def test_delete_external_id_removes_row(db: Connection, player_id: int) -> None:
    db.upsert_external_id(player_id, "sleeper", "SL-DEL")
    deleted = db.delete_external_id(player_id, "sleeper")
    assert deleted is True
    assert db.get_external_ids(player_id) == {}
    print("ok  delete_external_id_removes_row")


def test_delete_external_id_missing_returns_false(
    db: Connection, player_id: int
) -> None:
    deleted = db.delete_external_id(player_id, "no-such-provider")
    assert deleted is False
    print("ok  delete_external_id_missing_returns_false")


def test_provider_external_id_unique_across_players(
    db: Connection, player_a: int, player_b: int
) -> None:
    db.upsert_external_id(player_a, "sleeper", "SL-UNIQ")
    try:
        db.upsert_external_id(player_b, "sleeper", "SL-UNIQ")
    except Exception as error:
        print(f"ok  provider_external_id_unique_across_players (rejected: {type(error).__name__})")
        return
    raise AssertionError(
        "expected unique constraint violation on (provider, external_id)"
    )


def test_invalid_arguments_raise(db: Connection) -> None:
    try:
        db.upsert_external_id("1", "sleeper", "x")  # type: ignore[arg-type]
    except ValueError:
        pass
    else:
        raise AssertionError("expected ValueError for non-int player_id")

    try:
        db.upsert_external_id(1, "", "x")
    except ValueError:
        pass
    else:
        raise AssertionError("expected ValueError for empty provider")

    try:
        db.upsert_external_id(1, "sleeper", "")
    except ValueError:
        pass
    else:
        raise AssertionError("expected ValueError for empty external_id")

    print("ok  invalid_arguments_raise")


def main() -> None:
    db = Connection()
    created: list[int] = []
    try:
        # Fresh player per test that mutates state, to keep tests independent.
        p1 = _insert_test_player(db, "p1"); created.append(p1)
        test_upsert_inserts_new_row(db, p1)

        p2 = _insert_test_player(db, "p2"); created.append(p2)
        test_upsert_updates_existing_row(db, p2)

        p3 = _insert_test_player(db, "p3"); created.append(p3)
        test_upsert_multiple_providers(db, p3)

        p4 = _insert_test_player(db, "p4"); created.append(p4)
        test_get_player_id_by_external_found(db, p4)

        test_get_player_id_by_external_missing(db)

        p5 = _insert_test_player(db, "p5"); created.append(p5)
        test_get_external_ids_empty(db, p5)

        p6 = _insert_test_player(db, "p6"); created.append(p6)
        test_delete_external_id_removes_row(db, p6)

        p7 = _insert_test_player(db, "p7"); created.append(p7)
        test_delete_external_id_missing_returns_false(db, p7)

        p8a = _insert_test_player(db, "p8a"); created.append(p8a)
        p8b = _insert_test_player(db, "p8b"); created.append(p8b)
        test_provider_external_id_unique_across_players(db, p8a, p8b)

        test_invalid_arguments_raise(db)

        print(f"\nAll tests passed ({len(created)} test players used).")
    finally:
        _cleanup(db, created)
        db.close()


if __name__ == "__main__":
    main()
