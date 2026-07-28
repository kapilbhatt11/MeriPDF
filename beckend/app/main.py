# backend/app/main.py
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import create_engine, text
from app import config
from app.config import FRONTEND_URL
from app.db import database, metadata, DATABASE_URL
from app.middleware.pdf_limit_middleware import AnonymousPdfLimitMiddleware

# Routers
from app.routes import upload, documents, pdf_tools, auth, billing, admin, protect, watermark, converters, compare
from app.routes.pdf_tools import compress_pdf

from app.routes.pdf_tools import router_compress


# ---------------- App Init ----------------
app = FastAPI(title="MeriPDF - OCR + PDF Tools Service")
main = app

import traceback
from fastapi.responses import JSONResponse

@app.exception_handler(Exception)
async def debug_exception_handler(request, exc):
    tb = traceback.format_exc()
    return JSONResponse(
        status_code=500,
        content={
            "detail": str(exc),
            "traceback": tb.splitlines()
        }
    )


# CORS must be outermost so OPTIONS preflight is answered before other middleware.
# (Otherwise browser shows "Network error" and logs show OPTIONS … 400.)
app.add_middleware(AnonymousPdfLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://meripdf.com",
        "https://www.meripdf.com",
        FRONTEND_URL,
    ],

    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------- Startup / Shutdown ----------------
@app.on_event("startup")
async def startup():
    """Connect to database and create tables if not exist."""
    await database.connect()
    engine = create_engine(DATABASE_URL)
    metadata.create_all(engine)
    await database.execute(
        text(
            """
            ALTER TABLE documents
            ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)
            """
        )
    )
    for stmt in (
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(128)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMP",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(32)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_stored_filename VARCHAR(255)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(20)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE",
    ):
        await database.execute(text(stmt))
    await database.execute(
        text("UPDATE users SET email_verified = true WHERE email_verified IS NULL")
    )
    await database.execute(
        text("UPDATE users SET is_admin = false WHERE is_admin IS NULL")
    )
    await database.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS anonymous_pdf_daily (
                id SERIAL PRIMARY KEY,
                usage_date DATE NOT NULL,
                ip_address VARCHAR(45) NOT NULL,
                count INTEGER NOT NULL DEFAULT 0,
                UNIQUE (usage_date, ip_address)
            )
            """
        )
    )
    await database.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS user_pdf_daily (
                id SERIAL PRIMARY KEY,
                usage_date DATE NOT NULL,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                count INTEGER NOT NULL DEFAULT 0,
                UNIQUE (usage_date, user_id)
            )
            """
        )
    )
    _avatars = Path(__file__).resolve().parent.parent / "avatars"
    _avatars.mkdir(exist_ok=True)


@app.on_event("shutdown")
async def shutdown():
    """Disconnect from database when server stops."""
    await database.disconnect()


# ---------------- Health Check ----------------
@app.get("/health")
async def health():
    """Check if server is running and print safe SMTP configs."""
    return {
        "status": "ok",
        "smtp_host": config.SMTP_HOST,
        "smtp_port": config.SMTP_PORT,
        "smtp_configured": bool(config.SMTP_HOST and config.SMTP_USER),
        "smtp_has_password": bool(config.SMTP_PASSWORD)
    }


# ---------------- Routers ----------------
app.include_router(auth.router)
app.include_router(billing.router)
app.include_router(admin.router)
app.include_router(upload.router)
app.include_router(documents.router)
# app.include_router(pdf_tools.router)

app.include_router(pdf_tools.router_merge)
app.include_router(pdf_tools.router_split)

# app.include_router(compress.router_compress)
app.include_router(pdf_tools.router_compress)
app.include_router(protect.router)
app.include_router(watermark.router)
app.include_router(converters.router)
app.include_router(compare.router)


app.include_router(router_compress)


# ---------------- Root Endpoint ----------------
@app.get("/")
def root():
    return {"message": "✅ MeriPDF Backend Running (OCR + PDF Tools Active)"}



# ---------------- Static File Serving ----------------
_avatars_dir = Path(__file__).resolve().parent.parent / "avatars"
_avatars_dir.mkdir(parents=True, exist_ok=True)
app.mount("/avatars", StaticFiles(directory=str(_avatars_dir)), name="avatars")

# Serve merged or split PDF files directly (ensuring directories exist first)
_merge_dir = Path(__file__).resolve().parent.parent / "merge_pdf_outputs"
_merge_dir.mkdir(parents=True, exist_ok=True)
app.mount("/merge_pdf_outputs", StaticFiles(directory=str(_merge_dir)), name="merge_pdf_outputs")

_split_dir = Path(__file__).resolve().parent.parent / "split_pdf_outputs"
_split_dir.mkdir(parents=True, exist_ok=True)
app.mount("/split_pdf_outputs", StaticFiles(directory=str(_split_dir)), name="split_pdf_outputs")

