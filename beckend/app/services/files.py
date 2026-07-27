# backend/app/services/files.py
from fastapi import UploadFile
from pathlib import Path
import aiofiles

async def save_file(file: UploadFile, dest_path: Path):
    """💾 Save uploaded file to disk (async)."""
    async with aiofiles.open(dest_path, "wb") as out_file:
        content = await file.read()
        await out_file.write(content)
