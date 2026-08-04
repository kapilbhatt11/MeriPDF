# beckend/app/routes/pdf_tools.py
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import StreamingResponse, FileResponse
from typing import List
from pathlib import Path
import tempfile
import io, json, zipfile, os
import fitz  # PyMuPDF
from PyPDF2 import PdfReader, PdfWriter
from app.services import pdf_tools

import tempfile, os, shutil, uuid

from app.services.pdf_tools import compress_pdfs

def to_roman(n: int) -> str:
    if n <= 0: return str(n)
    val = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1]
    syb = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"]
    roman_num = ""
    i = 0
    while n > 0:
        for _ in range(n // val[i]):
            roman_num += syb[i]
            n -= val[i]
        i += 1
    return roman_num

def to_alpha(n: int) -> str:
    if n <= 0: return str(n)
    string = ""
    while n > 0:
        n, remainder = divmod(n - 1, 26)
        string = chr(65 + remainder) + string
    return string

def to_words(n: int) -> str:
    d = { 0 : 'Zero', 1 : 'One', 2 : 'Two', 3 : 'Three', 4 : 'Four', 5 : 'Five',
          6 : 'Six', 7 : 'Seven', 8 : 'Eight', 9 : 'Nine', 10 : 'Ten',
          11 : 'Eleven', 12 : 'Twelve', 13 : 'Thirteen', 14 : 'Fourteen',
          15 : 'Fifteen', 16 : 'Sixteen', 17 : 'Seventeen', 18 : 'Eighteen',
          19 : 'Nineteen', 20 : 'Twenty',
          30 : 'Thirty', 40 : 'Forty', 50 : 'Fifty', 60 : 'Sixty',
          70 : 'Seventy', 80 : 'Eighty', 90 : 'Ninety' }
    if n in d: return d[n]
    if n < 100:
        return d[n // 10 * 10] + ' ' + d[n % 10]
    return str(n)

def to_devnagrik(n: int) -> str:
    dev_chars = "०१२३४५६७८९"
    return "".join(dev_chars[int(d)] for d in str(n))

def hex_to_rgb(hex_str: str):
    try:
        hex_str = hex_str.lstrip('#')
        if len(hex_str) == 3:
            hex_str = "".join([c*2 for c in hex_str])
        return tuple(int(hex_str[i:i+2], 16) / 255.0 for i in (0, 2, 4))
    except Exception:
        return (0, 0, 0) # Fallback to black


def safe_float(val, default: float = 0.0) -> float:
    if val is None:
        return default
    try:
        import math
        f_val = float(val)
        if math.isnan(f_val) or math.isinf(f_val):
            return default
        return f_val
    except (ValueError, TypeError):
        return default


def _parse_pages(pages: str) -> List[int]:
    """
    Accept pages as:
      - JSON list string: "[1,3,5]"
      - Comma-separated string: "1,3,5"
    Returns list[int].
    """
    if pages is None:
        return []
    pages = pages.strip()
    if not pages:
        return []
    if pages.startswith("["):
        parsed = json.loads(pages)
        if not isinstance(parsed, list):
            raise ValueError("pages must be a JSON list")
        return [int(x) for x in parsed]
    return [int(p.strip()) for p in pages.split(",") if p.strip()]


def _parse_ranges(ranges: str) -> List[dict]:
    """
    Accept ranges as:
      - JSON list of objects: '[{"from":1,"to":3},{"from":4,"to":6}]'
      - Range string: "1-3,4-6"
    Returns list[{"from": int, "to": int}].
    """
    if ranges is None:
        return []
    ranges = ranges.strip()
    if not ranges:
        return []
    if ranges.startswith("["):
        parsed = json.loads(ranges)
        if not isinstance(parsed, list):
            raise ValueError("ranges must be a JSON list")
        out: List[dict] = []
        for item in parsed:
            if not isinstance(item, dict) or "from" not in item or "to" not in item:
                raise ValueError("ranges JSON must contain objects with 'from' and 'to'")
            out.append({"from": int(item["from"]), "to": int(item["to"])})
        return out

    out: List[dict] = []
    for part in ranges.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" not in part:
            raise ValueError(f"Invalid range '{part}'. Expected 'from-to'.")
        start_s, end_s = part.split("-", 1)
        out.append({"from": int(start_s.strip()), "to": int(end_s.strip())})
    return out




# ✅ Two separate routers for clean API
router_merge = APIRouter(prefix="/pdf", tags=["Merge PDF"])
router_split = APIRouter(prefix="/split/pdf", tags=["Split PDF"])

# router_compress = APIRouter(prefix="/compress/pdf", tags=["Compress Tools"])
router_compress = APIRouter(prefix="/compress/pdf", tags=["Compress PDF"])



# ---------------------------------------------------------------------
# 🧩 MERGE PDFs  (old working version)
# ---------------------------------------------------------------------
@router_merge.post("/merge-pdf")
async def merge_pdf(files: list[UploadFile] = File(...), rotations: str = Form("[]")):
    """Merge PDFs with optional rotation"""
    try:
        try:
            rotations = json.loads(rotations)
        except Exception:
            rotations = []

        doc = fitz.open()

        for file in files:
            pdf_bytes = await file.read()
            src_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            
            rotation = 0
            for r in rotations:
                if r.get("name") == file.filename:
                    rotation = int(r.get("rotation", 0))
                    break

            if rotation != 0:
                for page in src_doc:
                    page.set_rotation((page.rotation + rotation) % 360)

            doc.insert_pdf(src_doc)
            src_doc.close()

        output_path = Path("merge_pdf_outputs/merged.pdf")
        output_path.parent.mkdir(parents=True, exist_ok=True)

        doc.save(str(output_path), garbage=3, deflate=True)
        doc.close()

        return FileResponse(output_path, media_type="application/pdf", filename="MeriPDF_Merged.pdf")

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Merge failed: {e}")


# ---------------------------------------------------------------------
# 🗑️ REMOVE PAGES
# ---------------------------------------------------------------------
@router_merge.post("/remove-pages")
async def remove_pages(file: UploadFile = File(...), pages: str = Form("[]")):
    """Remove specific pages from PDF"""
    try:
        pages_to_remove = set(_parse_pages(pages))
        pdf_bytes = await file.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        # 0-based indexing for fitz
        zero_based = [p - 1 for p in pages_to_remove if 1 <= p <= len(doc)]
        zero_based.sort(reverse=True) # delete from back to front to avoid index shifting
        
        for p in zero_based:
            doc.delete_page(p)
            
        out_buf = io.BytesIO()
        doc.save(out_buf)
        doc.close()
        out_buf.seek(0)
        
        return StreamingResponse(
            out_buf,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=removed_pages.pdf"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to remove pages: {e}")


# ---------------------------------------------------------------------
# ✂️ EXTRACT PAGES (NEW PDF)
# ---------------------------------------------------------------------
@router_merge.post("/extract-pages")
async def extract_pages(file: UploadFile = File(...), pages: str = Form("[]")):
    """Keep only specific pages and create a new PDF"""
    try:
        pages_to_keep = _parse_pages(pages)
        pdf_bytes = await file.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        out_doc = fitz.open()
        for p in pages_to_keep:
            if 1 <= p <= len(doc):
                out_doc.insert_pdf(doc, from_page=p-1, to_page=p-1)
                
        out_buf = io.BytesIO()
        out_doc.save(out_buf)
        out_doc.close()
        doc.close()
        out_buf.seek(0)
        
        return StreamingResponse(
            out_buf,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=extracted_pages.pdf"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to extract pages: {e}")


# ---------------------------------------------------------------------
# 🔄 ROTATE PDF
# ---------------------------------------------------------------------
@router_merge.post("/rotate")
async def rotate_pdf(files: List[UploadFile] = File(...), rotations: str = Form("{}")):
    """Rotate precise pages by respective angles. Returns a ZIP of rotated PDFs."""
    import json
    import zipfile
    try:
        try:
            rotations_map = json.loads(rotations)
        except json.JSONDecodeError:
            rotations_map = {}
            
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w") as zipf:
            for idx, file in enumerate(files):
                pdf_bytes = await file.read()
                doc = fitz.open(stream=pdf_bytes, filetype="pdf")
                
                file_rotations = rotations_map.get(str(idx), {})
                
                for page in doc:
                    pn = str(page.number + 1)
                    offset = int(file_rotations.get(pn, 0))
                    if offset != 0:
                        page.set_rotation((page.rotation + offset) % 360)
                
                out_buf = io.BytesIO()
                doc.save(out_buf)
                doc.close()
                out_buf.seek(0)
                zipf.writestr(file.filename or f"rotated_{idx}.pdf", out_buf.read())

        zip_buffer.seek(0)
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={
                "Content-Disposition": "attachment; filename=rotated_files.zip",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to rotate PDFs: {e}")


# ---------------------------------------------------------------------
# ✂️ SPLIT - All Pages (ZIP)
# ---------------------------------------------------------------------
@router_split.post("/split/all")
async def split_all(file: UploadFile = File(...)):
    """Split all pages into separate PDFs (ZIP)"""
    try:
        zip_buffer = await pdf_tools.split_all_pages(file)
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": "attachment; filename=split_all_pages.zip"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Split all failed: {e}")


# ---------------------------------------------------------------------
# ✂️ SPLIT - Manual Selection (ZIP Fix)
# ---------------------------------------------------------------------
@router_split.post("/split/manual")
async def split_manual(file: UploadFile = File(...), pages: str = Form(...)):
    """
    Split only manually selected pages.
    Example input: pages="[1,3,5,7]"
    """
    try:
        pages_list = _parse_pages(pages)
        pdf_bytes = await file.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w") as zipf:
            for p in pages_list:
                if 1 <= p <= len(doc):
                    single = fitz.open()
                    single.insert_pdf(doc, from_page=p - 1, to_page=p - 1)
                    zipf.writestr(f"page_{p}.pdf", single.tobytes())

        zip_buffer.seek(0)
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": "attachment; filename=manual_selected_pages.zip"}
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Manual split failed: {e}")


# ---------------------------------------------------------------------
# ✂️ SPLIT - Custom Pairs (with merge option)
# ---------------------------------------------------------------------
@router_split.post("/split/custom")
async def split_custom(
    file: UploadFile = File(...),
    ranges: str = Form(...),
    merge_all: bool = Form(False)
):
    """Split custom pairs (with option to merge all pairs)"""
    try:
        ranges_data = _parse_ranges(ranges)
        zip_buffer = await pdf_tools.split_custom_pairs(file, ranges_data, merge_all)
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": "attachment; filename=custom_pairs.zip"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Custom split failed: {e}")


# ---------------------------------------------------------------------
# ✂️ SPLIT - Fixed Size Pairs
# ---------------------------------------------------------------------
@router_split.post("/split/fixed")
async def split_fixed(file: UploadFile = File(...), fixed_size: int = Form(...)):
    """Split PDF into equal-sized pairs"""
    try:
        if fixed_size < 1:
            raise HTTPException(status_code=400, detail="fixed_size must be >= 1")

        zip_buffer = await pdf_tools.split_fixed_pairs(file, fixed_size)
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": "attachment; filename=fixed_pairs.zip"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fixed split failed: {e}")
# ---------------------------------------------------------------------


