import sys
import asyncio
from datetime import datetime
from app.db import database
from app.models import users, user_subscriptions

async def upgrade_user(email: str):
    await database.connect()
    
    # 1. Find user
    user = await database.fetch_one(users.select().where(users.c.email == email))
    if not user:
        print(f"Error: User with email '{email}' not found.")
        await database.disconnect()
        return

    user_id = user["id"]

    # 2. Verify user and make Admin
    await database.execute(
        users.update()
        .where(users.c.id == user_id)
        .values(email_verified=True, is_admin=True)
    )
    print(f"User '{email}' (ID: {user_id}) verified and upgraded to Admin.")

    # 3. Create or update PRO subscription
    sub = await database.fetch_one(
        user_subscriptions.select().where(user_subscriptions.c.user_id == user_id)
    )
    
    pro_end = datetime(2035, 12, 31, 23, 59, 59)
    if sub:
        await database.execute(
            user_subscriptions.update()
            .where(user_subscriptions.c.user_id == user_id)
            .values(
                plan="pro_yearly",
                status="active",
                current_period_end=pro_end,
                updated_at=datetime.utcnow()
            )
        )
        print("Updated existing subscription to PRO version valid until 2035.")
    else:
        await database.execute(
            user_subscriptions.insert()
            .values(
                user_id=user_id,
                plan="pro_yearly",
                status="active",
                current_period_end=pro_end,
                updated_at=datetime.utcnow()
            )
        )
        print("Created new subscription PRO tier valid until 2035.")

    await database.disconnect()
    print("Upgrade successfully completed!")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python make_user_pro.py <email>")
        sys.exit(1)
    
    email_to_upgrade = sys.argv[1].strip()
    asyncio.run(upgrade_user(email_to_upgrade))
