from datetime import datetime

from app.db import database
from app.models import user_subscriptions


async def subscription_payload(user_id: int) -> dict:
    """Build subscription dict for API (no row = free tier)."""
    row = await database.fetch_one(
        user_subscriptions.select().where(user_subscriptions.c.user_id == user_id)
    )
    now = datetime.utcnow()
    if not row:
        return {
            "plan": "free",
            "status": "active",
            "label": "Free",
            "is_pro": False,
            "current_period_end": None,
            "is_expired": False,
        }

    plan = row["plan"] or "free"
    st = row["status"] or "none"
    end = row["current_period_end"]
    end_is_past = end is not None and end <= now

    if plan in ("free",) or plan is None:
        return {
            "plan": "free",
            "status": st,
            "label": "Free",
            "is_pro": False,
            "current_period_end": end.isoformat() if end else None,
            "is_expired": False,
        }

    is_pro = st == "active" and plan in ("pro_monthly", "pro_yearly") and not end_is_past
    labels = {
        "pro_monthly": "Pro · Monthly",
        "pro_yearly": "Pro · Yearly",
    }
    label = labels.get(plan, plan)
    return {
        "plan": plan,
        "status": st,
        "label": label,
        "is_pro": is_pro,
        "current_period_end": end.isoformat() if end else None,
        "is_expired": end_is_past and plan in ("pro_monthly", "pro_yearly"),
    }
