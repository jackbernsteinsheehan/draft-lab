import os

import mysql.connector
from dotenv import load_dotenv


load_dotenv()


class Connection:
    PLAYER_FIELDS = (
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

    def insert_player(self, data: dict) -> int:
        """
        Insert a single player row using a pre-cleaned payload from the fetch layer.

        Returns the newly created `player_id`.
        """
        if not isinstance(data, dict) or not data:
            raise ValueError("data must be a non-empty dict")

        insert_fields = {
            key: value for key, value in data.items() if key in self.PLAYER_FIELDS
        }
        if not insert_fields:
            raise ValueError("data must include at least one valid player column")

        required_fields = {"canonical_name", "normalized_name"}
        missing_required_fields = [
            field for field in required_fields if field not in insert_fields
        ]
        if missing_required_fields:
            raise ValueError(
                "missing required player fields: "
                + ", ".join(sorted(missing_required_fields))
            )

        columns = ", ".join(insert_fields.keys())
        placeholders = ", ".join(["%s"] * len(insert_fields))
        query = f"""
        INSERT INTO players ({columns})
        VALUES ({placeholders})
        """

        params = tuple(insert_fields.values())
        self.cursor.execute(query, params)
        self.conn.commit()

        return int(self.cursor.lastrowid)
    
    def get_table_data(self, table: str) -> list[dict[str, int]]:
        '''
        This method has been tested. It works. Still need to decide how we want the data to be formatted.

        Returns ALL of the information contained in a table. Return data looks like this: 

        [{'id': 1, 'ticker': 'IBM', 'metric': 'open', 'mean': 5.5, 'median': 5.5, 'std': 5.5, 
        'low': 5.5, 'max': 5.5, 'count': 3, 'standing': 'good'}, 
        {'id': 2, 'ticker': 'IBM', 'metric': 'high', 'mean': 5.5, 'median': 5.5, 'std': 5.5, 
        'low': 5.5, 'max': 5.5, 'count': 3, 'standing': 'good'}
        '''
        try:
            sql = f'SELECT * FROM {table}'
            self.cursor.execute(sql)
            rows = self.cursor.fetchall()

            # How do we want the data?
            '''
            for row in rows:
                row_id = row['id']
                ticker = row['ticker']
                metric = row['metric']
                mean = row['mean']
                median = row['median']
                std = row['std']
                low = row['low']
                maximum = row['maximum']
                count = row['count']
                standing = row['standing']
            '''
            return rows
        except Exception as e:
            return e
    
    def delete_table(self, table, conditions=None):
            '''
            This method has been tested. It works.

            Deletes a specified table. Again, allow for OPTIONAL filtering conditions. 
            '''
            try:
                if isinstance(conditions, str):
                    sql = f'DROP TABLE `{table}` WHERE {conditions};'
                    self.cursor.execute(sql)
                    self.conn.commit()
                    new_table_list = self.show_tables()
                    return f'Table deleted: {table}. Current tables are: {new_table_list}.'

                if not isinstance(conditions, str):
                    sql = f'DROP TABLE `{table}`;'
                    self.cursor.execute(sql)
                    self.conn.commit()
                    new_table_list = self.show_tables()
                    return f'Table deleted: {table}. Current tables are: {new_table_list}.'

            except mysql.connector.Error as error:
                        return f'DB error: {error}'
            except Exception as error:
                return f'There was an error: {error}'


if __name__ == "__main__":
    con = Connection()
    try:
        con.create_players_table()
        print("Created or verified `players` table.")
    finally:
        con.close()
