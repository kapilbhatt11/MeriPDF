# backend/app/services/pdf_tools.py
from pathlib import Path
from PyPDF2 import PdfMerger
import uuid
from PyPDF2 import PdfReader, PdfWriter
import os
import uuid

# app/services/pdf_tools.py
import fitz  # PyMuPDF
import io
import zipfile
from fastapi import UploadFile
from typing import List


BASE_DIR = Path(__file__).resolve().parent.parent
OUTPUT_DIR = BASE_DIR / "marge_pdf_outputs"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


OUTPUT_SLIPT_DIR = "split_pdf_outputs"
os.makedirs(OUTPUT_SLIPT_DIR, exist_ok=True)

def merge_pdfs(file_paths: list[Path]) -> str:
    """Merge multiple PDFs into one file and return output path."""
    merger = PdfMerger()
    for pdf in file_paths:
        merger.append(str(pdf))
    output_filename = f"merged_{uuid.uuid4().hex}.pdf"
    output_path = OUTPUT_DIR / output_filename
    merger.write(str(output_path))
    merger.close()
    return str(output_path)


# Split PDF by page ranges
def split_pdf_service(file, page_ranges: str):
    """
    Split PDF by page ranges (example: "1-3,5,7-9")
    Returns: path of split pdf
    """
    reader = PdfReader(file)
    writer = PdfWriter()

    # parse ranges
    ranges = []
    for part in page_ranges.split(","):
        part = part.strip()
        if "-" in part:
            start, end = part.split("-")
            ranges.extend(range(int(start), int(end)+1))
        else:
            ranges.append(int(part))

    # add selected pages
    for page_num in ranges:
        if 1 <= page_num <= len(reader.pages):
            writer.add_page(reader.pages[page_num-1])

    # save output
    output_filename = f"split_{uuid.uuid4().hex}.pdf"
    output_path = os.path.join(OUTPUT_SLIPT_DIR, output_filename)
    with open(output_path, "wb") as f:
        writer.write(f)

    return output_path

# pdf split logic


async def split_all_pages(file: UploadFile):
    """Split all pages of a PDF into separate files and return ZIP"""
    pdf_bytes = await file.read()
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w") as zipf:
        for i in range(len(doc)):
            single = fitz.open()
            single.insert_pdf(doc, from_page=i, to_page=i)
            pdf_bytes = single.tobytes()
            zipf.writestr(f"page_{i+1}.pdf", pdf_bytes)

    zip_buffer.seek(0)
    return zip_buffer


async def split_manual(file: UploadFile, pages: List[int]):
    """Split selected pages only"""
    pdf_bytes = await file.read()
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    output = fitz.open()

    for p in pages:
        if 1 <= p <= len(doc):
            output.insert_pdf(doc, from_page=p-1, to_page=p-1)

    result = io.BytesIO(output.tobytes())
    result.seek(0)
    return result


async def split_custom_pairs(file: UploadFile, ranges: List[dict], merge_all: bool = False):
    """Split using custom pairs like [{from:1, to:4}, {from:5, to:8}]"""
    pdf_bytes = await file.read()
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    zip_buffer = io.BytesIO()
    zipf = zipfile.ZipFile(zip_buffer, "w")

    merged_doc = fitz.open()

    for i, r in enumerate(ranges):
        start, end = r.get("from", 1), r.get("to", 1)
        new_doc = fitz.open()
        new_doc.insert_pdf(doc, from_page=start-1, to_page=end-1)

        if merge_all:
            merged_doc.insert_pdf(new_doc)
        else:
            zipf.writestr(f"pair_{i+1}_{start}-{end}.pdf", new_doc.tobytes())

    if merge_all:
        zipf.writestr("merged_pairs.pdf", merged_doc.tobytes())

    zipf.close()
    zip_buffer.seek(0)
    return zip_buffer


async def split_fixed_pairs(file: UploadFile, fixed_size: int):
    """Split PDF into equal fixed-size pairs"""
    pdf_bytes = await file.read()
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")

    zip_buffer = io.BytesIO()
    zipf = zipfile.ZipFile(zip_buffer, "w")

    for i in range(0, len(doc), fixed_size):
        new_doc = fitz.open()
        new_doc.insert_pdf(doc, from_page=i, to_page=min(i+fixed_size-1, len(doc)-1))
        zipf.writestr(f"pair_{i//fixed_size + 1}.pdf", new_doc.tobytes())

    zipf.close()
    zip_buffer.seek(0)
    return zip_buffer


