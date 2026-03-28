import nflreadpy as nfl
import mysql
import pandas as pd

def get_player_names(year: int):
    """Pull all player names from nflreadpy"""

    rosters = nfl.load_rosters(year).to_pandas()
    players = rosters["full_name"]
    result = []
    for player in players:
        result.append(player)
    return result

if __name__ == "__main__":
    print(get_player_names(2026))