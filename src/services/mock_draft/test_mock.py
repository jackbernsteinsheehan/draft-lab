import unittest

from mock import DraftBoard, Player, run_draft, snake_order


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


class TestSnakeOrder(unittest.TestCase):
    def test_snake_reverses_each_round(self):
        order = list(snake_order(["A", "B", "C"], num_rounds=3))
        teams = [t for _, _, t in order]
        self.assertEqual(teams, ["A", "B", "C", "C", "B", "A", "A", "B", "C"])
        self.assertEqual([o for o, _, _ in order], list(range(1, 10)))
        self.assertEqual([r for _, r, _ in order], [1, 1, 1, 2, 2, 2, 3, 3, 3])


class TestRunDraft(unittest.TestCase):
    def _setup_board(self, teams: list[str], num_rounds: int) -> DraftBoard:
        board = DraftBoard(num_teams=len(teams), num_rounds=num_rounds)
        board.populate_players(
            [Player(player_id=i, name=f"P{i}") for i in range(1, len(teams) * num_rounds + 1)]
        )
        for t in teams:
            board.create_team(t)
        return board

    def test_run_draft_fills_rosters_in_snake_order(self):
        teams = ["A", "B", "C"]
        board = self._setup_board(teams, num_rounds=2)

        # Each pick fn just grabs the smallest available player_id.
        def pick_lowest(b: DraftBoard, _team: str) -> int:
            return min(b.available_players)

        run_draft(
            board,
            draft_order=teams,
            user_team="B",
            cpu_pick_fn=pick_lowest,
            user_pick_fn=lambda b, t, o, r: pick_lowest(b, t),
        )

        # Snake order with lowest-id picks: A=1, B=2, C=3, C=4, B=5, A=6.
        self.assertEqual(board.current_teams["A"], [1, 6])
        self.assertEqual(board.current_teams["B"], [2, 5])
        self.assertEqual(board.current_teams["C"], [3, 4])
        self.assertEqual(board.available_players, {})

    def test_run_draft_routes_user_slot(self):
        teams = ["A", "B"]
        board = self._setup_board(teams, num_rounds=1)
        seen = []

        def cpu(b: DraftBoard, _team: str) -> int:
            return min(b.available_players)

        def user(b: DraftBoard, team: str, overall: int, rnd: int) -> int:
            seen.append((team, overall, rnd))
            return max(b.available_players)

        run_draft(board, draft_order=teams, user_team="B",
                  cpu_pick_fn=cpu, user_pick_fn=user)

        self.assertEqual(seen, [("B", 2, 1)])

    def test_run_draft_rejects_unknown_user_team(self):
        board = self._setup_board(["A", "B"], num_rounds=1)
        with self.assertRaises(ValueError):
            run_draft(board, draft_order=["A", "B"], user_team="Z",
                      cpu_pick_fn=lambda b, t: 1,
                      user_pick_fn=lambda b, t, o, r: 1)

    def test_run_draft_rejects_team_not_on_board(self):
        board = DraftBoard(num_teams=2, num_rounds=1)
        board.populate_players([Player(player_id=1, name="P1"), Player(player_id=2, name="P2")])
        board.create_team("A")
        with self.assertRaises(KeyError):
            run_draft(board, draft_order=["A", "B"], user_team="A",
                      cpu_pick_fn=lambda b, t: 1,
                      user_pick_fn=lambda b, t, o, r: 1)


if __name__ == "__main__":
    unittest.main()
