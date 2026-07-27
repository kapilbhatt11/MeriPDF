# backend/app/services/ocr.py
from pathlib import Path
import pytesseract
from pdf2image import convert_from_path
from PIL import Image, ImageFilter, ImageOps
import re

from app.services.db_ops import update_extracted_text

POPPLER_PATH = r"C:\poppler-25.07.0\Library\bin"
DEFAULT_LANG = "eng"


def preprocess_image(img: Image.Image) -> Image.Image:
    """🖼️ Preprocess image for better OCR."""
    img = img.convert("L")  # grayscale
    if min(img.size) < 800:
        img = img.resize((img.width * 2, img.height * 2), Image.LANCZOS)
    img = ImageOps.autocontrast(img, cutoff=1)
    img = img.filter(ImageFilter.SHARPEN)
    return img

def clean_ocr_text(text: str) -> str:
    """🧹 Clean up common Tesseract garbage lines."""
    # Remove multiple consecutive blank lines
    text = re.sub(r'\n\s*\n', '\n\n', text)
    
    cleaned_lines = []
    for line in text.split('\n'):
        if line.startswith("--- Page ") or not line.strip():
            cleaned_lines.append(line)
            continue
            
        # If a line is mostly symbols (garbage from borders/lines), drop it
        alnum_count = sum(c.isalnum() for c in line)
        if len(line.strip()) > 3 and alnum_count < len(line.strip()) * 0.3:
            continue
            
        cleaned_lines.append(line)
        
    return '\n'.join(cleaned_lines).strip()


import asyncio

async def process_and_extract(file_path: Path, text_path: Path, lang: str, stored_name: str):
    """🔍 Run OCR and save results without blocking the event loop."""
    text = ""
    config = "--oem 3 --psm 6"

    try:
        if file_path.suffix.lower() == ".pdf":
            pages = await asyncio.to_thread(
                convert_from_path, str(file_path), dpi=300, poppler_path=POPPLER_PATH
            )
            for i, page in enumerate(pages):
                proc = await asyncio.to_thread(preprocess_image, page)
                raw = await asyncio.to_thread(
                    pytesseract.image_to_string, proc, lang=lang, config=config
                )
                text += f"\n--- Page {i+1} ---\n{raw}"
        else:
            img = await asyncio.to_thread(Image.open, file_path)
            proc = await asyncio.to_thread(preprocess_image, img)
            text = await asyncio.to_thread(
                pytesseract.image_to_string, proc, lang=lang, config=config
            )

    except Exception as e:
        text = f"[OCR error] {e}"

    cleaned_text = clean_ocr_text(text)

    # Save to text file
    await asyncio.to_thread(text_path.write_text, cleaned_text, encoding="utf-8")

    # Update DB
    await update_extracted_text(stored_name, cleaned_text)

