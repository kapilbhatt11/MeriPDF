"""
Billing & subscriptions.

Live payments (India): Razorpay typical flow
1) Create a Razorpay account → Dashboard → API Keys (key_id + key_secret, server-only).
2) Server: POST https://api.razorpay.com/v1/orders with amount in paise (₹149 → 14900),
   currency INR, receipt id; return order.id to the browser.
3) Frontend: load Razorpay Checkout script, call Razorpay({ key, order_id, handler }).
4) On payment.captured webhook, verify signature and upsert user_subscriptions
   (plan, status=active, current_period_end).

International cards: Razorpay supports many cards; or use Stripe Checkout similarly.

Env vars you will add later: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (server only).
"""

import uuid
from datetime import date, datetime, timedelta
import logging

try:
    import razorpay
except ImportError:
    razorpay = None

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text

from app import config
from app.auth_security import decode_token
from app.db import database
from app.deps import get_current_user
from app.models import users

router = APIRouter(prefix="/billing", tags=["billing"])

CATALOG = {
    "currency": "INR",
    "free": {
        "title": "Basic Free Plan",
        "subtitle": "Essential PDF actions for daily use",
        "features": [
            "Access to essential utilities (Merge, Split, Rotate, Page Numbers)",
            "Native Camera Capture tray (unlimited manual document snaps)",
            "5 free PDF operations daily (Guest or standard account limit)",
            "Access to private document library & basic OCR uploads",
            "Manage user profile: photo, Date of Birth (DOB) and gender",
            "Basic standard document processing speeds",
        ],
    },
    "pro_monthly": {
        "id": "pro_monthly",
        "label": "Pro Monthly",
        "price_inr": 149,
        "interval": "month",
    },
    "pro_yearly": {
        "id": "pro_yearly",
        "label": "Pro Yearly",
        "price_inr": 1490,
        "interval": "year",
        "savings_note": "Save over 15% — under ₹125/mo when selected yearly",
    },
    "pro_features": [
        "Include all features from the Free tier plan",
        "Full access to the Smart Mobile Web Camera Viewfinder Scanner (live video capture streams)",
        "Supercharged cloud processing queues (up to 5x faster conversions)",
        "Premium Pro badge identifier badge visible across layouts",
        "Advanced high-precision OCR text extraction (multi-language detection)",
        "Enhanced multi-layered structural PDF Repair engine (via pikepdf core integration)",
        "Priority Customer Support ticketing queue",
    ],
}


class CheckoutBody(BaseModel):
    plan_id: str = Field(..., pattern="^pro_(monthly|yearly)$")


class VerifyPaymentBody(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    plan_id: str = Field(..., pattern="^pro_(monthly|yearly)$")


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:45]
    if request.client:
        return (request.client.host or "unknown")[:45]
    return "unknown"


@router.get("/pdf-quota")
async def pdf_quota(request: Request):
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if auth and auth.lower().startswith("bearer "):
        uid = decode_token(auth[7:].strip())
        if uid is not None:
            row = await database.fetch_one(users.select().where(users.c.id == uid))
            if row and dict(row).get("email_verified"):
                row_count = await database.fetch_one(
                    "SELECT count FROM user_pdf_daily WHERE usage_date = :d AND user_id = :uid",
                    values={"d": date.today(), "uid": uid},
                )
                used = int(row_count["count"]) if row_count else 0
                
                from app.services.subscription_info import subscription_payload
                sub = await subscription_payload(uid)
                limit = 200 if sub.get("is_pro") else 5
                
                return {
                    "unlimited": False,
                    "limit": limit,
                    "used": used,
                    "remaining": max(0, limit - used),
                }
    ip = _client_ip(request)
    row = await database.fetch_one(
        "SELECT count FROM anonymous_pdf_daily WHERE usage_date = :d AND ip_address = :ip",
        values={"d": date.today(), "ip": ip},
    )
    used = int(row["count"]) if row else 0
    lim = config.FREE_ANONYMOUS_PDF_OPS_PER_DAY
    return {
        "unlimited": False,
        "limit": lim,
        "used": used,
        "remaining": max(0, lim - used),
    }


@router.get("/plans")
async def list_plans():
    return CATALOG


