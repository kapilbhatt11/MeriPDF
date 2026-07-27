"""Limit anonymous PDF tool usage (merge/split/compress) per IP per day."""

from datetime import date
from starlette.types import ASGIApp, Receive, Send, Scope
from starlette.requests import Request
from starlette.responses import JSONResponse

from app import config
from app.auth_security import decode_token
from app.db import database
from app.models import users

PDF_TOOL_POST_PATHS = frozenset(
    {
        "/pdf/merge-pdf",
        "/pdf/remove-pages",
        "/pdf/extract-pages",
        "/pdf/rotate",
        "/pdf/repair",
        "/pdf/organize",
        "/pdf/scan",
        "/pdf/page-numbers",
        "/pdf/crop",
        "/split/pdf/split/all",
        "/split/pdf/split/manual",
        "/split/pdf/split/custom",
        "/split/pdf/split/fixed",
        "/compress/pdf/compress",
        "/watermark/add",
    }
)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:45]
    if request.client:
        return (request.client.host or "unknown")[:45]
    return "unknown"


def _cors_response(request: Request, status_code: int, content: dict) -> JSONResponse:
    origin = request.headers.get("origin")
    headers = {}
    if origin:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
        headers["Access-Control-Allow-Headers"] = "*"
        headers["Access-Control-Allow-Methods"] = "*"
    return JSONResponse(status_code=status_code, content=content, headers=headers)


async def _optional_verified_user_id(request: Request) -> int | None:
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    uid = decode_token(token)
    if uid is None:
        return None
    row = await database.fetch_one(users.select().where(users.c.id == uid))
    if row is None or not row["email_verified"]:
        return None
    return uid


async def _current_anon_count(ip: str, today: date) -> int:
    row = await database.fetch_one(
        "SELECT count FROM anonymous_pdf_daily WHERE usage_date = :d AND ip_address = :ip",
        values={"d": today, "ip": ip},
    )
    return int(row["count"]) if row else 0


async def _bump_anon_count(ip: str, today: date) -> None:
    await database.execute(
        """
        INSERT INTO anonymous_pdf_daily (usage_date, ip_address, count)
        VALUES (:d, :ip, 1)
        ON CONFLICT (usage_date, ip_address)
        DO UPDATE SET count = anonymous_pdf_daily.count + 1
        """,
        values={"d": today, "ip": ip},
    )


async def _current_user_count(user_id: int, today: date) -> int:
    row = await database.fetch_one(
        "SELECT count FROM user_pdf_daily WHERE usage_date = :d AND user_id = :uid",
        values={"d": today, "uid": user_id},
    )
    return int(row["count"]) if row else 0


async def _bump_user_count(user_id: int, today: date) -> None:
    await database.execute(
        """
        INSERT INTO user_pdf_daily (usage_date, user_id, count)
        VALUES (:d, :uid, 1)
        ON CONFLICT (usage_date, user_id)
        DO UPDATE SET count = user_pdf_daily.count + 1
        """,
        values={"d": today, "uid": user_id},
    )


class AnonymousPdfLimitMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive=receive)
        if request.method == "OPTIONS":
            await self.app(scope, receive, send)
            return

        path = request.url.path
        if request.method != "POST" or path not in PDF_TOOL_POST_PATHS:
            await self.app(scope, receive, send)
            return

        today = date.today()
        user_id = await _optional_verified_user_id(request)

        # 1) Logged-In Users (Free vs PRO)
        if user_id is not None:
            from app.services.subscription_info import subscription_payload
            sub = await subscription_payload(user_id)
            is_pro = sub.get("is_pro", False)
            
            row_user = await database.fetch_one(users.select().where(users.c.id == user_id))
            is_admin = bool(row_user and dict(row_user).get("is_admin", False))
            
            limit = 99999 if is_admin else (200 if is_pro else 5)
            used = await _current_user_count(user_id, today)

            if used >= limit:
                if is_pro or is_admin:
                    detail = f"PRO account daily limit of {limit} actions reached. Top-up or try again tomorrow."
                    code = "QUOTA_EXCEEDED"
                else:
                    detail = f"Free user daily limit of {limit} actions reached. Upgrade to PRO to unlock 200 daily actions."
                    code = "UPGRADE_REQUIRED"

                response = _cors_response(
                    request,
                    403,
                    content={
                        "detail": detail,
                        "code": code,
                        "used": used,
                        "limit": limit,
                    },
                )
                await response(scope, receive, send)
                return

            status_code = None

            async def send_wrapper_user(message):
                nonlocal status_code
                if message["type"] == "http.response.start":
                    status_code = message["status"]
                await send(message)

            await self.app(scope, receive, send_wrapper_user)

            if status_code == 200:
                await _bump_user_count(user_id, today)
            return

        # 2) Guest / Anonymous Users
        ip = _client_ip(request)
        limit = config.FREE_ANONYMOUS_PDF_OPS_PER_DAY
        if ip in ("127.0.0.1", "::1", "localhost", "unknown"):
            limit = 99999
        used = await _current_anon_count(ip, today)
        if used >= limit:
            response = _cors_response(
                request,
                403,
                content={
                    "detail": f"Free guest limit: {limit} PDF actions per day without login. Sign in to continue.",
                    "code": "LOGIN_REQUIRED",
                    "used": used,
                    "limit": limit,
                },
            )
            await response(scope, receive, send)
            return

        status_code = None

        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)

        await self.app(scope, receive, send_wrapper)

        if status_code == 200:
            await _bump_anon_count(ip, today)
