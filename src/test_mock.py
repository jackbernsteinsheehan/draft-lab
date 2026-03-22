from mock import *
import unittest

class TestDraft(unittest.TestCase):
    def test_pick_player(self):
        draft = DraftBoard(5, 5)
        players = ["Puka Nacua", "Brett Favre", "Jimmy"]
        draft.populate_players(players)
        draft.create_team("Jack")
        draft.pick_player("Puka Nacua", "Jack")

        self.assertEqual(draft.available_players, ["Brett Favre", "Jimmy"])
        self.assertEqual(draft.current_teams, {"Jack": ["Puka Nacua"]})

    
if __name__ == "__main__":
    unittest.main()