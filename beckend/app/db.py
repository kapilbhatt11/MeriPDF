# backend/app/db.py
import os
from sqlalchemy import MetaData
from databases import Database

# Use environment variable of the hosted database in production, fallback to local URL
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:12345@localhost:5432/meripdf")

database = Database(DATABASE_URL)
metadata = MetaData()

