# backend/app/models.py
from sqlalchemy import Table, Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Date, UniqueConstraint
from datetime import datetime
from app.db import metadata

anonymous_pdf_daily = Table(
    "anonymous_pdf_daily",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("usage_date", Date, nullable=False),
    Column("ip_address", String(45), nullable=False),
    Column("count", Integer, nullable=False, default=0),
    UniqueConstraint("usage_date", "ip_address", name="uq_anon_pdf_day_ip"),
)

user_subscriptions = Table(
    "user_subscriptions",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("user_id", Integer, ForeignKey("users.id"), unique=True, nullable=False),
    Column("plan", String(32), nullable=False),
    Column("status", String(32), nullable=False, default="none"),
    Column("provider", String(32), nullable=True),
    Column("provider_subscription_id", String(255), nullable=True),
    Column("current_period_end", DateTime, nullable=True),
    Column("updated_at", DateTime, default=datetime.utcnow),
)

users = Table(
    "users",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("email", String(255), unique=True, nullable=False),
    Column("hashed_password", String(255), nullable=False),
    Column("full_name", String(255), nullable=True),
    Column("email_verified", Boolean, nullable=False, default=False),
    Column("verification_token", String(128), nullable=True),
    Column("verification_expires_at", DateTime, nullable=True),
    Column("date_of_birth", Date, nullable=True),
    Column("gender", String(32), nullable=True),
    Column("avatar_stored_filename", String(255), nullable=True),
    Column("mobile_number", String(20), nullable=True),
    Column("is_admin", Boolean, nullable=False, default=False),
    Column("created_at", DateTime, default=datetime.utcnow),
)


# Documents table
documents = Table(
    "documents",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("original_filename", String, nullable=False),
    Column("stored_filename", String, nullable=False),
    Column("filepath", String, nullable=False),
    Column("language", String, nullable=False),
    Column("created_at", DateTime, default=datetime.utcnow),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=True),
)

# Extracted text table
extracted_texts = Table(
    "extracted_texts",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("document_id", Integer, ForeignKey("documents.id")),
    Column("content", Text, default=""),
    Column("created_at", DateTime, default=datetime.utcnow),
)
