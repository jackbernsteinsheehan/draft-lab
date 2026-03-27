from data.fetch_data import *
import unittest

class TestDraft(unittest.TestCase):

    def test_get_players(self):
        
        print (type(draft.get_players()[2300]))

if __name__ == "__main__":
    unittest.main()