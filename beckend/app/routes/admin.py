from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from datetime import date, datetime, timedelta
from typing import Optional

from app.db import database
from app.deps import get_current_user
from app.models import users, user_subscriptions
from app.services.subscription_info import subscription_payload

router = APIRouter(prefix="/admin", tags=["admin"])

async def get_admin_user(current=Depends(get_current_user)):
    user = await database.fetch_one(users.select().where(users.c.id == current["id"]))
    if not user or not user.get("is_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    return current

class AdminUserUpdate(BaseModel):
    full_name: Optional[str] = None
    mobile_number: Optional[str] = None
    date_of_birth: Optional[date] = None
    is_admin: Optional[bool] = None

class AdminSubscriptionUpdate(BaseModel):
    plan: str
    status: str
    days_to_add: Optional[int] = 30

@router.get("/users")
async def list_users(admin=Depends(get_admin_user)):
    all_users = await database.fetch_all(
        users.select().order_by(users.c.created_at.desc())
    )
    result = []
    for row in all_users:
        sub = await subscription_payload(row["id"])
        fn = row.get("avatar_stored_filename")
        avatar_url = f"/avatars/{fn}" if fn else None
        
        result.append({
            "id": row["id"],
            "email": row["email"],
            "full_name": row.get("full_name"),
            "mobile_number": row.get("mobile_number"),
            "is_admin": bool(row.get("is_admin")),
            "email_verified": bool(row.get("email_verified")),
            "avatar_url": avatar_url,
            "date_of_birth": row.get("date_of_birth"),
            "created_at": row["created_at"],
            "subscription": sub
        })
    return result

@router.patch("/users/{user_id}")
async def update_user(user_id: int, body: AdminUserUpdate, admin=Depends(get_admin_user)):
    data = body.model_dump(exclude_unset=True)
    if not data:
        return {"status": "no changes"}
        
    await database.execute(
        users.update().where(users.c.id == user_id).values(**data)
    )
    return {"status": "success"}

@router.patch("/subscriptions/{user_id}")
async def override_subscription(user_id: int, body: AdminSubscriptionUpdate, admin=Depends(get_admin_user)):
    existing = await database.fetch_one(user_subscriptions.select().where(user_subscriptions.c.user_id == user_id))
    
    end_date = None
    if body.status == "active" and body.days_to_add:
        end_date = datetime.utcnow() + timedelta(days=body.days_to_add)
        
    if existing:
        await database.execute(
            user_subscriptions.update()
            .where(user_subscriptions.c.user_id == user_id)
            .values(
                plan=body.plan,
                status=body.status,
                current_period_end=end_date,
                provider="admin_override",
                updated_at=datetime.utcnow()
            )
        )
    else:
        await database.execute(
            user_subscriptions.insert()
            .values(
                user_id=user_id,
                plan=body.plan,
                status=body.status,
                current_period_end=end_date,
                provider="admin_override",
                updated_at=datetime.utcnow()
            )
        )
    
    return {"status": "success", "new_plan": body.plan, "end_date": end_date}
