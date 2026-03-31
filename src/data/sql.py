import os

import mysql.connector
from dotenv import load_dotenv


load_dotenv()


class Connection:
    PLAYER_UPDATE_FIELDS = (
        "canonical_name",
        "normalized_name",
        "primary_position",
        "current_team",
        "jersey_number",
        "birth_date",
        "rookie_year",
        "years_exp",
        "is_active",
    )

    def __init__(self) -> None:
        self.host = os.getenv("DB_HOST", "localhost")
        self.user = os.getenv("DB_USER")
        self.password = os.getenv("DB_PASSWORD")
        self.database = os.getenv("DB_NAME", "draft-lab")
        self.unix_socket = os.getenv("DB_SOCKET", "/tmp/mysql.sock")

        self.status = "inactive"
        self.conn = self.__init_conn()
        if not self.conn:
            raise RuntimeError("DB connect failed")

        self.cursor = self.conn.cursor(dictionary=True)

    # ___________________ Connection Methods ___________________ #

    def __init_conn(self):
        try:
            connection = mysql.connector.connect(
                user=self.user,
                password=self.password,
                database=self.database,
                unix_socket=self.unix_socket,
            )
            self.status = "active"
            return connection

        except mysql.connector.Error as error:
            self.status = "inactive"
            print(
                "There was an error when attempting the database connection.\n"
                f"Host: {self.host}\n"
                f"Database: {self.database}\n"
                f"Socket: {self.unix_socket}\n"
                f"Error: {error}"
            )
            return None

    def execute(self, query: str, params: tuple | None = None) -> None:
        """Execute a write query and commit the transaction."""
        self.cursor.execute(query, params or ())
        self.conn.commit()

    def fetch_all(self, query: str, params: tuple | None = None) -> list[dict]:
        """Execute a read query and return all rows."""
        self.cursor.execute(query, params or ())
        return self.cursor.fetchall()

    def close(self) -> None:
        """Close the cursor and database connection."""
        if hasattr(self, "cursor") and self.cursor:
            self.cursor.close()
        if self.conn and self.conn.is_connected():
            self.conn.close()
        self.status = "inactive"

    # ___________________ Schema Methods ___________________ #

    def create_players_table(self) -> None:
        """Create the base players table for app-owned player records."""
        query = """
        CREATE TABLE IF NOT EXISTS players (
            player_id BIGINT NOT NULL AUTO_INCREMENT,
            canonical_name VARCHAR(100) NOT NULL,
            normalized_name VARCHAR(100) NOT NULL,
            primary_position VARCHAR(10),
            current_team VARCHAR(10),
            jersey_number INT,
            birth_date DATE,
            rookie_year INT,
            years_exp INT,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (player_id),
            UNIQUE KEY uq_players_normalized_name_team_position (
                normalized_name,
                current_team,
                primary_position
            ),
            KEY idx_players_canonical_name (canonical_name),
            KEY idx_players_current_team (current_team),
            KEY idx_players_primary_position (primary_position),
            KEY idx_players_is_active (is_active)
        )
        """
        self.execute(query)

    def show_tables(self):
        '''
        Returns a list of all table names in the data base
        '''
        try:
            # Not sure if this query is correct
            query = '''
            SELECT TABLE_NAME AS name
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_NAME;
            '''

            self.cursor.execute(query)
            rows = self.cursor.fetchall()
            names = []
            for row in rows:
                names.append(row["name"])
            return names

        except mysql.connector.Error as error:
            print(f'show tables error: {error}')
            return []
        
    def update_player_data(self, player_id: int, data: dict) -> bool:
        """
        Update a player row using a pre-cleaned payload from the fetch layer.

        `data` may include any subset of fields listed in `PLAYER_UPDATE_FIELDS`.
        Returns True when a row was matched and updated.
        """
        if not isinstance(player_id, int):
            raise ValueError("player_id must be an int")

        if not isinstance(data, dict) or not data:
            raise ValueError("data must be a non-empty dict")

        update_fields = {
            key: value for key, value in data.items() if key in self.PLAYER_UPDATE_FIELDS
        }
        if not update_fields:
            raise ValueError(
                "data must include at least one valid player column to update"
            )

        set_clause = ", ".join(f"{column} = %s" for column in update_fields)
        query = f"""
        UPDATE players
        SET {set_clause}
        WHERE player_id = %s
        """

        params = tuple(update_fields.values()) + (player_id,)
        self.cursor.execute(query, params)
        self.conn.commit()

        return self.cursor.rowcount > 0

if __name__ == "__main__":
    con = Connection()
    try:
        con.create_players_table()
        print("Created or verified `players` table.")
    finally:
        con.close()