# 🗜️ COMPRESS PDF


# @router_compress.post("/compress")
# async def compress_pdf(
#     files: List[UploadFile] = File(...),
#     compression_level: str = Form(...)
# ):
#     try:
#         temp_paths = []

#         for file in files:
#             temp_path = os.path.join(tempfile.gettempdir(), f"{file.filename}")
#             with open(temp_path, "wb") as f:
#                 f.write(await file.read())
#             temp_paths.append(temp_path)

#         output_path = compress_pdfs(temp_paths, compression_level)

#         return FileResponse(
#             output_path,
#             media_type="application/pdf",
#             filename="compressed.pdf"
#         )

#     except Exception as e:
#         print("❌ Compression failed:", e)
#         raise HTTPException(status_code=500, detail="Compression failed")


@router_compress.post("/compress")
async def compress_pdf(
    files: List[UploadFile] = File(...),
    compression_level: str = Form(...),
    mode: str = Form("merged"),
):
    try:
        temp_files = []

        for file in files:
            temp_path = os.path.join(
                tempfile.gettempdir(),
                f"{uuid.uuid4()}.pdf"
            )
            with open(temp_path, "wb") as f:
                shutil.copyfileobj(file.file, f)
            temp_files.append(temp_path)

        result = compress_pdfs(temp_files, compression_level, mode)

        return FileResponse(
            result["file_path"],
            media_type="application/zip" if result.get("mode") == "per-file" else "application/pdf",
            filename=result["file_name"]
        )

    except Exception as e:
        print("❌ Compression failed:", e)
        raise HTTPException(status_code=500, detail="Compression failed")

