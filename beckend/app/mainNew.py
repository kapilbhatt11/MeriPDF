# backend/app/main.py
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, Query
from fastapi.responses import JSONResponse
from pathlib import Path
import aiofiles
import pytesseract
import uuid
import os
from pdf2image import convert_from_path
from PIL import Image, ImageFilter, ImageOps
from spellchecker import SpellChecker

from app import models
from app.db import database, metadata, DATABASE_URL
from sqlalchemy import create_engine
from app.models import documents, extracted_texts





app = FastAPI(title="MeriPDF - OCR Service (block + line modes)")

@app.on_event("startup")
async def startup():
    await database.connect()
    engine = create_engine(DATABASE_URL)
    metadata.create_all(engine)  # tables auto create

@app.on_event("shutdown")
async def shutdown():
    await database.disconnect()



# --- Config ---
BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
UPLOAD_DIR = BASE_DIR / "uploads"
TEXT_DIR = BASE_DIR / "extracted_text"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
TEXT_DIR.mkdir(parents=True, exist_ok=True)

# Set to your poppler bin path (Windows). If poppler in PATH, you can set to None.
_local_poppler = r"C:\poppler-25.07.0\Library\bin"
POPPLER_PATH = _local_poppler if os.path.exists(_local_poppler) else None

# Default OCR language
DEFAULT_LANG = "eng"

# SpellChecker setup (lightweight)
spell = SpellChecker()



# ---------------- Utilities ----------------
async def save_file(file: UploadFile, dest_path: Path):
    """Save uploaded file to disk (async)."""
    async with aiofiles.open(dest_path, "wb") as out_file:
        content = await file.read()
        await out_file.write(content)

def correct_text_with_spellchecker(text: str) -> str:
    """Simple word-level correction using pyspellchecker."""
    if not text or text.strip() == "":
        return text
    corrected = []
    for token in text.split():
        # keep punctuation tokens intact
        core = token.strip()
        if core == "":
            corrected.append(token)
            continue
        # check only alphabetic words
        word = core
        # preserve case: convert to lower for correction then keep original case naive
        lower = word.lower()
        suggestion = spell.correction(lower)
        if suggestion is None:
            corrected.append(word)
        else:
            # basic restore capitalization if original was capitalized
            if word[0].isupper():
                corrected.append(suggestion.capitalize())
            else:
                corrected.append(suggestion)
    return " ".join(corrected)

def preprocess_image_for_ocr(pil_image: Image.Image) -> Image.Image:
    """Robust PIL-only preprocessing:
       - grayscale
       - upscale small images
       - autocontrast
       - light sharpen
    Returns PIL Image (mode 'L').
    """
    img = pil_image.convert("L")  # grayscale

    # Upscale if small (helps OCR)
    min_side = min(img.size)
    if min_side < 800:
        scale_factor = 2.0
        new_size = (int(img.width * scale_factor), int(img.height * scale_factor))
        img = img.resize(new_size, Image.LANCZOS)

    # Improve contrast automatically
    img = ImageOps.autocontrast(img, cutoff=1)

    # Light denoise/median might be added if needed:
    # img = img.filter(ImageFilter.MedianFilter(size=3))

    # Slight sharpen
    img = img.filter(ImageFilter.SHARPEN)

    return img