@router.post("/checkout")
async def create_checkout(body: CheckoutBody, current=Depends(get_current_user)):
    """
    Creates a Razorpay Order. If keys are missing, returns a mock order for testing.
    """
    plan = CATALOG.get(body.plan_id)
    if not plan:
        raise HTTPException(status_code=400, detail="Invalid plan ID.")

    amount_inr = plan["price_inr"]
    amount_paise = int(amount_inr * 100)
    receipt_id = f"rcpt_{current['id']}_{uuid.uuid4().hex[:8]}"

    # Mock Mode Fallback
    if not config.RAZORPAY_KEY_ID or not config.RAZORPAY_KEY_SECRET:
        logging.warning("Razorpay keys not found. Returning a Mock Order ID for testing.")
        return {
            "order_id": f"mock_order_{uuid.uuid4().hex[:12]}",
            "amount": amount_paise,
            "currency": "INR",
            "key_id": "mock_key_id",
            "mock_mode": True
        }

    if razorpay is None:
         raise HTTPException(status_code=500, detail="razorpay module not installed, please pip install razorpay.")

    try:
        client = razorpay.Client(auth=(config.RAZORPAY_KEY_ID, config.RAZORPAY_KEY_SECRET))
        order = client.order.create({
            "amount": amount_paise,
            "currency": "INR",
            "receipt": receipt_id,
            "payment_capture": "1" # Auto capture
        })
        return {
            "order_id": order["id"],
            "amount": amount_paise,
            "currency": "INR",
            "key_id": config.RAZORPAY_KEY_ID,
            "mock_mode": False
        }
    except Exception as e:
        logging.exception("Failed to create Razorpay Order")
        raise HTTPException(status_code=500, detail=f"Payment gateway error: {str(e)}")


@router.post("/verifyPayment")
async def verify_payment(body: VerifyPaymentBody, current=Depends(get_current_user)):
    """
    Verifies the payment signature and upgrades the user.
    """
    is_mock = body.razorpay_order_id.startswith("mock_order_")

    if is_mock:
        if config.RAZORPAY_KEY_ID and config.RAZORPAY_KEY_SECRET:
             raise HTTPException(status_code=400, detail="Mock orders not allowed when Real keys are configured.")
        logging.info(f"Verified mock payment for user {current['id']}")
    else:
        if not config.RAZORPAY_KEY_ID or not config.RAZORPAY_KEY_SECRET:
            raise HTTPException(status_code=500, detail="Missing Razorpay keys on server")
        if razorpay is None:
            raise HTTPException(status_code=500, detail="razorpay uninstalled.")
        
        client = razorpay.Client(auth=(config.RAZORPAY_KEY_ID, config.RAZORPAY_KEY_SECRET))
        try:
            client.utility.verify_payment_signature({
                'razorpay_order_id': body.razorpay_order_id,
                'razorpay_payment_id': body.razorpay_payment_id,
                'razorpay_signature': body.razorpay_signature
            })
        except razorpay.errors.SignatureVerificationError:
            raise HTTPException(status_code=400, detail="Invalid payment signature")
        except Exception as e:
            logging.exception("Verification error")
            raise HTTPException(status_code=500, detail="Signature verification failed")

    # Payment verified, upgrade subscription!
    plan = CATALOG.get(body.plan_id)
    interval = plan["interval"]
    duration_days = 365 if interval == "year" else 30
    new_expiry = datetime.utcnow() + timedelta(days=duration_days)

    from app.models import user_subscriptions
    
    # Check if subscription exists
    existing_sub = await database.fetch_one(
         user_subscriptions.select().where(user_subscriptions.c.user_id == current["id"])
    )

    if existing_sub:
        await database.execute(
            user_subscriptions.update()
            .where(user_subscriptions.c.user_id == current["id"])
            .values(
                plan=body.plan_id,
                status="active",
                provider="razorpay" if not is_mock else "mock",
                provider_subscription_id=body.razorpay_order_id,
                current_period_end=new_expiry,
                updated_at=datetime.utcnow()
            )
        )
    else:
        await database.execute(
            user_subscriptions.insert()
            .values(
                user_id=current["id"],
                plan=body.plan_id,
                status="active",
                provider="razorpay" if not is_mock else "mock",
                provider_subscription_id=body.razorpay_order_id,
                current_period_end=new_expiry,
                updated_at=datetime.utcnow()
            )
        )

    return {"message": "Payment successful and subscription updated.", "status": "active"}
