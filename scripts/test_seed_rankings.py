"""Unit tests for the pure player-matching helpers in seed_rankings.

Covers id normalization, birthdate coercion, the birthdate guard on id matches,
and the name/team fallback. No network or Supabase access — the DB-backed
loaders (`_fetch_player_lookup`, `_load_gsis_to_player_id`, `_load_crosswalk`)
are integration concerns and are not exercised here.

Run from this directory:  python -m unittest test_seed_rankings
"""

import unittest

from seed_rankings import (
    _iso_date,
    _norm_id,
    _resolve_player_id,
    _validate_id_match,
)


class TestNormId(unittest.TestCase):
    def test_strips_trailing_dot_zero(self):
        # ff_playerids ids often arrive as floats from pandas.
        self.assertEqual(_norm_id(12345.0), "12345")
        self.assertEqual(_norm_id("12345.0"), "12345")

    def test_passes_through_plain_ids(self):
        self.assertEqual(_norm_id("00-0034796"), "00-0034796")
        self.assertEqual(_norm_id(42), "42")

    def test_blank_and_nan_become_none(self):
        for v in (None, "", "   ", "nan", "NaN", "None", "NaT", float("nan")):
            self.assertIsNone(_norm_id(v), f"expected None for {v!r}")

    def test_only_trailing_dot_zero_stripped(self):
        # A ".0" that isn't a trailing float suffix must survive.
        self.assertEqual(_norm_id("1.05"), "1.05")


class TestIsoDate(unittest.TestCase):
    def test_truncates_to_ten_chars(self):
        self.assertEqual(_iso_date("1990-01-01T00:00:00Z"), "1990-01-01")
        self.assertEqual(_iso_date("1990-01-01 00:00:00"), "1990-01-01")
        self.assertEqual(_iso_date("1990-01-01"), "1990-01-01")

    def test_missing_values_become_none(self):
        for v in (None, "nan", "NaT", "None"):
            self.assertIsNone(_iso_date(v), f"expected None for {v!r}")


class TestValidateIdMatch(unittest.TestCase):
    def _players(self, birth_date):
        return {7: {"player_id": 7, "birth_date": birth_date}}

    def test_matching_birthdates_pass(self):
        reason = _validate_id_match(
            7, {"birth_date": "1990-01-01"}, self._players("1990-01-01")
        )
        self.assertIsNone(reason)

    def test_conflicting_birthdates_rejected(self):
        reason = _validate_id_match(
            7, {"birth_date": "1990-01-01"}, self._players("1985-12-31")
        )
        self.assertIsNotNone(reason)
        self.assertIn("1990-01-01", reason)
        self.assertIn("1985-12-31", reason)

    def test_unknown_player_is_trusted(self):
        # pid not among active players (e.g. inactive) -> can't compare, trust id.
        reason = _validate_id_match(99, {"birth_date": "1990-01-01"}, self._players("1990-01-01"))
        self.assertIsNone(reason)

    def test_missing_birthdate_on_either_side_is_trusted(self):
        self.assertIsNone(_validate_id_match(7, {"birth_date": None}, self._players("1990-01-01")))
        self.assertIsNone(_validate_id_match(7, {"birth_date": "1990-01-01"}, self._players(None)))


class TestResolvePlayerId(unittest.TestCase):
    def _lookup(self, *players):
        lookup = {}
        for p in players:
            key = (p["normalized_name"], p["primary_position"])
            lookup.setdefault(key, []).append(p)
        return lookup

    def test_single_match(self):
        lookup = self._lookup(
            {"player_id": 1, "normalized_name": "puka nacua", "primary_position": "WR", "current_team": "LAR"}
        )
        row = {"normalized_name": "puka nacua", "position": "WR", "team": "LAR"}
        self.assertEqual(_resolve_player_id(row, lookup), 1)

    def test_team_breaks_ties(self):
        lookup = self._lookup(
            {"player_id": 1, "normalized_name": "mike williams", "primary_position": "WR", "current_team": "NYJ"},
            {"player_id": 2, "normalized_name": "mike williams", "primary_position": "WR", "current_team": "LAC"},
        )
        row = {"normalized_name": "mike williams", "position": "WR", "team": "LAC"}
        self.assertEqual(_resolve_player_id(row, lookup), 2)

    def test_ambiguous_without_team_takes_first(self):
        lookup = self._lookup(
            {"player_id": 1, "normalized_name": "mike williams", "primary_position": "WR", "current_team": "NYJ"},
            {"player_id": 2, "normalized_name": "mike williams", "primary_position": "WR", "current_team": "LAC"},
        )
        row = {"normalized_name": "mike williams", "position": "WR", "team": None}
        self.assertEqual(_resolve_player_id(row, lookup), 1)

    def test_no_match_returns_none(self):
        lookup = self._lookup(
            {"player_id": 1, "normalized_name": "puka nacua", "primary_position": "WR", "current_team": "LAR"}
        )
        row = {"normalized_name": "nobody here", "position": "RB", "team": "SF"}
        self.assertIsNone(_resolve_player_id(row, lookup))


if __name__ == "__main__":
    unittest.main()
