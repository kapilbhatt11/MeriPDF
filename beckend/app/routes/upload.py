# backend/app/routes/upload.py
from fastapi import APIRouter, UploadFile, File, BackgroundTasks, Query, Depends
from pathlib import Path
import uuid
from datetime import datetime

from app.services.files import save_file
from app.services.ocr import process_and_extract
from app.services.db_ops import save_new_document
from app.deps import get_current_verified_user

router = APIRouter()

BASE_DIR = Path(__file__).resolve().parent.parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
TEXT_DIR = BASE_DIR / "extracted_text"
UPLOAD_DIR.mkdir(exist_ok=True, parents=True)
TEXT_DIR.mkdir(exist_ok=True, parents=True)

DEFAULT_LANG = "eng"


@router.post("/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_verified_user),
    file: UploadFile = File(...),
    lang: str = Query(DEFAULT_LANG),
):
    # Normalize language string (e.g., "eng hin" -> "eng+hin", "eng,hin" -> "eng+hin")
    if lang:
        lang = lang.replace(" ", "+").replace(",", "+")

    original_name = file.filename
    ext = Path(file.filename).suffix or ".bin"
    uid = uuid.uuid4().hex
    stored_name = f"{uid}{ext}"
    dest_path = UPLOAD_DIR / stored_name

    await save_file(file, dest_path)

    text_filename = f"{uid}.txt"
    text_path = TEXT_DIR / text_filename

    doc_id = await save_new_document(
        original_name,
        stored_name,
        str(dest_path),
        lang,
        current_user["id"],
    )

    background_tasks.add_task(
        process_and_extract, dest_path, text_path, lang, stored_name
    )

    return {
        "status": "processing",
        "doc_id": doc_id,
        "original_filename": original_name,
        "stored_filename": stored_name,
        "created_at": datetime.utcnow().isoformat(),
    }
