import nflreadpy as nfl
import pandas as pd


class DraftBoard():
    def __init__(self, num_teams, num_rounds):
        self.num_teams = num_teams
        self.num_rounds = num_rounds

        self.available_players = []
        self.current_teams: dict[str, list[str]] = {}
        
    def get_players(self) -> list:
        """get a list of all nfl players
        Needs to be changed to get data out of the SQL db"""
        players = nfl.load_players()
        names = players['display_name']
        return names
    
    def initialize_players(self):
        self.players = self.get_players()

    def populate_players(self, players: list):
        """set the availale players list to the players param"""
        self.available_players = players

    def create_team(self, name: str):
        """add a team to the teams dict"""
        if name not in self.current_teams:
            self.current_teams[name] = []
        else:
            return "Team name already in use"

    def process_pick(self, player:str, team:str):
        """Allow a team to choose a player from available_players 
        and move the player to their roster"""
        if player in self.available_players:
            try:
                self.current_teams[team].append(player)
                self.available_players.remove(player)

            except KeyError:
                return "team not found"
            
    def _pick_player(self):
        pass
        
class Player:
    def __init__(self, name, pos):
        self.name = name
        self.pos = pos

