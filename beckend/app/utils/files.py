from pathlib import Path
from fastapi import UploadFile
import aiofiles

# Base folders
BASE_DIR = Path(__file__).resolve().parent.parent.parent  # backend/
UPLOAD_DIR = BASE_DIR / "uploads"
TEXT_DIR = BASE_DIR / "extracted_text"

# Ensure directories exist
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
TEXT_DIR.mkdir(parents=True, exist_ok=True)

async def save_file(file: UploadFile, dest_path: Path):
    """Save uploaded file to disk asynchronously."""
    async with aiofiles.open(dest_path, "wb") as out_file:
        content = await file.read()
        await out_file.write(content)
    await file.close()