# ---------------- Core OCR worker ----------------
async def process_and_extract(
    file_path: Path,
    text_save_path: Path,
    lang: str = DEFAULT_LANG,
    psm_mode: int = 6,
    use_whitelist: bool = False,
    apply_spellcorr: bool = False
):
    """
    file_path: uploaded file path
    text_save_path: where to write result
    psm_mode: page segmentation mode (6=block, 7=single-line)
    use_whitelist: when True, restrict characters (useful for short text)
    apply_spellcorr: if True, apply lightweight spell correction
    """
    text = ""
    # build base tesseract config
    base_config = f"--oem 3 --psm {psm_mode}"
    if use_whitelist:
        # allow english letters and basic punctuation/space
        base_config += " -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,:;!?()-/ "

    try:
        if file_path.suffix.lower() == ".pdf":
            pages = convert_from_path(str(file_path), dpi=150, poppler_path=POPPLER_PATH)
            for i, page in enumerate(pages):
                proc = preprocess_image_for_ocr(page)
                raw = pytesseract.image_to_string(proc, lang=lang, config=base_config)
                if apply_spellcorr:
                    raw = correct_text_with_spellchecker(raw)
                text += f"\n--- Page {i+1} ---\n{raw}"
        else:
            image = Image.open(file_path)
            # debug: print DPI info (comment out in prod)
            print("DEBUG: image dpi:", image.info.get("dpi"))
            proc = preprocess_image_for_ocr(image)
            raw = pytesseract.image_to_string(proc, lang=lang, config=base_config)
            if apply_spellcorr:
                raw = correct_text_with_spellchecker(raw)
            text = raw
    except Exception as e:
        # On error, write error message into the text file so user can see failure reason
        text = f"[OCR processing error] {e}"

    # ensure something is always written (even empty)
    text_save_path.write_text(text or "", encoding="utf-8")
    
    
    # DB में save
    await save_result_to_db(file_path.name, str(file_path), lang, text)

# ---------------- Endpoints ----------------
@app.post("/upload")
async def upload_block(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    lang: str = Query(DEFAULT_LANG, description="OCR language, e.g. eng, hin, eng+hin")
):
    """
    Multi-line / document mode (recommended for PDFs and long docs).
    Uses PSM=6 (assumes blocks of text).
    """
    ext = Path(file.filename).suffix or ".bin"
    uid = uuid.uuid4().hex
    dest_filename = f"{uid}{ext}"
    dest_path = UPLOAD_DIR / dest_filename

    await save_file(file, dest_path)

    text_filename = f"{uid}.txt"
    text_path = TEXT_DIR / text_filename

    # Background: psm_mode=6, no whitelist, no auto spellcorr (can enable if you want)
    background_tasks.add_task(process_and_extract, dest_path, text_path, lang, 6, False, False)

    return JSONResponse(
        {"status": "processing", "file_saved": str(dest_path), "text_will_be": str(text_path)}
    )

@app.post("/upload/line")
async def upload_line(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    lang: str = Query(DEFAULT_LANG, description="OCR language, e.g. eng"),
    spellcorr: bool = Query(True, description="Apply lightweight spell correction (default true)")
):
    """
    Single-line / short text mode.
    Uses PSM=7 + whitelist + optional spell-correction (good for headings, single-line screenshots).
    """
    ext = Path(file.filename).suffix or ".bin"
    uid = uuid.uuid4().hex
    dest_filename = f"{uid}{ext}"
    dest_path = UPLOAD_DIR / dest_filename

    await save_file(file, dest_path)

    text_filename = f"{uid}.txt"
    text_path = TEXT_DIR / text_filename

    # Background: psm_mode=7, whitelist on, optional spell correction
    background_tasks.add_task(process_and_extract, dest_path, text_path, lang, 7, True, bool(spellcorr))

    return JSONResponse(
        {"status": "processing", "file_saved": str(dest_path), "text_will_be": str(text_path)}
    )

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/extracted/{name}")
async def get_extracted(name: str):
    p = TEXT_DIR / name
    if not p.exists():
        return JSONResponse({"error": "not found"}, status_code=404)
    return JSONResponse({"filename": name, "content": p.read_text(encoding="utf-8")})



async def save_result_to_db(filename, filepath, lang, content):
    # documents table में insert
    query_doc = documents.insert().values(
        filename=filename,
        filepath=filepath,
        language=lang
    )
    doc_id = await database.execute(query_doc)

    # extracted_texts table में insert
    query_text = extracted_texts.insert().values(
        document_id=doc_id,
        content=content
    )
    await database.execute(query_text)

    return doc_id

@app.get("/documents")
async def list_documents():
    query = documents.select()
    return await database.fetch_all(query)

@app.get("/documents/{doc_id}")
async def get_document(doc_id: int):
    query = documents.select().where(documents.c.id == doc_id)
    doc = await database.fetch_one(query)
    if not doc:
        return {"error": "not found"}

    query_text = extracted_texts.select().where(extracted_texts.c.document_id == doc_id)
    text = await database.fetch_one(query_text)

    return {
        "document": dict(doc),
        "text": text["content"] if text else ""
    }
