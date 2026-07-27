import asyncio
import logging
import secrets
import shutil
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import RedirectResponse

from app import config
from app.auth_security import create_access_token, hash_password, verify_password
from app.db import database
from app.deps import get_current_user
from app.email_service import send_verification_email
from app.models import users
from app.schemas.auth import (
    ProfileUpdate,
    RegisterResponse,
    ResendVerificationRequest,
    ResendVerificationResponse,
    SubscriptionOut,
    TokenResponse,
    UserLogin,
    UserPublic,
    UserRegister,
)
from app.services.subscription_info import subscription_payload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

VERIFY_HOURS = 48

AVATAR_DIR = Path(__file__).resolve().parent.parent.parent / "avatars"
ALLOWED_AVATAR_TYPES = {"image/jpeg", "image/png", "image/webp"}
AVATAR_MAX_BYTES = 2 * 1024 * 1024


def _verify_url(token: str) -> str:
    return f"{config.API_PUBLIC_URL}/auth/verify-email?token={token}"


def _user_public(row: dict, sub: dict) -> UserPublic:
    fn = row.get("avatar_stored_filename")
    avatar_url = f"{config.API_PUBLIC_URL}/avatars/{fn}" if fn else None
    return UserPublic(
        id=row["id"],
        email=row["email"],
        full_name=row.get("full_name"),
        mobile_number=row.get("mobile_number"),
        is_admin=bool(row.get("is_admin")),
        email_verified=bool(row.get("email_verified")),
        avatar_url=avatar_url,
        date_of_birth=row.get("date_of_birth"),
        gender=row.get("gender"),
        subscription=SubscriptionOut(**sub),
    )


async def _issue_new_verification_token(user_id: int) -> tuple[str, datetime]:
    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(hours=VERIFY_HOURS)
    await database.execute(
        users.update()
        .where(users.c.id == user_id)
        .values(verification_token=token, verification_expires_at=expires)
    )
    return token, expires


@router.post("/register", response_model=RegisterResponse)
async def register(body: UserRegister):
    existing = await database.fetch_one(users.select().where(users.c.email == body.email))
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
    hashed = hash_password(body.password)
    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(hours=VERIFY_HOURS)
    name = (body.full_name or "").strip() or None
    await database.fetch_one(
        users.insert()
        .values(
            email=body.email,
            hashed_password=hashed,
            full_name=name,
            mobile_number=body.mobile_number,
            email_verified=True,
            verification_token=token,
            verification_expires_at=expires,
        )
        .returning(users.c.id)
    )
    url = _verify_url(token)
    email_sent = False
    try:
        email_sent = await asyncio.to_thread(send_verification_email, body.email, url, name)
    except Exception:
        logger.exception("Could not send verification email to %s", body.email)
    return RegisterResponse(
        message="Account created. Check your inbox and confirm your email before logging in.",
        email=body.email,
        email_sent=email_sent,
    )


@router.get("/verify-email")
async def verify_email(token: str = Query(..., min_length=10)):
    row = await database.fetch_one(
        users.select().where(users.c.verification_token == token)
    )
    if row is None:
        return RedirectResponse(
            url=f"{config.FRONTEND_URL}/login?verify=invalid",
            status_code=302,
        )
    exp = row["verification_expires_at"]
    if exp is not None and exp < datetime.utcnow():
        return RedirectResponse(
            url=f"{config.FRONTEND_URL}/login?verify=expired",
            status_code=302,
        )
    await database.execute(
        users.update()
        .where(users.c.id == row["id"])
        .values(
            email_verified=True,
            verification_token=None,
            verification_expires_at=None,
        )
    )
    return RedirectResponse(
        url=f"{config.FRONTEND_URL}/login?verified=1",
        status_code=302,
    )


@router.post("/resend-verification", response_model=ResendVerificationResponse)
async def resend_verification(body: ResendVerificationRequest):
    row = await database.fetch_one(users.select().where(users.c.email == body.email))
    if row is None:
        return ResendVerificationResponse(
            message="If an account exists for this email, we sent a verification link.",
        )
    if row["email_verified"]:
        return ResendVerificationResponse(message="This email is already verified.")
    new_token, _ = await _issue_new_verification_token(row["id"])
    url = _verify_url(new_token)
    try:
        await asyncio.to_thread(
            send_verification_email,
            body.email,
            url,
            row["full_name"],
        )
    except Exception:
        logger.exception("Resend verification failed for %s", body.email)
    return ResendVerificationResponse(
        message="If an account exists for this email, we sent a verification link.",
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: UserLogin):
    row = await database.fetch_one(users.select().where(users.c.email == body.email))
    if row is None or not verify_password(body.password, row["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    if not row["email_verified"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email before logging in. Check your inbox or resend the link.",
        )
    token = create_access_token(row["id"])
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserPublic)
async def me(current=Depends(get_current_user)):
    row = await database.fetch_one(users.select().where(users.c.id == current["id"]))
    sub = await subscription_payload(row["id"])
    return _user_public(dict(row), sub)


@router.patch("/me", response_model=UserPublic)
async def update_me(body: ProfileUpdate, current=Depends(get_current_user)):
    data = body.model_dump(exclude_unset=True)
    values: dict = {}
    if "full_name" in data:
        v = data["full_name"]
        values["full_name"] = (v.strip() or None) if isinstance(v, str) else v
    if "mobile_number" in data:
        m = data["mobile_number"]
        values["mobile_number"] = (m.strip() or None) if isinstance(m, str) else m
    if "date_of_birth" in data:
        values["date_of_birth"] = data["date_of_birth"]
    if "gender" in data:
        g = data["gender"]
        values["gender"] = (g.strip().lower()[:32] if isinstance(g, str) and g.strip() else None)

    if values:
        await database.execute(
            users.update().where(users.c.id == current["id"]).values(**values)
        )
    row = await database.fetch_one(users.select().where(users.c.id == current["id"]))
    sub = await subscription_payload(current["id"])
    return _user_public(dict(row), sub)


@router.post("/me/avatar", response_model=UserPublic)
async def upload_avatar(
    current=Depends(get_current_user),
    file: UploadFile = File(...),
):
    if file.content_type not in ALLOWED_AVATAR_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Use JPG, PNG, or WebP (max 2 MB).",
        )
    raw = await file.read()
    if len(raw) > AVATAR_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Image too large (max 2 MB).")

    AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    ext = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" }[file.content_type]
    uid = current["id"]
    stored = f"{uid}_{uuid.uuid4().hex[:12]}{ext}"
    dest = AVATAR_DIR / stored
    with open(dest, "wb") as f:
        f.write(raw)

    # remove other avatars for this user
    for p in AVATAR_DIR.glob(f"{uid}_*"):
        if p.name != stored:
            try:
                p.unlink()
            except OSError:
                pass

    await database.execute(
        users.update().where(users.c.id == uid).values(avatar_stored_filename=stored)
    )
    row = await database.fetch_one(users.select().where(users.c.id == uid))
    sub = await subscription_payload(uid)
    return _user_public(dict(row), sub)