# ---------------------------------------------------------------------
# 🛠️ REPAIR PDF (Advanced Multi-layered Engine)
# ---------------------------------------------------------------------
@router_merge.post("/repair")
async def repair_pdf(file: UploadFile = File(...)):
    try:
        raw_bytes = await file.read()
        if not raw_bytes:
            raise HTTPException(status_code=400, detail="Empty file uploaded.")
            
        # --- Pre-processing (Binary Patching) ---
        # 1. Header Fix
        pdf_start = raw_bytes.find(b'%PDF-')
        if pdf_start == -1:
            raw_bytes = b'%PDF-1.4\n' + raw_bytes
        elif pdf_start > 0:
            raw_bytes = raw_bytes[pdf_start:]
            
        # 2. EOF Fix
        if b'%%EOF' not in raw_bytes[-1024:]:
            raw_bytes += b'\n%%EOF\n'

        # --- Layer 1: PyPDF2 Gentle Rebuild (Primary for Font Preservation) ---
        try:
            from PyPDF2 import PdfReader, PdfWriter
            reader = PdfReader(io.BytesIO(raw_bytes), strict=False)
            if reader.is_encrypted:
                raise Exception("ENCRYPTED")
            
            writer = PdfWriter()
            for page in reader.pages:
                writer.add_page(page)
            
            out_buf = io.BytesIO()
            writer.write(out_buf)
            out_buf.seek(0)
            return StreamingResponse(
                out_buf,
                media_type="application/pdf",
                headers={"Content-Disposition": "attachment; filename=repaired.pdf"}
            )
        except Exception as e:
            if str(e) == "ENCRYPTED":
                raise HTTPException(status_code=403, detail="File is encrypted. Please unlock it first.")
            print(f"Layer 1 (PyPDF2) Repair Failed: {e}. Trying Layer 1.2 (pikepdf)...")

        # --- Layer 1.2: pikepdf Structural Rebuild (Excellent at salvaging objects/streams) ---
        try:
            import pikepdf
            in_io = io.BytesIO(raw_bytes)
            with pikepdf.Pdf.open(in_io) as pdf:
                out_io = io.BytesIO()
                pdf.save(out_io)
                out_io.seek(0)
                print("Layer 1.2 (pikepdf) Repair Succeeded!")
                return StreamingResponse(
                    out_io,
                    media_type="application/pdf",
                    headers={"Content-Disposition": "attachment; filename=repaired.pdf"}
                )
        except Exception as pikepdf_err:
            print(f"Layer 1.2 (pikepdf) Repair Failed: {pikepdf_err}. Trying Layer 1.5 (Ghostscript)...")

        # --- Layer 1.5: Ghostscript Structural Rebuild (Best recovery for stream issues) ---
        try:
            import subprocess
            import uuid
            
            gs_path = getattr(pdf_tools, "GS_PATH", r"C:\Program Files\gs\gs10.06.0\bin\gswin64c.exe")
            gs_exec = gs_path if os.path.exists(gs_path) else "gswin64c"
            
            temp_dir = tempfile.gettempdir()
            in_temp = os.path.join(temp_dir, f"gs_in_{uuid.uuid4().hex}.pdf")
            out_temp = os.path.join(temp_dir, f"gs_out_{uuid.uuid4().hex}.pdf")
            
            try:
                with open(in_temp, "wb") as f:
                    f.write(raw_bytes)
                
                cmd = [
                    gs_exec,
                    "-dNOPAUSE",
                    "-dBATCH",
                    "-sDEVICE=pdfwrite",
                    f"-sOutputFile={out_temp}",
                    in_temp
                ]
                
                res = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
                
                if res.returncode == 0 and os.path.exists(out_temp) and os.path.getsize(out_temp) > 0:
                    with open(out_temp, "rb") as f:
                        repaired_bytes = f.read()
                    
                    out_buf = io.BytesIO(repaired_bytes)
                    print("Layer 1.5 (Ghostscript) Repair Succeeded!")
                    return StreamingResponse(
                        out_buf,
                        media_type="application/pdf",
                        headers={"Content-Disposition": "attachment; filename=repaired.pdf"}
                    )
                else:
                    print(f"Layer 1.5 (Ghostscript) Failed: code {res.returncode}")
            except Exception as gs_err:
                print(f"Layer 1.5 (Ghostscript) exception occurred: {gs_err}")
            finally:
                if os.path.exists(in_temp):
                    try: os.remove(in_temp)
                    except Exception: pass
                if os.path.exists(out_temp):
                    try: os.remove(out_temp)
                    except Exception: pass
        except Exception as init_err:
            print(f"Layer 1.5 (Ghostscript) init failed: {init_err}")

        # --- Layer 2: PyMuPDF Rebuild (Strong XREF rebuild) ---

        try:
            doc = fitz.open(stream=raw_bytes, filetype="pdf")
            if doc.needs_pass:
                raise Exception("ENCRYPTED")
            
            out_buf = io.BytesIO()
            doc.save(out_buf, clean=True, deflate=True)
            doc.close()
            out_buf.seek(0)
            return StreamingResponse(
                out_buf,
                media_type="application/pdf",
                headers={"Content-Disposition": "attachment; filename=repaired.pdf"}
            )
        except Exception as e:
            if str(e) == "ENCRYPTED":
                raise HTTPException(status_code=403, detail="File is encrypted. Please unlock it first.")
            print(f"Layer 2 (PyMuPDF) Repair Failed: {e}. Trying Layer 3...")

        # --- Layer 3: PyMuPDF Aggressive Rebuild (Heavy Corruption) ---
        try:
            doc = fitz.open(stream=raw_bytes, filetype="pdf")
            if len(doc) == 0:
                raise Exception("Zero pages detected.")
            
            out_buf = io.BytesIO()
            doc.save(out_buf, garbage=4, deflate=True)
            doc.close()
            out_buf.seek(0)
            return StreamingResponse(
                out_buf,
                media_type="application/pdf",
                headers={"Content-Disposition": "attachment; filename=repaired_heavy.pdf"}
            )
        except Exception as e:
            print(f"Layer 3 (Aggressive) Repair Failed: {e}. Trying Layer 4...")

        # --- Layer 4: Rasterization Fallback (Complete Re-render) ---
        try:
            doc = fitz.open(stream=raw_bytes, filetype="pdf")
            if len(doc) == 0:
                # If we cannot even find page boundaries, rasterization is impossible
                raise Exception("cannot save with zero pages")
                
            out_doc = fitz.open()
            
            for page in doc:
                pix = page.get_pixmap(dpi=150)
                img_bytes = pix.tobytes("jpeg")
                img_doc = fitz.open(stream=img_bytes, filetype="jpeg")
                img_pdf = img_doc.convert_to_pdf()
                temp_pdf = fitz.open("pdf", img_pdf)
                out_doc.insert_pdf(temp_pdf)
                temp_pdf.close()
                img_doc.close()
                
            if len(out_doc) == 0:
                raise Exception("Rasterized document has zero pages.")
                
            out_buf = io.BytesIO()
            # Saving the re-rendered images
            out_doc.save(out_buf, deflate=True)
            out_doc.close()
            doc.close()
            out_buf.seek(0)
            return StreamingResponse(
                out_buf,
                media_type="application/pdf",
                headers={"Content-Disposition": "attachment; filename=repaired_rasterized.pdf"}
            )
        except Exception as e:
            print(f"Layer 4 Repair Failed: {e}")
            raise HTTPException(status_code=422, detail="File is 100% irreparably destroyed and contains 0 valid pages.")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to repair PDF: {str(e)}")

