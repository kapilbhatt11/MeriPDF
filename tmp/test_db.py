import asyncio
from app.db import database
from app.models import users

async def main():
    try:
        print("Connecting to database...")
        await database.connect()
        print("Connected!")
        rows = await database.fetch_all(users.select())
        print(f"Total users found: {len(rows)}")
        for r in rows:
            print(f"- ID: {r['id']}, Email: {r['email']}, Verified: {r['email_verified']}")
    except Exception as e:
        print("Connection failed with error:")
        import traceback
        traceback.print_exc()
    finally:
        await database.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
