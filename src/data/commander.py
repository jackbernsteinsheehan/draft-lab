
from fetch_data import build_player_payloads
from sql import Connection

db = Connection()

print(len(db.get_table_data("players")))

db.close()