# ---------------------------------------------------------------------
# 🔀 ORGANIZE PDF
# ---------------------------------------------------------------------
@router_merge.post("/organize")
async def organize_pdf(files: List[UploadFile] = File(...), config: str = Form("[]")):
    """ config should be a JSON array of configuration objects """
    try:
        import json
        instructions = json.loads(config)
        
        # Open all PDFs
        docs = []
        for file in files:
            pdf_bytes = await file.read()
            docs.append(fitz.open(stream=pdf_bytes, filetype="pdf"))
        
        out_doc = fitz.open()

        for ins in instructions:
            if ins.get("type") == "blank":
                # Standard A4 size: 595.27 x 841.89 points
                out_doc.new_page(width=595.27, height=841.89)
            elif ins.get("type") == "page":
                file_idx = int(ins.get("fileIndex", 0))
                page_idx = int(ins.get("originalIndex", 0))
                rotation = int(ins.get("rotation", 0))

                if 0 <= file_idx < len(docs):
                    doc = docs[file_idx]
                    if 0 <= page_idx < len(doc):
                        out_doc.insert_pdf(doc, from_page=page_idx, to_page=page_idx)
                        
                        # The newly inserted page is the last one in out_doc
                        new_page = out_doc[-1]
                        if rotation != 0:
                            new_page.set_rotation((new_page.rotation + rotation) % 360)

        out_buf = io.BytesIO()
        out_doc.save(out_buf, garbage=3, deflate=True)
        out_doc.close()

        for doc in docs:
            doc.close()

        out_buf.seek(0)
        return StreamingResponse(
            out_buf,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=organized.pdf"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to organize PDF: {e}")

# ---------------------------------------------------------------------
# 📱 SCAN TO PDF (Images to PDF)
# ---------------------------------------------------------------------
@router_merge.post("/scan")
async def scan_to_pdf(files: List[UploadFile] = File(...)):
    try:
        doc = fitz.open()
        for file in files:
            img_bytes = await file.read()
            # Dynamic suffix guessing or fall-back to jpeg
            filename_parts = file.filename.split('.') if file.filename else []
            ext = filename_parts[-1].lower() if len(filename_parts) > 1 else "jpeg"
            if ext not in ["jpeg", "jpg", "png", "webp", "gif", "tiff", "bmp"]:
                ext = "jpeg"
            if ext == "jpg":
                ext = "jpeg"
            
            img_doc = fitz.open(stream=img_bytes, filetype=ext)
            pdf_bytes_inner = img_doc.convert_to_pdf()
            img_pdf = fitz.open("pdf", pdf_bytes_inner)
            doc.insert_pdf(img_pdf)
            img_doc.close()
            img_pdf.close()
            
        out_buf = io.BytesIO()
        doc.save(out_buf)
        doc.close()
        out_buf.seek(0)
        return StreamingResponse(
            out_buf,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=scanned.pdf"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to convert images to PDF: {e}")

