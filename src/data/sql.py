import mysql.connector
from dotenv import load_dotenv
import os
import logging

load_dotenv()
class Connection:
    def __init__(self) -> None:
        
        self.host = os.getenv('DB_HOST')
        self.user = os.getenv('DB_USER')
        self.password = os.getenv('DB_PASSWORD')
        self.database = 'draft-lab'
        
        self.status = 'inactive'
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
            unix_socket="/tmp/mysql.sock",
            )
            self.status = "active"
            return connection
        
        except mysql.connector.Error as error:
            self.status = 'inactive'
            print(f"There was an error when attempting the connection with host {self.host}\n Error: {error}")
            return None