# ----------------------------------------------------------------------
# 🗜️ COMPRESS PDF

# backend/app/services/pdf_tools.py

# import os
# import fitz  # PyMuPDF

# def compress_pdfs(file_paths: list, compression_level: str) -> str:
#     output_dir = "compressed_pdf_outputs"
#     os.makedirs(output_dir, exist_ok=True)
#     output_path = os.path.join(output_dir, "compressed_output.pdf")

#     if compression_level == "extreme":
#         zoom = 0.6
#     elif compression_level == "less":
#         zoom = 1.0
#     else:  # recommended
#         zoom = 0.8

#     merged_doc = fitz.open()

#     for path in file_paths:
#         doc = fitz.open(path)
#         for page in doc:
#             pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
#             img_pdf = fitz.open()
#             img_pdf.new_page(width=pix.width, height=pix.height)
#             img_pdf[-1].insert_image(img_pdf[-1].rect, pixmap=pix)
#             merged_doc.insert_pdf(img_pdf)

#     merged_doc.save(output_path)
#     merged_doc.close()
#     return output_path

# ------------------------------------------------------------

import os
import subprocess
from PyPDF2 import PdfMerger
from typing import List

# ✅ Windows Ghostscript path (confirm once)
GS_PATH = r"C:\Program Files\gs\gs10.06.0\bin\gswin64c.exe"


def _ghostscript_compress(
    input_path: str, output_path: str, compression_level: str
) -> None:
    """Run Ghostscript on a single PDF with the desired quality preset."""
    quality_map = {
        "extreme": "/screen",        # 🔥 max compression
        "recommended": "/ebook",     # ⚖️ balance
        "less": "/printer",          # 🧾 best quality
    }
    gs_quality = quality_map.get(compression_level, "/ebook")

    subprocess.run(
        [
            GS_PATH,
            "-sDEVICE=pdfwrite",
            "-dCompatibilityLevel=1.4",
            f"-dPDFSETTINGS={gs_quality}",
            "-dNOPAUSE",
            "-dQUIET",
            "-dBATCH",
            f"-sOutputFile={output_path}",
            input_path,
        ],
        check=True,
    )


def compress_pdfs(file_paths: List[str], compression_level: str, mode: str = "merged"):
    """
    Compress PDFs in two modes:
      - mode == "merged": merge all, compress into ONE PDF
      - mode == "per-file": compress each separately, return ZIP path
    """
    output_dir = "compressed_pdf_outputs"
    os.makedirs(output_dir, exist_ok=True)

    # Normalize mode
    mode = (mode or "merged").lower()
    if mode not in {"merged", "per-file"}:
        mode = "merged"

    if mode == "merged":
        merged_path = os.path.join(output_dir, "merged_temp.pdf")
        output_path = os.path.join(output_dir, "compressed_output.pdf")

        # 🔹 Merge PDFs first
        merger = PdfMerger()
        for path in file_paths:
            merger.append(path)
        merger.write(merged_path)
        merger.close()

        original_size = os.path.getsize(merged_path)

        # 🔹 Compress merged file
        _ghostscript_compress(merged_path, output_path, compression_level)

        compressed_size = os.path.getsize(output_path)

        return {
            "mode": "merged",
            "file_path": output_path,
            "original_size": original_size,
            "compressed_size": compressed_size,
            "file_name": "compressed.pdf",
        }

    # ---------- per-file mode ----------
    # Compress each file separately into a ZIP archive
    import zipfile  # local import to avoid unused in merged mode

    zip_path = os.path.join(output_dir, "compressed_files.zip")

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for idx, path in enumerate(file_paths, start=1):
            if not os.path.isfile(path):
                continue
            base_name = os.path.basename(path)
            single_out = os.path.join(output_dir, f"compressed_{idx}_{base_name}")
            _ghostscript_compress(path, single_out, compression_level)
            zf.write(single_out, arcname=f"compressed_{base_name}")

    total_original = sum(
        os.path.getsize(p) for p in file_paths if os.path.isfile(p)
    )
    total_compressed = os.path.getsize(zip_path)

    return {
        "mode": "per-file",
        "file_path": zip_path,
        "original_size": total_original,
        "compressed_size": total_compressed,
        "file_name": "compressed_files.zip",
    }
