import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

def create_db():
    try:
        # Connect to default postgres DB
        conn = psycopg2.connect(
            dbname='postgres',
            user='postgres',
            password='12345',
            host='localhost',
            port='5432'
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()
        
        # Check if meripdf db exists
        cursor.execute("SELECT 1 FROM pg_database WHERE datname='meripdf'")
        exists = cursor.fetchone()
        
        if not exists:
            cursor.execute("CREATE DATABASE meripdf")
            print("Database 'meripdf' created successfully.")
        else:
            print("Database 'meripdf' already exists.")
            
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"Error creating database: {e}")

if __name__ == "__main__":
    create_db()
