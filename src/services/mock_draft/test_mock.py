import unittest

from mock import DraftBoard, Player


def _make_player(pid: int, name: str, pos: str = "WR", team: str = "LAR") -> Player:
    return Player(player_id=pid, name=name, position=pos, team=team)


class TestDraftBoard(unittest.TestCase):
    def test_process_pick_moves_player_to_roster(self):
        draft = DraftBoard(num_teams=5, num_rounds=5)
        puka = _make_player(1, "Puka Nacua")
        favre = _make_player(2, "Brett Favre", pos="QB", team="GB")
        jimmy = _make_player(3, "Jimmy", pos="RB", team="SF")

        draft.populate_players([puka, favre, jimmy])
        draft.create_team("Jack")

        picked = draft.process_pick(player_id=1, team="Jack")

        self.assertEqual(picked, puka)
        self.assertEqual(set(draft.available_players.keys()), {2, 3})
        self.assertEqual(draft.current_teams, {"Jack": [1]})

    def test_process_pick_rejects_unknown_team(self):
        draft = DraftBoard(num_teams=5, num_rounds=5)
        draft.populate_players([_make_player(1, "Puka Nacua")])

        with self.assertRaises(KeyError):
            draft.process_pick(player_id=1, team="Ghost")

    def test_process_pick_rejects_unavailable_player(self):
        draft = DraftBoard(num_teams=5, num_rounds=5)
        draft.populate_players([_make_player(1, "Puka Nacua")])
        draft.create_team("Jack")
        draft.process_pick(player_id=1, team="Jack")

        with self.assertRaises(KeyError):
            draft.process_pick(player_id=1, team="Jack")

    def test_create_team_rejects_duplicate(self):
        draft = DraftBoard(num_teams=5, num_rounds=5)
        draft.create_team("Jack")
        with self.assertRaises(ValueError):
            draft.create_team("Jack")

    def test_player_is_immutable(self):
        p = _make_player(1, "Puka Nacua")
        with self.assertRaises(Exception):
            p.name = "Someone Else"  # frozen dataclass


if __name__ == "__main__":
    unittest.main()