# ---------------------------------------------------------------------
# 🔢 ADD PAGE NUMBERS
# ---------------------------------------------------------------------
@router_merge.post("/page-numbers")
async def page_numbers(
    file: UploadFile = File(...),
    format: str = Form("Page {n} of {m}"),
    position: str = Form("bottom-center"),
    start_number: int = Form(1),
    number_style: str = Form("Arabic"),
    color: str = Form("#000000"),
    font_size: int = Form(12)
):
    try:
        pdf_bytes = await file.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        total_pages = len(doc)
        
        rgb_color = hex_to_rgb(color)
        
        for i, page in enumerate(doc):
            curr_n = start_number + i
            
            # Format current page number based on style
            if number_style == "Roman-Upper":
                n_str = to_roman(curr_n)
                m_str = to_roman(total_pages)
            elif number_style == "Roman-Lower":
                n_str = to_roman(curr_n).lower()
                m_str = to_roman(total_pages).lower()
            elif number_style == "Alpha-Upper":
                n_str = to_alpha(curr_n)
                m_str = to_alpha(total_pages)
            elif number_style == "Words":
                n_str = to_words(curr_n)
                m_str = to_words(total_pages)
            elif number_style == "Devanagari":
                n_str = to_devnagrik(curr_n)
                m_str = to_devnagrik(total_pages)
            else:
                n_str = str(curr_n)
                m_str = str(total_pages)
                
            text = format.replace("{n}", n_str).replace("{m}", m_str)
            rect = page.rect
            margin = 35
            align = fitz.TEXT_ALIGN_CENTER
            
            # Try to load Unicode font for Devanagari
            font = "helv"
            if number_style == "Devanagari":
                import os
                # Nirmala UI natively supports Devanagari numerals
                possible_fonts = [
                    "C:/Windows/Fonts/Nirmala.ttc",
                    "C:/Windows/Fonts/Nirmala.ttf",
                    "C:/Windows/Fonts/mangal.ttf",
                    "C:/Windows/Fonts/arialuni.ttf"
                ]
                unicode_font = None
                for pf in possible_fonts:
                    if os.path.exists(pf):
                        unicode_font = pf
                        break
                if unicode_font:
                    try:
                        page.insert_font(fontname="devfont", fontfile=unicode_font)
                        font = "devfont"
                    except Exception as e:
                        print("Warning: Failed to inject custom Devnagri font", e)
            
            bbox = fitz.Rect(0, 0, rect.width, rect.height)
            if "center" in position and "bottom" in position:
                bbox = fitz.Rect(0, rect.height - margin - 20, rect.width, rect.height - margin)
            elif "center" in position and "top" in position:
                bbox = fitz.Rect(0, margin, rect.width, margin + 20)
            elif "left" in position and "bottom" in position:
                bbox = fitz.Rect(margin, rect.height - margin - 20, rect.width, rect.height - margin)
                align = fitz.TEXT_ALIGN_LEFT
            elif "right" in position and "bottom" in position:
                bbox = fitz.Rect(0, rect.height - margin - 20, rect.width - margin, rect.height - margin)
                align = fitz.TEXT_ALIGN_RIGHT
            elif "left" in position and "top" in position:
                bbox = fitz.Rect(margin, margin, rect.width, margin + 20)
                align = fitz.TEXT_ALIGN_LEFT
            elif "right" in position and "top" in position:
                bbox = fitz.Rect(0, margin, rect.width - margin, margin + 20)
                align = fitz.TEXT_ALIGN_RIGHT
            
            try:
                page.insert_textbox(
                    bbox, 
                    text, 
                    fontsize=font_size, 
                    fontname=font, 
                    color=rgb_color,
                    align=align
                )
            except Exception as e:
                # Fallback to helv if custom font fails, or log and continue
                print(f"Warning: Failed to insert text on page {i}: {e}")
                page.insert_textbox(
                    bbox, 
                    text, 
                    fontsize=font_size, 
                    fontname="helv", 
                    color=rgb_color,
                    align=align
                )
            
        out_buf = io.BytesIO()
        doc.save(out_buf)
        doc.close()
        out_buf.seek(0)
        
        filename = f"numbered_{file.filename if file.filename else 'document.pdf'}"
        return StreamingResponse(
            out_buf,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to add page numbers: {str(e)}")

# ---------------------------------------------------------------------
# ✂️ CROP PDF
# ---------------------------------------------------------------------
@router_merge.post("/crop")
async def crop_pdf(
    files: List[UploadFile] = File(...), 
    crop_settings: str = Form("{}")
):
    """ 
    Trim margins visually across multiple files with specific bounds and page selections per file. 
    Returns ZIP archive.
    """
    import zipfile
    import json
    try:
        try:
            settings_map = json.loads(crop_settings)
        except json.JSONDecodeError:
            settings_map = {}

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w") as zipf:
            for idx, file in enumerate(files):
                pdf_bytes = await file.read()
                doc = fitz.open(stream=pdf_bytes, filetype="pdf")
                total_pages = len(doc)
                
                # Fetch settings for this specific file or fallback to default
                cfg = settings_map.get(str(idx), {})
                
                page_crops = cfg.get("page_crops")
                
                if page_crops is not None:
                    # New format: explicitly dictating crops per page
                    for p_num in range(1, total_pages + 1):
                        p_str = str(p_num)
                        if p_str in page_crops:
                            page_cfg = page_crops[p_str]
                            left = float(page_cfg.get("left", 0.0))
                            right = float(page_cfg.get("right", 0.0))
                            top = float(page_cfg.get("top", 0.0))
                            bottom = float(page_cfg.get("bottom", 0.0))
                            
                            page = doc[p_num - 1]
                            r = page.rect
                            
                            trim_l = r.width * (left / 100.0)
                            trim_t = r.height * (top / 100.0)
                            trim_r = r.width * (right / 100.0)
                            trim_b = r.height * (bottom / 100.0)
                            
                            new_rect = fitz.Rect(r.x0 + trim_l, r.y0 + trim_t, r.x1 - trim_r, r.y1 - trim_b)
                            new_rect = new_rect.intersect(page.mediabox)
                            
                            if new_rect.width > 20 and new_rect.height > 20:
                                page.set_cropbox(new_rect)
                else:
                    # Legacy format
                    left = float(cfg.get("left", 0.0))
                    right = float(cfg.get("right", 0.0))
                    top = float(cfg.get("top", 0.0))
                    bottom = float(cfg.get("bottom", 0.0))
                    pages = str(cfg.get("pages", "all"))
                    
                    # Parse selected pages
                    target_pages = set()
                    if pages == "all":
                        target_pages = set(range(1, total_pages + 1))
                    else:
                        try:
                            for part in pages.split(","):
                                part = part.strip()
                                if "-" in part:
                                    start, end = map(int, part.split("-"))
                                    target_pages.update(range(start, end + 1))
                                else:
                                    target_pages.add(int(part))
                        except:
                            target_pages = set(range(1, total_pages + 1))

                    for p_num in range(1, total_pages + 1):
                        if p_num not in target_pages:
                            continue
                            
                        page = doc[p_num - 1]
                        r = page.rect
                        
                        trim_l = r.width * (left / 100.0)
                        trim_t = r.height * (top / 100.0)
                        trim_r = r.width * (right / 100.0)
                        trim_b = r.height * (bottom / 100.0)
                        
                        new_rect = fitz.Rect(r.x0 + trim_l, r.y0 + trim_t, r.x1 - trim_r, r.y1 - trim_b)
                        new_rect = new_rect.intersect(page.mediabox)
                        
                        if new_rect.width > 20 and new_rect.height > 20:
                            page.set_cropbox(new_rect)
                    
                out_buf = io.BytesIO()
                
                # Delete pages if specified
                deleted_pages = cfg.get("deleted_pages", [])
                if deleted_pages:
                    dp_list = [int(p) - 1 for p in deleted_pages]
                    dp_list.sort(reverse=True)
                    for dp in dp_list:
                        if 0 <= dp < doc.page_count:
                            doc.delete_page(dp)

                doc.save(out_buf, garbage=3, deflate=True) # Binary clean save
                doc.close()
                out_buf.seek(0)
                zipf.writestr(file.filename or f"cropped_{idx}.pdf", out_buf.read())
        
        zip_buffer.seek(0)
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={
                "Content-Disposition": "attachment; filename=cropped_files.zip",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to crop PDF: {e}")

# ---------------------------------------------------------------------
# ✏️ EDIT PDF (Interactive Elements)
# ---------------------------------------------------------------------
@router_merge.post("/edit")
async def edit_pdf(request: Request):
    """
    Applies precise visual edits (Text, Image, Shapes, Freehand) to a PDF using normalized coordinates.
    """
    import base64
    try:
        # Override Starlette's default 1024KB limit for multi-part items.
        # We parse the form data with a 100MB max/part limit.
        form = await request.form(max_part_size=100 * 1024 * 1024, max_fields=5000)
        
        file = form.get("file")
        edits = form.get("edits", "[]")
        
        from starlette.datastructures import UploadFile as StarletteUploadFile
        if not file or not isinstance(file, (UploadFile, StarletteUploadFile)):
            keys = list(form.keys()) if form is not None else []
            file_val = form.get("file") if form is not None else None
            file_type = type(file_val).__name__ if file_val is not None else "None"
            raise HTTPException(status_code=400, detail=f"Missing file in upload. Form keys: {keys}, file type: {file_type}")
        if not isinstance(edits, str):
            edits = str(edits)
            
        try:
            instructions = json.loads(edits)
        except json.JSONDecodeError:
            instructions = []
            
        pdf_bytes = await file.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        for edit in instructions:
            page_num = int(edit.get("page", 1)) - 1
            if not (0 <= page_num < len(doc)):
                continue
                
            page = doc[page_num]
            rect = page.rect
            
            e_type = edit.get("type")
            x_pts = safe_float(edit.get("x"), 0.0)
            y_pts = safe_float(edit.get("y"), 0.0)
            
            abs_x = rect.x0 + x_pts
            abs_y = rect.y0 + y_pts
            
            if e_type == "text":
                text = edit.get("text", "")
                font_size = safe_float(edit.get("fontSize"), 12.0)
                color_hex = edit.get("color", "#000000")
                rgb_color = hex_to_rgb(color_hex)
                
                is_bold = edit.get("fontWeight") == "bold"
                is_italic = edit.get("fontStyle") == "italic"
                
                font_family = edit.get("fontFamily", "helv").lower()
                family_base = "helv"
                if any(x in font_family for x in ["times", "serif", "georgia", "merriweather", "playfair", "vibes", "pacifico", "dancing", "garamond", "sacramento"]):
                    family_base = "times"
                elif any(x in font_family for x in ["cour", "mono", "fira", "consolas", "lucida"]):
                    family_base = "cour"
                
                if family_base == "helv":
                    if is_bold and is_italic:
                        fontname = "hebi"
                    elif is_bold:
                        fontname = "hebo"
                    elif is_italic:
                        fontname = "heob"
                    else:
                        fontname = "helv"
                elif family_base == "times":
                    if is_bold and is_italic:
                        fontname = "tibi"
                    elif is_bold:
                        fontname = "tibo"
                    elif is_italic:
                        fontname = "tiit"
                    else:
                        fontname = "tiro"
                elif family_base == "cour":
                    if is_bold and is_italic:
                        fontname = "cobi"
                    elif is_bold:
                        fontname = "cobo"
                    elif is_italic:
                        fontname = "coob"
                    else:
                        fontname = "cour"
                else:
                    fontname = "helv"
                
                # Align Mapping
                align_str = edit.get("textAlign", "left")
                align_val = fitz.TEXT_ALIGN_LEFT
                if align_str == "center":
                    align_val = fitz.TEXT_ALIGN_CENTER
                elif align_str == "right":
                    align_val = fitz.TEXT_ALIGN_RIGHT
                
                w_pts = safe_float(edit.get("width"), 30.0)
                h_pts = safe_float(edit.get("height"), 10.0)
                bbox = fitz.Rect(abs_x, abs_y, abs_x + w_pts, abs_y + h_pts)
                
                # Draw vector background masking if specified and not transparent
                fill_hex = edit.get("fillColor", "transparent")
                if fill_hex != "transparent":
                    fill_rgb = hex_to_rgb(fill_hex)
                    page.draw_rect(bbox, color=fill_rgb, fill=fill_rgb, width=0)
                
                # Compute closest multiple of 90 degrees for PyMuPDF textbox rotation
                try:
                    rot_val = safe_float(edit.get("rotate"), 0.0)
                    angle = int(round(rot_val / 90.0) * 90) % 360
                    if angle not in [0, 90, 180, 270]:
                        angle = 0
                except (ValueError, TypeError):
                    angle = 0
                
                page.insert_textbox(
                    bbox, 
                    text, 
                    fontsize=font_size, 
                    fontname=fontname, 
                    color=rgb_color,
                    align=align_val,
                    rotate=angle
                )
                
                # Support Underline decoration
                if edit.get("textDecoration") == "underline":
                    text_w = w_pts
                    p1 = fitz.Point(abs_x, abs_y + font_size + 2)
                    p2 = fitz.Point(abs_x + text_w, abs_y + font_size + 2)
                    page.draw_line(p1, p2, color=rgb_color, width=1)
                
            elif e_type == "shape":
                shape = edit.get("shapeType", "box")
                w_pts = safe_float(edit.get("width"), 10.0)
                h_pts = safe_float(edit.get("height"), 10.0)
                color_hex = edit.get("color", "#000000")
                fill_hex = edit.get("fillColor", "transparent")
                stroke_width = safe_float(edit.get("strokeWidth"), 2.0)
                opacity = safe_float(edit.get("opacity"), 1.0)
                
                rgb_color = hex_to_rgb(color_hex)
                fill_rgb = hex_to_rgb(fill_hex) if fill_hex != "transparent" else None
                
                p_rect = fitz.Rect(abs_x, abs_y, abs_x + w_pts, abs_y + h_pts)
                
                if shape == "box":
                    page.draw_rect(p_rect, color=rgb_color, fill=fill_rgb, width=stroke_width, stroke_opacity=opacity, fill_opacity=opacity)
                elif shape == "circle":
                    p_center = fitz.Point((p_rect.x0 + p_rect.x1) / 2.0, (p_rect.y0 + p_rect.y1) / 2.0)
                    page.draw_circle(p_center, p_rect.width / 2.0, color=rgb_color, fill=fill_rgb, width=stroke_width, stroke_opacity=opacity, fill_opacity=opacity)
                elif shape == "line":
                    p1 = fitz.Point(p_rect.x0, p_rect.y0 + (p_rect.height/2.0))
                    p2 = fitz.Point(p_rect.x1, p_rect.y0 + (p_rect.height/2.0))
                    page.draw_line(p1, p2, color=rgb_color, width=stroke_width, stroke_opacity=opacity)
                elif shape == "arrow":
                    p1 = fitz.Point(p_rect.x0, p_rect.y0 + (p_rect.height/2.0))
                    p2 = fitz.Point(p_rect.x1, p_rect.y0 + (p_rect.height/2.0))
                    page.draw_line(p1, p2, color=rgb_color, width=stroke_width, stroke_opacity=opacity)
                    import math
                    dx = p2.x - p1.x
                    dy = p2.y - p1.y
                    length = math.sqrt(dx*dx + dy*dy)
                    if length > 0:
                        dx /= length
                        dy /= length
                        arrow_len = max(10.0, stroke_width * 3.0)
                        angle = math.pi / 6.0
                        bx = -dx
                        by = -dy
                        p3 = fitz.Point(p2.x + arrow_len * (bx * math.cos(angle) - by * math.sin(angle)),
                                        p2.y + arrow_len * (bx * math.sin(angle) + by * math.cos(angle)))
                        p4 = fitz.Point(p2.x + arrow_len * (bx * math.cos(-angle) - by * math.sin(-angle)),
                                        p2.y + arrow_len * (bx * math.sin(-angle) + by * math.cos(-angle)))
                        page.draw_polyline([p2, p3, p4], color=rgb_color, fill=rgb_color, stroke_opacity=opacity, fill_opacity=opacity, closePath=True)
                elif shape == "arc":
                    p1 = fitz.Point(p_rect.x0, p_rect.y0 + p_rect.height / 2.0)
                    p2 = fitz.Point(p_rect.x0 + p_rect.width * 0.25, p_rect.y0)
                    p3 = fitz.Point(p_rect.x0 + p_rect.width * 0.75, p_rect.y0)
                    p4 = fitz.Point(p_rect.x1, p_rect.y0 + p_rect.height / 2.0)
                    page.draw_bezier(p1, p2, p3, p4, color=rgb_color, width=stroke_width, stroke_opacity=opacity)
                elif shape == "pentagon":
                    cx = p_rect.x0 + p_rect.width / 2.0
                    pts = [
                        fitz.Point(cx, p_rect.y0),
                        fitz.Point(p_rect.x1, p_rect.y0 + p_rect.height * 0.38),
                        fitz.Point(p_rect.x0 + p_rect.width * 0.81, p_rect.y1),
                        fitz.Point(p_rect.x0 + p_rect.width * 0.19, p_rect.y1),
                        fitz.Point(p_rect.x0, p_rect.y0 + p_rect.height * 0.38)
                    ]
                    page.draw_polyline(pts, color=rgb_color, fill=fill_rgb, width=stroke_width, stroke_opacity=opacity, fill_opacity=opacity, closePath=True)
                elif shape == "cloud":
                    cx = p_rect.x0 + p_rect.width / 2.0
                    cy = p_rect.y0 + p_rect.height / 2.0
                    w = p_rect.width
                    h = p_rect.height
                    pt_start = fitz.Point(p_rect.x0 + 0.2 * w, p_rect.y1)
                    path = fitz.Path()
                    path.move_to(pt_start)
                    path.line_to(fitz.Point(p_rect.x1 - 0.2 * w, p_rect.y1))
                    path.curve_to(fitz.Point(p_rect.x1 - 0.05 * w, p_rect.y1), fitz.Point(p_rect.x1, p_rect.y1 - 0.2 * h), fitz.Point(p_rect.x1, p_rect.y0 + 0.6 * h))
                    path.curve_to(fitz.Point(p_rect.x1, p_rect.y0 + 0.3 * h), fitz.Point(p_rect.x0 + 0.8 * w, p_rect.y0), fitz.Point(p_rect.x0 + 0.55 * w, p_rect.y0))
                    path.curve_to(fitz.Point(p_rect.x0 + 0.3 * w, p_rect.y0), fitz.Point(p_rect.x0, p_rect.y0 + 0.2 * h), fitz.Point(p_rect.x0, p_rect.y0 + 0.5 * h))
                    path.curve_to(fitz.Point(p_rect.x0, p_rect.y1 - 0.2 * h), fitz.Point(p_rect.x0 + 0.05 * w, p_rect.y1), pt_start)
                    path.close_path()
                    page.draw_path(path, color=rgb_color, fill=fill_rgb, width=stroke_width, stroke_opacity=opacity, fill_opacity=opacity)
                        
            elif e_type == "image":
                b64_data = edit.get("base64", "")
                w_pts = safe_float(edit.get("width"), 30.0)
                h_pts = safe_float(edit.get("height"), 30.0)
                if b64_data:
                    if "," in b64_data:
                        b64_data = b64_data.split(",")[1]
                    img_bytes = base64.b64decode(b64_data)
                    p_rect = fitz.Rect(abs_x, abs_y, abs_x + w_pts, abs_y + h_pts)
                    page.insert_image(p_rect, stream=img_bytes)
        
        out_buf = io.BytesIO()
        doc.save(out_buf, garbage=3, deflate=True)
        doc.close()
        out_buf.seek(0)
        
        return StreamingResponse(
            out_buf,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=edited_{file.filename}",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to edit PDF: {e}")


# 🔍 REDACT PDF (Secure Data Erasing)
@router_merge.post("/redact")
async def redact_pdf(request: Request):
    """
    Applies permanent redactions to a PDF document.
    - Searches for keywords / text phrases and blacks them out securely.
    - Applies custom user-drawn rectangular regions to redact any content underneath.
    """
    try:
        # Starlette form parse
        form = await request.form(max_part_size=100 * 1024 * 1024)
        file = form.get("file")
        redactions_str = form.get("redactions", "{}")

        from starlette.datastructures import UploadFile as StarletteUploadFile
        if not file or not isinstance(file, (UploadFile, StarletteUploadFile)):
            raise HTTPException(status_code=400, detail="Missing file in upload.")

        import json
        try:
            constraints = json.loads(redactions_str)
        except json.JSONDecodeError:
            constraints = {}

        rects = constraints.get("rects", []) # [{ "page": 1, "x": 100, "y": 150, "w": 200, "h": 50 }]
        keywords = constraints.get("keywords", []) # ["CONFIDENTIAL", "SSN-123"]

        pdf_bytes = await file.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")

        for page_num in range(len(doc)):
            page = doc[page_num]
            
            # 1. Search and redact text terms
            for kw in keywords:
                if not kw or not kw.strip():
                    continue
                matches = page.search_for(kw)
                for rect in matches:
                    page.add_redact_annot(rect, fill=(0, 0, 0))

            # 2. Add manual zone rects
            for r in rects:
                if int(r.get("page", 1)) - 1 == page_num:
                    rx = float(r.get("x", 0.0))
                    ry = float(r.get("y", 0.0))
                    rw = float(r.get("w", 0.0))
                    rh = float(r.get("h", 0.0))
                    
                    target_rect = fitz.Rect(rx, ry, rx + rw, ry + rh)
                    page.add_redact_annot(target_rect, fill=(0, 0, 0))

            # Apply redactions to text and images in PyMuPDF (images=2 means PDF_REDACT_IMAGE_REMOVE)
            page.apply_redactions(images=2)

        out_buf = io.BytesIO()
        doc.save(out_buf, garbage=3, deflate=True)
        doc.close()
        out_buf.seek(0)

        filename = f"redacted_{file.filename or 'document.pdf'}"
        return StreamingResponse(
            out_buf,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to apply PDF redaction security: {e}")


# 🔍 SEARCH / SCAN TEXT PATTERNS FOR REDACTION
@router_merge.post("/search_patterns")
async def search_patterns(request: Request):
    """
    Scans a PDF for custom strings or predefined patterns (emails, phone numbers, SSN, prices/billing).
    Returns list of matches with coordinates.
    """
    try:
        form = await request.form(max_part_size=100 * 1024 * 1024)
        file = form.get("file")
        query_type = form.get("query_type", "")  # "custom", "emails", "phones", "ssns", "prices"
        custom_query = form.get("custom_query", "")

        from starlette.datastructures import UploadFile as StarletteUploadFile
        if not file or not isinstance(file, (UploadFile, StarletteUploadFile)):
            raise HTTPException(status_code=400, detail="Missing file in upload.")

        pdf_bytes = await file.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        matches_result = []

        import re
        # Predefined regex patterns
        email_pat = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
        # Matches formats like 123-456-7890, +1 123 456 7890, etc.
        phone_pat = re.compile(r"^\+?\d{1,4}?[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{3}[-.\s]?\d{4}$")
        # Matches SSN (999-99-9999) or Aadhaar numbers (9999-9999-9999)
        ssn_pat = re.compile(r"^\d{3}-\d{2}-\d{4}$|^\d{4}-\d{4}-\d{4}$")
        price_pat = re.compile(r"^\$?\d+(\.\d{2})?$")

        for page_idx in range(len(doc)):
            page = doc[page_idx]
            
            # Simple Exact Text Match
            if query_type == "custom":
                if not custom_query or not custom_query.strip():
                    continue
                # Search exact string
                exact_hits = page.search_for(custom_query)
                for rect in exact_hits:
                    matches_result.append({
                        "id": f"scanned-{page_idx + 1}-{uuid.uuid4().hex[:6]}",
                        "page": page_idx + 1,
                        "x": rect.x0,
                        "y": rect.y0,
                        "w": rect.x1 - rect.x0,
                        "h": rect.y1 - rect.y0,
                        "text": custom_query
                    })
            else:
                # Regex patterns search on page words listing
                # page.get_text("words") returns list of: (x0, y0, x1, y1, "word", block_no, line_no, word_no)
                words = page.get_text("words")
                for w in words:
                    x0, y0, x1, y1, text, block_no, line_no, word_no = w
                    clean_txt = text.strip(".,:;()[]{}'`\"")
                    
                    is_match = False
                    if query_type == "emails" and email_pat.match(clean_txt):
                        is_match = True
                    elif query_type == "phones":
                        # Also check if it's a series of digits of length 10-12
                        digits = re.sub(r"\D", "", clean_txt)
                        if phone_pat.match(clean_txt) or (8 <= len(digits) <= 13):
                            is_match = True
                    elif query_type == "ssns" and ssn_pat.match(clean_txt):
                        is_match = True
                    elif query_type == "prices":
                        if "$" in text or "₹" in text or "€" in text or "£" in text or price_pat.match(clean_txt):
                            is_match = True
                        elif clean_txt.lower() in ["total", "amount", "price", "billing", "subtotal", "invoice", "balance"]:
                            is_match = True
                    elif query_type == "cards":
                        digits = re.sub(r"\D", "", clean_txt)
                        if (13 <= len(digits) <= 19) and re.match(r"^[\d\-]+$", clean_txt):
                            is_match = True

                    if is_match:
                        matches_result.append({
                            "id": f"scanned-{page_idx + 1}-{uuid.uuid4().hex[:6]}",
                            "page": page_idx + 1,
                            "x": x0,
                            "y": y0,
                            "w": x1 - x0,
                            "h": y1 - y0,
                            "text": text
                        })

            if query_type == "cards":
                page_text = page.get_text("text")
                # Common credit card formats with spaces: Visa/MC (4 4 4 4), Amex (4 6 5)
                card_regex_spaces = re.compile(r"\b\d{4}\s\d{4}\s\d{4}\s\d{4}\b|\b\d{4}\s\d{6}\s\d{5}\b")
                for match in card_regex_spaces.finditer(page_text):
                    matched_str = match.group(0)
                    rects_found = page.search_for(matched_str)
                    for rect in rects_found:
                        if not any(r["text"] == matched_str and r["page"] == page_idx + 1 and abs(r["x"] - rect.x0) < 2 for r in matches_result):
                            matches_result.append({
                                "id": f"scanned-{page_idx + 1}-{uuid.uuid4().hex[:6]}",
                                "page": page_idx + 1,
                                "x": rect.x0,
                                "y": rect.y0,
                                "w": rect.x1 - rect.x0,
                                "h": rect.y1 - rect.y0,
                                "text": matched_str
                            })

        doc.close()
        return {"status": "success", "matches": matches_result}

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Search patterns failure: {e}")


