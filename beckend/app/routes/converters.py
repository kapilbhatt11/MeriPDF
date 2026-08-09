from fastapi import APIRouter, File, UploadFile, HTTPException, Form
from fastapi.responses import FileResponse
import tempfile
import os
import uuid
import asyncio
from PIL import Image
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass
import io
import fitz # PyMuPDF
import zipfile
from pdf2docx import Converter
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN
from pptx.dml.color import RGBColor
import pdfplumber
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from fastapi.responses import FileResponse, StreamingResponse
import pytesseract

router = APIRouter(prefix="/converters", tags=["converters"])

# Helper to process image fitting onto canvas
def format_image_for_pdf(img: Image.Image, page_size: str, orientation: str, margin: str) -> Image.Image:
    # 1. If page_size is fit, keep original image size
    if page_size == "fit":
        return img
    
    # 2. Base page dimensions in points
    # A4: 595 x 842, Letter: 612 x 792
    if page_size == "a4":
        p_w, p_h = 595, 842
    elif page_size == "letter":
        p_w, p_h = 612, 792
    else:
        p_w, p_h = 595, 842  # default fallback A4
        
    # Rotate based on orientation
    img_w, img_h = img.size
    
    if orientation == "portrait":
        sw, sh = min(p_w, p_h), max(p_w, p_h)
    elif orientation == "landscape":
        sw, sh = max(p_w, p_h), min(p_w, p_h)
    else: # auto
        if img_w > img_h:
            sw, sh = max(p_w, p_h), min(p_w, p_h)
        else:
            sw, sh = min(p_w, p_h), max(p_w, p_h)
            
    # Margins in points
    pad = 0
    if margin == "small":
        pad = 20
    elif margin == "large":
        pad = 40
        
    aw = sw - 2 * pad
    ah = sh - 2 * pad
    
    # Scale image to fit inside available boundaries preserving aspect ratio
    scale = min(aw / img_w, ah / img_h)
    new_w = max(1, int(img_w * scale))
    new_h = max(1, int(img_h * scale))
    
    # Resize the image using High Quality Resampling
    try:
        sampler = Image.Resampling.LANCZOS
    except AttributeError:
        sampler = Image.ANTIALIAS
        
    resized_img = img.resize((new_w, new_h), sampler)
    
    # Create white canvas of (sw, sh)
    canvas = Image.new("RGB", (sw, sh), (255, 255, 255))
    
    # Paste centered
    x_off = pad + (aw - new_w) // 2
    y_off = pad + (ah - new_h) // 2
    canvas.paste(resized_img, (x_off, y_off))
    
    return canvas

@router.post("/image-to-pdf")
async def image_to_pdf(
    files: list[UploadFile] = File(...),
    page_size: str = Form("fit"),
    orientation: str = Form("auto"),
    margin: str = Form("none")
):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")
    if len(files) > 50:
        raise HTTPException(status_code=400, detail="Maximum limit of 50 images exceeded per conversion request.")
    
    try:
        images_list = []
        for file in files:
            content = await file.read()
            img = Image.open(io.BytesIO(content))
            
            # Convert image to RGB because PDF doesn't support RGBA (transparent) directly natively
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            processed_img = format_image_for_pdf(img, page_size, orientation, margin)
            images_list.append(processed_img)
                
        if not images_list:
            raise HTTPException(status_code=400, detail="Invalid image files provided")
            
        temp_dir = tempfile.gettempdir()
        output_filename = "Converted_Images_MeriPDF.pdf"
        output_path = os.path.join(temp_dir, output_filename)
        
        # Save all images as a single PDF
        first_image = images_list[0]
        other_images = images_list[1:]
        
        if other_images:
            first_image.save(output_path, "PDF", resolution=100.0, save_all=True, append_images=other_images)
        else:
            first_image.save(output_path, "PDF", resolution=100.0)
            
        return FileResponse(
            output_path,
            media_type="application/pdf",
            filename=output_filename,
            headers={"Content-Disposition": f"attachment; filename={output_filename}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---------------------------------------------------------------------
# 🖼️ PDF to JPG (ZIP/Single Image)
# ---------------------------------------------------------------------
def parse_page_range(range_str: str, max_pages: int) -> list[int]:
    if not range_str or not range_str.strip():
        return list(range(max_pages))
    
    pages = set()
    parts = range_str.replace(" ", "").split(",")
    for part in parts:
        if "-" in part:
            try:
                start_str, end_str = part.split("-")
                start = int(start_str)
                end = int(end_str)
                start = max(1, min(start, max_pages))
                end = max(1, min(end, max_pages))
                for p in range(min(start, end), max(start, end) + 1):
                    pages.add(p - 1)
            except ValueError:
                continue
        else:
            try:
                p = int(part)
                if 1 <= p <= max_pages:
                    pages.add(p - 1)
            except ValueError:
                continue
    return sorted(list(pages)) if pages else list(range(max_pages))

def compress_to_size(img: Image.Image, target_bytes: int, fmt: str) -> bytes:
    pil_format = fmt.upper()
    if pil_format == "JPG":
        pil_format = "JPEG"
        
    TARGET_QUALITY = 82
    
    buf = io.BytesIO()
    save_args = {"format": pil_format}
    if pil_format in ["JPEG", "WEBP"]:
        save_args["quality"] = TARGET_QUALITY
        
    try:
        img.save(buf, **save_args)
    except Exception:
        img.save(buf, format="JPEG", quality=TARGET_QUALITY)
        pil_format = "JPEG"
        
    if buf.tell() <= target_bytes:
        return buf.getvalue()
        
    # Scale down the image resolution while keeping quality high (visually sharp and crisp)
    low_scale = 0.05
    high_scale = 0.95
    best_bytes = None
    
    for _ in range(6):
        mid_scale = (low_scale + high_scale) / 2
        w = max(1, int(img.width * mid_scale))
        h = max(1, int(img.height * mid_scale))
        resized = img.resize((w, h), Image.Resampling.LANCZOS)
        
        test_buf = io.BytesIO()
        test_args = {"format": pil_format}
        if pil_format in ["JPEG", "WEBP"]:
            test_args["quality"] = TARGET_QUALITY
            
        resized.save(test_buf, **test_args)
        size = test_buf.tell()
        
        if size <= target_bytes:
            best_bytes = test_buf.getvalue()
            low_scale = mid_scale + 0.02
        else:
            high_scale = mid_scale - 0.02
            
    if best_bytes:
        return best_bytes
        
    # Fallback to extremely low dimensions with reduced quality if search failed
    w = max(1, int(img.width * 0.05))
    h = max(1, int(img.height * 0.05))
    resized = img.resize((w, h), Image.Resampling.LANCZOS)
    final_buf = io.BytesIO()
    if pil_format in ["JPEG", "WEBP"]:
        resized.save(final_buf, format=pil_format, quality=60)
    else:
        resized.save(final_buf, format=pil_format)
    return final_buf.getvalue()


@router.post("/pdf-to-jpg")
async def pdf_to_jpg(
    file: UploadFile = File(...),
    mode: str = Form("pages"),
    dpi: int = Form(150),
    format: str = Form("jpg"),
    page_range: str = Form(""),
    target_kb: str = Form(None)
):
    try:
        pdf_bytes = await file.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        target_kb_val = None
        if target_kb and target_kb.strip():
            try:
                target_kb_val = int(target_kb)
            except ValueError:
                pass
                
        pages_to_process = parse_page_range(page_range, len(doc))
        
        if mode == "text":
            text_content = ""
            for page_num in pages_to_process:
                page = doc.load_page(page_num)
                text_content += f"--- Page {page_num + 1} ---\n\n"
                text_content += page.get_text("text") + "\n\n"
            
            text_bytes = text_content.encode("utf-8")
            return StreamingResponse(
                io.BytesIO(text_bytes),
                media_type="text/plain",
                headers={"Content-Disposition": f"attachment; filename=Extracted_Text_{os.path.splitext(file.filename)[0]}.txt"}
            )
            
        elif mode == "text_ocr":
            text_content = ""
            for page_num in pages_to_process:
                page = doc.load_page(page_num)
                pix = page.get_pixmap(dpi=dpi)
                img = Image.open(io.BytesIO(pix.tobytes("jpeg")))
                text = pytesseract.image_to_string(img, lang="hin+eng")
                text_content += f"--- Page {page_num + 1} ---\n\n"
                text_content += text + "\n\n"
            
            text_bytes = text_content.encode("utf-8")
            return StreamingResponse(
                io.BytesIO(text_bytes),
                media_type="text/plain",
                headers={"Content-Disposition": f"attachment; filename=Extracted_Text_OCR_{os.path.splitext(file.filename)[0]}.txt"}
            )
            
        elif mode == "images":
            extracted_images = []
            img_count = 0
            for page_num in pages_to_process:
                page = doc.load_page(page_num)
                image_list = page.get_images(full=True)
                for img_index, img_info in enumerate(image_list):
                    xref = img_info[0]
                    base_image = doc.extract_image(xref)
                    image_bytes = base_image["image"]
                    image_ext = base_image["ext"]
                    img_count += 1
                    extracted_images.append((f"Image_{img_count}.{image_ext}", image_bytes))
            
            # Smart single page response for 1 extracted image
            if len(extracted_images) == 1:
                single_name, single_bytes = extracted_images[0]
                ext = single_name.split(".")[-1]
                mime_type = f"image/{ext}"
                if ext == "jpg":
                    mime_type = "image/jpeg"
                return StreamingResponse(
                    io.BytesIO(single_bytes),
                    media_type=mime_type,
                    headers={"Content-Disposition": f"attachment; filename={single_name}"}
                )
                
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, "w") as zipf:
                for img_name, img_bytes in extracted_images:
                    zipf.writestr(img_name, img_bytes)
                if img_count == 0:
                    zipf.writestr("no_images_found.txt", b"No embedded images were found in this PDF.")
            
            zip_buffer.seek(0)
            filename = f"Extracted_Images_{os.path.splitext(file.filename)[0]}.zip"
            return StreamingResponse(
                zip_buffer,
                media_type="application/zip",
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )
            
        else: # mode == "pages"
            # Smart single page response for 1 page rendered
            if len(pages_to_process) == 1:
                page_num = pages_to_process[0]
                page = doc.load_page(page_num)
                pix = page.get_pixmap(dpi=dpi)
                img = Image.open(io.BytesIO(pix.tobytes("png")))
                
                if format == "jpg" and img.mode != "RGB":
                    img = img.convert("RGB")
                    
                ext = "jpg" if format == "jpg" else format
                pil_fmt = "JPEG" if format == "jpg" else format.upper()
                mime_type = "image/jpeg" if format == "jpg" else f"image/{format}"
                
                if target_kb_val:
                    img_bytes = compress_to_size(img, target_kb_val * 1024, ext)
                else:
                    buf = io.BytesIO()
                    img.save(buf, format=pil_fmt)
                    img_bytes = buf.getvalue()
                    
                filename = f"Page_{page_num + 1}.{ext}"
                return StreamingResponse(
                    io.BytesIO(img_bytes),
                    media_type=mime_type,
                    headers={"Content-Disposition": f"attachment; filename={filename}"}
                )
                
            # Multiple pages zip response
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, "w") as zipf:
                for page_num in pages_to_process:
                    page = doc.load_page(page_num)
                    pix = page.get_pixmap(dpi=dpi)
                    img = Image.open(io.BytesIO(pix.tobytes("png")))
                    
                    if format == "jpg" and img.mode != "RGB":
                        img = img.convert("RGB")
                        
                    ext = "jpg" if format == "jpg" else format
                    pil_fmt = "JPEG" if format == "jpg" else format.upper()
                    
                    if target_kb_val:
                        img_bytes = compress_to_size(img, target_kb_val * 1024, ext)
                    else:
                        buf = io.BytesIO()
                        img.save(buf, format=pil_fmt)
                        img_bytes = buf.getvalue()
                        
                    zipf.writestr(f"Page_{page_num + 1}.{ext}", img_bytes)
                    
            zip_buffer.seek(0)
            filename = f"Converted_Images_{os.path.splitext(file.filename)[0]}.zip"
            return StreamingResponse(
                zip_buffer,
                media_type="application/zip",
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process PDF: {e}")

# ---------------------------------------------------------------------
# 📝 PDF to WORD (.docx)
# ---------------------------------------------------------------------
@router.post("/pdf-to-word")
async def pdf_to_word(file: UploadFile = File(...)):
    try:
        temp_dir = tempfile.gettempdir()
        pdf_path = os.path.join(temp_dir, f"temp_{file.filename}")
        docx_path = os.path.join(temp_dir, f"converted_{file.filename}.docx")
        
        with open(pdf_path, "wb") as f:
            f.write(await file.read())
            
        cv = Converter(pdf_path)
        cv.convert(docx_path)
        cv.close()
        
        return FileResponse(
            docx_path,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=f"Extracted_{file.filename}.docx"
        )
    except Exception as e:
        print("PDF to Word Error:", e)
        raise HTTPException(status_code=500, detail=f"Failed to convert PDF to Word: {e}")

# ---------------------------------------------------------------------
# 📊 PDF to POWERPOINT (.pptx)
# ---------------------------------------------------------------------
def page_needs_ocr(page) -> bool:
    text = page.get_text("text").strip()
    if not text:
        return True
    
    # Check if a lot of replacement chars or dots are present
    special_chars = text.count("┬╖") + text.count(chr(0xfffd)) + text.count("ΓÇó")
    alnum_chars = sum(1 for c in text if c.isalnum())
    
    if alnum_chars < 5:
        return True
        
    if special_chars > 0.4 * (len(text) + 1):
        return True
        
    # Check for corrupt Unicode characters (outside standard ASCII/Devanagari/common signs)
    corrupt_count = 0
    for char in text:
        o = ord(char)
        if o <= 127:
            continue
        if 0x0900 <= o <= 0x097F:
            continue
        if 0x2000 <= o <= 0x206F:
            continue
        if 0x20A0 <= o <= 0x20CF:
            continue
        corrupt_count += 1
        
    if corrupt_count > 5:
        return True
        
    # Check for legacy fonts (e.g. KrutiDev, Devlys, Shusha)
    try:
        page_dict = page.get_text("dict")
        for block in page_dict.get("blocks", []):
            if block.get("type") == 0:
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        font_lower = span.get("font", "").lower()
                        if any(x in font_lower for x in ["kruti", "devlys", "shusha", "chanakya", "shivaji"]):
                            return True
    except Exception:
        pass
        
    return False

def get_page_elements(page, force_ocr=False):
    should_ocr = force_ocr or page_needs_ocr(page)
    if should_ocr:
        try:
            pix = page.get_pixmap(dpi=150)
            img_data = pix.tobytes("png")
            img = Image.open(io.BytesIO(img_data))
            
            # Preprocessing to improve OCR accuracy without heavy CPU overhead
            resized_flag = False
            if min(img.size) < 400:
                img = img.resize((img.width * 2, img.height * 2), Image.Resampling.LANCZOS)
                resized_flag = True
                
            # Use combined hin+eng OCR engine to recognize both Hindi Devanagari and English numbers/text
            lang = "hin+eng"
                
            ocr_data = pytesseract.image_to_data(img, lang=lang, output_type=pytesseract.Output.DICT)
            
            blocks_map = {}
            n_boxes = len(ocr_data['level'])
            
            # Correct points mapping to handle potential image magnification
            scale_factor = 2.0 if resized_flag else 1.0
            
            # pix.width/pix.height correspond to the unscaled image (1x width/height)
            to_points_x = page.rect.width / (pix.width * scale_factor)
            to_points_y = page.rect.height / (pix.height * scale_factor)
            
            for i in range(n_boxes):
                text = ocr_data['text'][i].strip()
                conf = float(ocr_data['conf'][i]) if ocr_data['conf'][i] != -1 else 0.0
                if not text or conf < 30:
                    continue
                    
                block_num = ocr_data['block_num'][i]
                line_num = ocr_data['line_num'][i]
                
                l_pix = ocr_data['left'][i]
                t_pix = ocr_data['top'][i]
                w_pix = ocr_data['width'][i]
                h_pix = ocr_data['height'][i]
                
                tx0 = l_pix * to_points_x
                ty0 = t_pix * to_points_y
                tx1 = (l_pix + w_pix) * to_points_x
                ty1 = (t_pix + h_pix) * to_points_y
                
                key = (block_num, line_num)
                if key not in blocks_map:
                    blocks_map[key] = {
                        "words": [],
                        "bbox": [tx0, ty0, tx1, ty1]
                    }
                else:
                    bbox = blocks_map[key]["bbox"]
                    bbox[0] = min(bbox[0], tx0)
                    bbox[1] = min(bbox[1], ty0)
                    bbox[2] = max(bbox[2], tx1)
                    bbox[3] = max(bbox[3], ty1)
                    
                blocks_map[key]["words"].append({
                    "text": text,
                    "bbox": (tx0, ty0, tx1, ty1)
                })
                
            synthetic_blocks = []
            block_groups = {}
            for (block_num, line_num), line_data in blocks_map.items():
                if block_num not in block_groups:
                    block_groups[block_num] = []
                    block_groups[block_num].append(line_data)
                else:
                    block_groups[block_num].append(line_data)
                
            for block_num, lines in block_groups.items():
                synthetic_lines = []
                bx0 = min(l["bbox"][0] for l in lines)
                by0 = min(l["bbox"][1] for l in lines)
                bx1 = max(l["bbox"][2] for l in lines)
                by1 = max(l["bbox"][3] for l in lines)
                
                for line_data in lines:
                    lx0, ly0, lx1, ly1 = line_data["bbox"]
                    
                    # Sort words horizontally
                    words = sorted(line_data["words"], key=lambda w: w["bbox"][0])
                    spans = []
                    if words:
                        curr_span = {
                            "text": words[0]["text"],
                            "words": [words[0]],
                            "bbox": list(words[0]["bbox"])
                        }
                        for w in words[1:]:
                            wx0, wy0, wx1, wy1 = w["bbox"]
                            # If they are close horizontally, merge them.
                            # Threshold is 18 points (typical space boundary between columns)
                            if wx0 - curr_span["bbox"][2] <= 18:
                                curr_span["text"] += " " + w["text"]
                                curr_span["words"].append(w)
                                curr_span["bbox"][2] = max(curr_span["bbox"][2], wx1)
                                curr_span["bbox"][1] = min(curr_span["bbox"][1], wy0)
                                curr_span["bbox"][3] = max(curr_span["bbox"][3], wy1)
                            else:
                                spans.append(curr_span)
                                curr_span = {
                                    "text": w["text"],
                                    "words": [w],
                                    "bbox": list(w["bbox"])
                                }
                        spans.append(curr_span)
                    
                    # Convert to PyMuPDF dictionary spans format
                    synthetic_spans = []
                    for s in spans:
                        sx0, sy0, sx1, sy1 = s["bbox"]
                        
                        # Calculate stable font size using average/first word height to prevent merge vertical skew
                        word_w = s["words"][0]
                        word_h = word_w["bbox"][3] - word_w["bbox"][1]
                        font_size = word_h * 0.8
                        # Clamp font size to protect text flow
                        font_size = max(9.0, min(font_size, 15.0))
                        
                        # Force stable vertical bounds to match the first word height
                        stable_sy0 = word_w["bbox"][1]
                        stable_sy1 = word_w["bbox"][3]
                        
                        synthetic_spans.append({
                            "text": s["text"],
                            "font": "Arial",
                            "size": font_size,
                            "color": 0,
                            "flags": 0,
                            "bbox": (sx0, stable_sy0, sx1, stable_sy1)
                        })
                        
                    synthetic_lines.append({
                        "bbox": (lx0, ly0, lx1, ly1),
                        "spans": synthetic_spans
                    })
                    
                synthetic_blocks.append({
                    "type": 0,
                    "bbox": (bx0, by0, bx1, by1),
                    "lines": synthetic_lines
                })
                
            try:
                page_dict = page.get_text("dict")
                image_blocks = [b for b in page_dict.get("blocks", []) if b.get("type") == 1]
                synthetic_blocks.extend(image_blocks)
            except Exception:
                pass
                
            return {"blocks": synthetic_blocks}
        except Exception as e:
            print("OCR Layout parsing failed, falling back to standard extraction:", e)
            try:
                return page.get_text("dict")
            except Exception:
                return {"blocks": []}
    else:
        try:
            return page.get_text("dict")
        except Exception:
            return {"blocks": []}

def parse_page_range(range_str: str, max_pages: int) -> list[int]:
    if not isinstance(range_str, str):
        return list(range(max_pages))
    if not range_str.strip():
        return list(range(max_pages))
    
    pages = set()
    parts = range_str.split(",")
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            try:
                start, end = part.split("-")
                start_idx = int(start.strip()) - 1
                end_idx = int(end.strip()) - 1
                start_idx = max(0, min(start_idx, max_pages - 1))
                end_idx = max(0, min(end_idx, max_pages - 1))
                if start_idx <= end_idx:
                    pages.update(range(start_idx, end_idx + 1))
                else:
                    pages.update(range(end_idx, start_idx + 1))
            except ValueError:
                pass
        else:
            try:
                p = int(part) - 1
                if 0 <= p < max_pages:
                    pages.add(p)
            except ValueError:
                pass
                
    return sorted(list(pages)) if pages else list(range(max_pages))

# Helper functions for PDF to PPT conversion
def safe_rgb_color(color_val):
    try:
        if isinstance(color_val, (tuple, list)):
            if len(color_val) >= 3:
                r = int(color_val[0] * 255) if color_val[0] <= 1.0 else int(color_val[0])
                g = int(color_val[1] * 255) if color_val[1] <= 1.0 else int(color_val[1])
                b = int(color_val[2] * 255) if color_val[2] <= 1.0 else int(color_val[2])
                return RGBColor(max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)))
        elif isinstance(color_val, int):
            b = color_val & 255
            g = (color_val >> 8) & 255
            r = (color_val >> 16) & 255
            return RGBColor(max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)))
    except Exception:
        pass
    return RGBColor(0, 0, 0)

def render_page_as_highres_image(page, temp_dir, page_num, dpi=400):
    unique_id = uuid.uuid4().hex[:8]
    img_path = os.path.join(temp_dir, f"page_replica_{page_num}_{dpi}dpi_{unique_id}.png")
    try:
        pix = page.get_pixmap(dpi=dpi, colorspace=fitz.csRGB)
    except Exception:
        pix = page.get_pixmap(dpi=300)
    # Rule 3: Save as Lossless PNG
    pix.save(img_path)
    return img_path

def detect_page_dpi(page, requested_dpi=200):
    """Rule 1: Auto-detect table/form pages and enforce minimum 400 DPI."""
    try:
        tabs = page.find_tables()
        drawings = page.get_drawings()
        if (tabs and len(tabs.tables) > 0) or (drawings and len(drawings) > 10):
            return max(requested_dpi, 400)
    except Exception:
        pass
    return max(requested_dpi, 300)

def overlay_vector_gridlines(slide, page, scale_x, scale_y, s_width, s_height):
    """
    Extracts all thin vertical and horizontal lines (from drawing path items & rects)
    and draws them as explicit, sharp PowerPoint line shapes with exact colors.
    Enforces a 1.2pt minimum stroke floor so hairline borders remain crisp at any zoom level.
    """
    from pptx.enum.shapes import MSO_SHAPE
    try:
        drawings = page.get_drawings()
        if not drawings:
            return
        
        grid_count = 0
        for d in drawings:
            stroke_color = d.get("color") or d.get("fill") or (0.2, 0.2, 0.2)
            rgb_color = safe_rgb_color(stroke_color)
            line_w = d.get("width", 1.0)
            
            items = d.get("items", [])
            for item in items:
                cmd = item[0]
                # 1. Line Command ('l', p1, p2)
                if cmd == "l":
                    p1, p2 = item[1], item[2]
                    dx = abs(p1.x - p2.x)
                    dy = abs(p1.y - p2.y)
                    
                    # Horizontal Line
                    if dy <= 3.0 and dx >= 2.0:
                        x0, x1 = min(p1.x, p2.x), max(p1.x, p2.x)
                        y_pos = (p1.y + p2.y) / 2.0
                        left = max(0, min(int(Pt(x0) * scale_x), s_width - Pt(2)))
                        top = max(0, min(int(Pt(y_pos - 0.6) * scale_y), s_height - Pt(2)))
                        width = min(int(Pt(max(x1 - x0, 1.0)) * scale_x), s_width - left)
                        height = max(Pt(1.2), int(Pt(max(line_w, 1.2)) * scale_y))
                        if width > 0 and height > 0:
                            try:
                                shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
                                shape.fill.solid()
                                shape.fill.fore_color.rgb = rgb_color
                                shape.line.fill.background()
                                grid_count += 1
                            except Exception:
                                pass
                            
                    # Vertical Line
                    elif dx <= 3.0 and dy >= 2.0:
                        y0, y1 = min(p1.y, p2.y), max(p1.y, p2.y)
                        x_pos = (p1.x + p2.x) / 2.0
                        left = max(0, min(int(Pt(x_pos - 0.6) * scale_x), s_width - Pt(2)))
                        top = max(0, min(int(Pt(y0) * scale_y), s_height - Pt(2)))
                        width = max(Pt(1.2), int(Pt(max(line_w, 1.2)) * scale_x))
                        height = min(int(Pt(max(y1 - y0, 1.0)) * scale_y), s_height - top)
                        if width > 0 and height > 0:
                            try:
                                shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
                                shape.fill.solid()
                                shape.fill.fore_color.rgb = rgb_color
                                shape.line.fill.background()
                                grid_count += 1
                            except Exception:
                                pass

                # 2. Rectangle Command ('re', rect)
                elif cmd == "re":
                    r = item[1]
                    rx0, ry0, rx1, ry1 = r.x0, r.y0, r.x1, r.y1
                    dw, dh = rx1 - rx0, ry1 - ry0
                    if (dw >= 2.0 and dh <= 3.0) or (dh >= 2.0 and dw <= 3.0):
                        left = max(0, min(int(Pt(rx0) * scale_x), s_width - Pt(2)))
                        top = max(0, min(int(Pt(ry0) * scale_y), s_height - Pt(2)))
                        width = max(Pt(1.2), int(Pt(dw) * scale_x)) if dw <= 3.0 else min(int(Pt(dw) * scale_x), s_width - left)
                        height = max(Pt(1.2), int(Pt(dh) * scale_y)) if dh <= 3.0 else min(int(Pt(dh) * scale_y), s_height - top)
                        if width > 0 and height > 0:
                            try:
                                shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
                                shape.fill.solid()
                                shape.fill.fore_color.rgb = rgb_color
                                shape.line.fill.background()
                                grid_count += 1
                            except Exception:
                                pass

            # 3. Fallback to bounding rect if items empty
            if not items:
                rx0, ry0, rx1, ry1 = d.get("rect", (0, 0, 0, 0))
                dw, dh = rx1 - rx0, ry1 - ry0
                if (dw >= 2.0 and dh <= 3.0) or (dh >= 2.0 and dw <= 3.0):
                    left = max(0, min(int(Pt(rx0) * scale_x), s_width - Pt(2)))
                    top = max(0, min(int(Pt(ry0) * scale_y), s_height - Pt(2)))
                    width = max(Pt(1.2), int(Pt(dw) * scale_x)) if dw <= 3.0 else min(int(Pt(dw) * scale_x), s_width - left)
                    height = max(Pt(1.2), int(Pt(dh) * scale_y)) if dh <= 3.0 else min(int(Pt(dh) * scale_y), s_height - top)
                    if width > 0 and height > 0:
                        try:
                            shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
                            shape.fill.solid()
                            shape.fill.fore_color.rgb = rgb_color
                            shape.line.fill.background()
                            grid_count += 1
                        except Exception:
                            pass

        if grid_count > 0:
            print(f"[QA Check] Successfully extracted & drew {grid_count} thin vertical/horizontal vector lines.")
    except Exception as ex_grid:
        print("Vector gridline overlay warning:", ex_grid)

# ---------------------------------------------------------------------
# 📊 PDF to POWERPOINT (.pptx) — UNIVERSAL PIXEL-PRESERVING ENGINE
# ---------------------------------------------------------------------
@router.post("/pdf-to-ppt")
async def pdf_to_ppt(
    file: UploadFile = File(...),
    mode: str = Form("replica"),
    dpi: int = Form(200),
    page_range: str = Form(None)
):
    from pptx.enum.shapes import MSO_SHAPE
    from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
    from pptx.oxml import parse_xml

    def set_pptx_cell_border(cell, color_hex="404040", width_str="12700"):
        try:
            tcPr = cell._tc.get_or_add_tcPr()
            for border_name in ["lnL", "lnR", "lnT", "lnB"]:
                existing = tcPr.find(f"{{http://schemas.openxmlformats.org/drawingml/2006/main}}{border_name}")
                if existing is not None:
                    tcPr.remove(existing)
                xml_str = (
                    f'<a:{border_name} xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" w="{width_str}" cmpd="s">'
                    f'<a:solidFill><a:srgbClr val="{color_hex}"/></a:solidFill>'
                    f'<a:prstDash val="solid"/>'
                    f'</a:{border_name}>'
                )
                tcPr.append(parse_xml(xml_str))
        except Exception:
            pass

    def map_font_name(pdf_font_name: str) -> str:
        if not pdf_font_name:
            return "Arial"
        name = pdf_font_name.lower()
        if "calibri" in name:
            return "Calibri"
        elif "times" in name or "liberation serif" in name or "georgia" in name:
            return "Times New Roman"
        elif "arial" in name or "helvetica" in name or "helv" in name or "nimbus" in name or "sans" in name:
            return "Arial"
        elif "courier" in name or "mono" in name or "consolas" in name:
            return "Courier New"
        elif "cambria" in name:
            return "Cambria"
        elif "garamond" in name:
            return "Garamond"
        elif "verdana" in name:
            return "Verdana"
        elif "trebuchet" in name:
            return "Trebuchet MS"
        return "Arial"

    try:
        temp_dir = tempfile.gettempdir()
        pdf_bytes = await file.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        if len(doc) == 0:
            raise HTTPException(status_code=400, detail="The provided PDF document is empty.")

        # Sanitize requested DPI
        try:
            dpi_val = int(dpi)
        except (ValueError, TypeError):
            dpi_val = 200

        pages_to_process = parse_page_range(page_range, len(doc))
        if not pages_to_process:
            pages_to_process = list(range(len(doc)))

        prs = Presentation()
        blank_slide_layout = prs.slide_layouts[6]  # Completely blank slide layout

        # Match presentation dimensions to the first processed page
        first_page = doc.load_page(pages_to_process[0])
        prs.slide_width = int(Pt(first_page.rect.width))
        prs.slide_height = int(Pt(first_page.rect.height))

        mode_str = (mode or "replica").lower().strip()

        for page_num in pages_to_process:
            page = doc.load_page(page_num)
            slide = prs.slides.add_slide(blank_slide_layout)
            
            p_width = Pt(page.rect.width)
            p_height = Pt(page.rect.height)
            s_width = int(p_width) if p_width else prs.slide_width
            s_height = int(p_height) if p_height else prs.slide_height

            scale_x = s_width / p_width if p_width else 1.0
            scale_y = s_height / p_height if p_height else 1.0

            # Rule 1: Page-Type Detection for 400 DPI Minimum on Table/Form pages
            page_target_dpi = detect_page_dpi(page, requested_dpi=dpi_val)

            # ---------------------------------------------------------
            # ---------------------------------------------------------
            # MODE A: ILOVEPDF DUAL-LAYER PARITY (DEFAULT & RECOMMENDED)
            # 1. Base Layer: High-Res 400 DPI PDF Page Replica (100% exact table cells, borders, colors, lines)
            # 2. Additive Vector Grid Overlay: Crisp vector hairline border shapes
            # 3. Precision Text Layer: Transparent, selectable, copyable, & editable PowerPoint textboxes
            # ---------------------------------------------------------
            if mode_str in ["replica", "hybrid", "ilovepdf"]:
                try:
                    # 1. Place High-Res Page Image as Base Background Replica (400 DPI min for table/form)
                    img_path = render_page_as_highres_image(page, temp_dir, page_num, dpi=page_target_dpi)
                    slide.shapes.add_picture(img_path, 0, 0, s_width, s_height)
                    if os.path.exists(img_path):
                        os.remove(img_path)

                    # 2. Additive Crisp Vector Gridlines Overlay
                    overlay_vector_gridlines(slide, page, scale_x, scale_y, s_width, s_height)

                    # 3. Layer Precision Transparent Editable Text Boxes matching PDF coordinates & typography
                    page_dict = page.get_text("dict")
                    for block in page_dict.get("blocks", []):
                        if block.get("type") == 0:  # Text block
                            for line in block.get("lines", []):
                                lx0, ly0, lx1, ly1 = line.get("bbox", (0, 0, 0, 0))
                                if lx0 >= lx1 or ly0 >= ly1:
                                    continue
                                
                                left = max(0, min(int(Pt(lx0) * scale_x), s_width - Pt(5)))
                                top = max(0, min(int(Pt(ly0) * scale_y), s_height - Pt(5)))
                                width = min(int(Pt(max(lx1 - lx0 + 4, 10)) * scale_x), s_width - left)
                                height = min(int(Pt(max(ly1 - ly0 + 2, 8)) * scale_y), s_height - top)
                                if width <= Pt(4) or height <= Pt(4):
                                    continue

                                txBox = slide.shapes.add_textbox(left, top, width, height)
                                tf = txBox.text_frame
                                tf.word_wrap = False
                                tf.clear()
                                tf.margin_left = Pt(0)
                                tf.margin_right = Pt(0)
                                tf.margin_top = Pt(0)
                                tf.margin_bottom = Pt(0)
                                p_elem = tf.paragraphs[0]

                                spans = line.get("spans", [])
                                for span in spans:
                                    t_text = span.get("text", "")
                                    if not t_text:
                                        continue
                                    run = p_elem.add_run()
                                    run.text = t_text
                                    
                                    # Exact PDF Font Size (no artificially forced caps!)
                                    f_size = max(5.0, min(span.get("size", 10.0), 72.0))
                                    run.font.size = Pt(f_size * scale_y)
                                    run.font.name = map_font_name(span.get("font", "Arial"))
                                    run.font.color.rgb = safe_rgb_color(span.get("color", 0))
                                    
                                    flags = span.get("flags", 0)
                                    if flags & 16: run.font.bold = True
                                    if flags & 2: run.font.italic = True
                except Exception as ex_par:
                    print(f"ILovePDF Parity engine exception on page {page_num}:", ex_par)
                    try:
                        img_path = render_page_as_highres_image(page, temp_dir, page_num, dpi=200)
                        slide.shapes.add_picture(img_path, 0, 0, s_width, s_height)
                        if os.path.exists(img_path): os.remove(img_path)
                    except Exception:
                        pass

            # ---------------------------------------------------------
            # MODE C: EDITABLE OBJECTS & ITR/FINANCIAL TABLE RECONSTRUCTION
            # ---------------------------------------------------------
            else:  # mode == "editable"
                try:
                    # 1. Embedded Images (Extract small images/logos, skip full-page background canvas images)
                    try:
                        image_list = page.get_images()
                        page_area = (page.rect.width * page.rect.height) or 1.0
                        for img_idx, img_info in enumerate(image_list[:10]):
                            xref = img_info[0]
                            base_img = doc.extract_image(xref)
                            if base_img:
                                img_bytes = base_img["image"]
                                img_ext = base_img["ext"]
                                tmp_bg_path = os.path.join(temp_dir, f"tmp_bg_{page_num}_{img_idx}_{uuid.uuid4().hex[:6]}.{img_ext}")
                                with open(tmp_bg_path, "wb") as f_img:
                                    f_img.write(img_bytes)
                                img_rects = page.get_image_rects(xref)
                                if img_rects:
                                    rx0, ry0, rx1, ry1 = img_rects[0]
                                    img_area = (rx1 - rx0) * (ry1 - ry0)
                                    # Skip full-page background canvas images (>75% area) in editable mode
                                    if (img_area / page_area) > 0.75:
                                        if os.path.exists(tmp_bg_path):
                                            os.remove(tmp_bg_path)
                                        continue

                                    i_left = max(0, min(int(Pt(rx0) * scale_x), s_width - Pt(10)))
                                    i_top = max(0, min(int(Pt(ry0) * scale_y), s_height - Pt(10)))
                                    i_width = min(int(Pt(rx1 - rx0) * scale_x), s_width - i_left)
                                    i_height = min(int(Pt(ry1 - ry0) * scale_y), s_height - i_top)
                                    if i_width > Pt(10) and i_height > Pt(10):
                                        slide.shapes.add_picture(tmp_bg_path, i_left, i_top, i_width, i_height)
                                if os.path.exists(tmp_bg_path):
                                    os.remove(tmp_bg_path)
                    except Exception as ex_img:
                        print("Editable background extraction warning:", ex_img)

                    # 2. Financial / ITR Table Reconstruction with Column & Merged Cell Detection
                    table_bboxes = []
                    try:
                        tabs = page.find_tables()
                        if tabs and tabs.tables:
                            for tab in tabs.tables:
                                tx0, ty0, tx1, ty1 = tab.bbox
                                table_bboxes.append((tx0, ty0, tx1, ty1))
                                t_left = max(0, min(int(Pt(tx0) * scale_x), s_width - Pt(10)))
                                t_top = max(0, min(int(Pt(ty0) * scale_y), s_height - Pt(10)))
                                t_width = min(int(Pt(tx1 - tx0) * scale_x), s_width - t_left)
                                t_height = min(int(Pt(ty1 - ty0) * scale_y), s_height - t_top)

                                if t_width > Pt(20) and t_height > Pt(20) and tab.row_count > 0 and tab.col_count > 0:
                                    t_shape = slide.shapes.add_table(tab.row_count, tab.col_count, t_left, t_top, t_width, t_height)
                                    table_obj = t_shape.table
                                    grid = tab.extract()

                                    # Adjust individual column widths if tab.cols coordinates are available
                                    try:
                                        if hasattr(tab, "cols") and tab.cols:
                                            col_widths = []
                                            for c_idx in range(len(tab.cols) - 1):
                                                c_w = (tab.cols[c_idx + 1] - tab.cols[c_idx]) * scale_x
                                                col_widths.append(int(Pt(c_w)))
                                            for c_idx, cw in enumerate(col_widths[:tab.col_count]):
                                                table_obj.columns[c_idx].width = max(Pt(15), cw)
                                    except Exception:
                                        pass

                                    for r_idx in range(tab.row_count):
                                        for c_idx in range(tab.col_count):
                                            c_cell = table_obj.cell(r_idx, c_idx)
                                            val_str = ""
                                            if r_idx < len(grid) and c_idx < len(grid[r_idx]):
                                                val_str = str(grid[r_idx][c_idx] or "").strip()

                                            c_cell.text = val_str
                                            c_cell.vertical_anchor = MSO_ANCHOR.MIDDLE
                                            c_cell.margin_left = Pt(2)
                                            c_cell.margin_right = Pt(2)
                                            c_cell.margin_top = Pt(1)
                                            c_cell.margin_bottom = Pt(1)
                                            set_pptx_cell_border(c_cell, color_hex="808080", width_str="12700")

                                            if c_cell.text_frame and c_cell.text_frame.paragraphs:
                                                p_elem = c_cell.text_frame.paragraphs[0]
                                                p_elem.alignment = PP_ALIGN.LEFT
                                                if p_elem.runs:
                                                    for run in p_elem.runs:
                                                        run.font.name = "Arial"
                                                        run.font.size = Pt(9.0)
                                                        run.font.color.rgb = RGBColor(0, 0, 0)
                    except Exception as ex_tab:
                        print("Editable table extraction warning:", ex_tab)

                    # 3. Vector Shape / Line Borders
                    try:
                        drawings = page.get_drawings()
                    except Exception:
                        drawings = []

                    if len(drawings) < 350:
                        for d in drawings:
                            rx0, ry0, rx1, ry1 = d.get("rect", (0, 0, 0, 0))
                            if not (-5000 <= rx0 <= 5000 and -5000 <= ry0 <= 5000 and -5000 <= rx1 <= 5000 and -5000 <= ry1 <= 5000):
                                continue
                            dw, dh = rx1 - rx0, ry1 - ry0
                            if dw > 0.5 or dh > 0.5:
                                left = max(0, min(int(Pt(rx0) * scale_x), s_width - Pt(5)))
                                top = max(0, min(int(Pt(ry0) * scale_y), s_height - Pt(5)))
                                width = min(int(Pt(dw) * scale_x), s_width - left)
                                height = min(int(Pt(dh) * scale_y), s_height - top)
                                if width <= 0 or height <= 0: continue

                                try:
                                    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
                                    if d.get("fill"):
                                        fr, fg, fb = d["fill"]
                                        if not (fr > 0.92 and fg > 0.92 and fb > 0.92):
                                            shape.fill.solid()
                                            shape.fill.fore_color.rgb = safe_rgb_color(d["fill"])
                                        else: shape.fill.background()
                                    else: shape.fill.background()

                                    stroke_width = d.get("width", 0)
                                    if d.get("color") and (stroke_width > 0 or dw <= 1.5 or dh <= 1.5):
                                        shape.line.color.rgb = safe_rgb_color(d.get("color", (0, 0, 0)))
                                        shape.line.width = max(Pt(0.75), int(Pt(stroke_width) * scale_y))
                                    else: shape.line.fill.background()
                                except Exception:
                                    pass

                    # 4. Text Boxes
                    page_dict = page.get_text("dict")
                    for block in page_dict.get("blocks", []):
                        if block.get("type") == 0:
                            for line in block.get("lines", []):
                                lx0, ly0, lx1, ly1 = line.get("bbox", (0, 0, 0, 0))
                                if lx0 >= lx1 or ly0 >= ly1: continue

                                in_table = False
                                for tx0, ty0, tx1, ty1 in table_bboxes:
                                    if tx0 - 3 <= lx0 <= tx1 + 3 and ty0 - 3 <= ly0 <= ty1 + 3:
                                        in_table = True
                                        break
                                if in_table: continue

                                left = max(0, min(int(Pt(lx0) * scale_x), s_width - Pt(10)))
                                top = max(0, min(int(Pt(ly0) * scale_y), s_height - Pt(10)))
                                width = min(int(Pt(lx1 - lx0 + 4) * scale_x), s_width - left)
                                height = min(int(Pt(ly1 - ly0) * scale_y), s_height - top)
                                if width <= Pt(5) or height <= Pt(5): continue

                                txBox = slide.shapes.add_textbox(left, top, width, height)
                                tf = txBox.text_frame
                                tf.word_wrap = False
                                tf.clear()
                                tf.margin_left = Pt(0)
                                tf.margin_right = Pt(0)
                                tf.margin_top = Pt(0)
                                tf.margin_bottom = Pt(0)
                                p_elem = tf.paragraphs[0]

                                for span in line.get("spans", []):
                                    t_text = span.get("text", "")
                                    if not t_text: continue
                                    run = p_elem.add_run()
                                    run.text = t_text
                                    f_size = max(8.0, min(span.get("size", 11), 14.0))
                                    run.font.size = int(Pt(f_size) * scale_y)
                                    run.font.name = map_font_name(span.get("font", "Arial"))
                                    run.font.color.rgb = safe_rgb_color(span.get("color", 0))
                                    flags = span.get("flags", 0)
                                    if flags & 16: run.font.bold = True
                                    if flags & 2: run.font.italic = True
                except Exception as ex_edt:
                    print(f"Editable mode exception for page {page_num}, falling back to high-res image:", ex_edt)
                    try:
                        img_path = render_page_as_highres_image(page, temp_dir, page_num, dpi=150)
                        slide.shapes.add_picture(img_path, 0, 0, s_width, s_height)
                        if os.path.exists(img_path): os.remove(img_path)
                    except Exception:
                        pass

        doc.close()

        # Output Slide Count Validation
        assert len(prs.slides) == len(pages_to_process), f"Slide count mismatch: expected {len(pages_to_process)}, got {len(prs.slides)}"

        pptx_filename = f"Converted_{os.path.splitext(file.filename)[0]}.pptx"
        pptx_path = os.path.join(temp_dir, f"pptx_{uuid.uuid4().hex[:8]}.pptx")
        prs.save(pptx_path)

        return FileResponse(
            pptx_path,
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            filename=pptx_filename,
            headers={"Content-Disposition": f"attachment; filename={pptx_filename}"}
        )

    except HTTPException:
        raise
    except Exception as e:
        print("PDF to PPT Error:", e)
        raise HTTPException(status_code=500, detail=f"Failed to convert PDF to PPT: {str(e)}")

# ---------------------------------------------------------------------
# 📈 PDF to EXCEL (.xlsx)
# ---------------------------------------------------------------------
@router.post("/pdf-to-excel")
async def pdf_to_excel(file: UploadFile = File(...), page_range: str = Form(None)):
    try:
        temp_dir = tempfile.gettempdir()
        pdf_path = os.path.join(temp_dir, f"tmp_excel_{file.filename}")
        
        with open(pdf_path, "wb") as f:
            f.write(await file.read())
            
        xlsx_path = os.path.join(temp_dir, f"tables_{file.filename}.xlsx")
        
        doc = fitz.open(pdf_path)
        wb = Workbook()
        ws_created = False
        
        # Safeguard processing count for OCR
        MAX_OCR_PAGES = 8
        ocr_processed = 0
        pages_to_process = parse_page_range(page_range, len(doc))
        
        for page_num in pages_to_process:
            page = doc.load_page(page_num)
            
            needs_ocr = page_needs_ocr(page)
            if needs_ocr:
                if ocr_processed >= MAX_OCR_PAGES:
                    page_dict = page.get_text("dict")
                else:
                    page_dict = await asyncio.to_thread(get_page_elements, page, force_ocr=True)
                    ocr_processed += 1
            else:
                page_dict = page.get_text("dict")
                
            all_elements = []
            
            for block in page_dict.get("blocks", []):
                if block.get("type") == 0: # text
                    for line in block.get("lines", []):
                        for span in line.get("spans", []):
                            text = span.get("text", "")
                            # We keep spaces for visual integrity
                            if not text.strip():
                                continue
                                
                            x0, y0, x1, y1 = span["bbox"]
                            color_int = span.get("color", 0)
                            b = color_int & 255
                            g = (color_int >> 8) & 255
                            r = (color_int >> 16) & 255
                            hex_color = f"FF{r:02x}{g:02x}{b:02x}" # openpyxl requires aRGB
                            
                            all_elements.append({
                                "x0": x0, "y0": y0, "x1": x1, "y1": y1,
                                "text": text,
                                "size": span.get("size", 11),
                                "font": span.get("font", "Arial"),
                                "color": hex_color,
                                "flags": span.get("flags", 0)
                            })
                            
            if not all_elements:
                continue
                
            # Extract drawings for cell borders and background fills
            try:
                drawings = page.get_drawings()
            except Exception:
                drawings = []
                
            ws_created = True
            ws = wb.create_sheet(title=f"Page_{page_num+1}"[:31])
            try:
                ws.views.sheetView[0].showGridLines = True
            except Exception:
                pass
                
            # Sort vertically
            all_elements.sort(key=lambda item: item["y0"])
            
            rows = []
            current_row = []
            current_y = all_elements[0]["y0"]
            y_tolerance = 5 
            
            for el in all_elements:
                if abs(el["y0"] - current_y) <= y_tolerance:
                    current_row.append(el)
                    current_y = (current_y + el["y0"]) / 2
                else:
                    rows.append(current_row)
                    current_row = [el]
                    current_y = el["y0"]
            if current_row:
                rows.append(current_row)
                
            col_width_factor = 40 # 1 excel column ~ 40 points wide layout
            
            # Prepare standard cell border
            thin_border = Border(
                left=Side(style='thin', color='B0B0B0'),
                right=Side(style='thin', color='B0B0B0'),
                top=Side(style='thin', color='B0B0B0'),
                bottom=Side(style='thin', color='B0B0B0')
            )
            
            for r_idx, row_elements in enumerate(rows):
                row_elements.sort(key=lambda w: w["x0"])
                
                merged_row = []
                if row_elements:
                    current_group = row_elements[0]
                    x_tolerance = 15
                    for el in row_elements[1:]:
                        if el["x0"] - current_group["x1"] <= x_tolerance:
                            current_group["x1"] = max(current_group["x1"], el["x1"])
                            current_group["text"] += " " + el["text"].strip()
                        else:
                            merged_row.append(current_group)
                            current_group = el
                    merged_row.append(current_group)
                
                max_font_size = 11
                
                for item in merged_row:
                    col_idx = int(item["x0"] // col_width_factor) + 1
                    while ws.cell(row=r_idx+1, column=col_idx).value is not None:
                        col_idx += 1
                        
                    cell = ws.cell(row=r_idx+1, column=col_idx, value=item["text"])
                    
                    # Check vector drawing background fill at item position
                    bg_fill_hex = None
                    for d in drawings:
                        rx0, ry0, rx1, ry1 = d.get("rect", (0, 0, 0, 0))
                        if rx0 <= item["x0"] <= rx1 and ry0 <= item["y0"] <= ry1 and d.get("fill"):
                            fr, fg, fb = d["fill"]
                            bg_fill_hex = f"FF{int(fr*255):02x}{int(fg*255):02x}{int(fb*255):02x}"
                            break
                            
                    if bg_fill_hex and bg_fill_hex.upper() != "FFFFFF":
                        try:
                            cell.fill = PatternFill(start_color=bg_fill_hex, end_color=bg_fill_hex, fill_type="solid")
                        except Exception:
                            pass
                            
                    # Apply cell border for structural tables only on actual data cells
                    if drawings and item.get("text", "").strip():
                        cell.border = thin_border
                        
                    # Apply Font Styles
                    is_bold = bool(item["flags"] & 16)
                    is_italic = bool(item["flags"] & 2)
                    
                    try:
                        cell.font = Font(
                            name="Calibri",
                            color=item["color"], 
                            size=int(item["size"]), 
                            bold=is_bold, 
                            italic=is_italic
                        )
                        cell.alignment = Alignment(vertical="center", wrap_text=False)
                    except Exception:
                        pass
                        
                    max_font_size = max(max_font_size, int(item["size"]))
                    
                    # Sizing column width dynamically based on text length
                    col_letter = get_column_letter(col_idx)
                    current_col_width = ws.column_dimensions[col_letter].width or 8
                    needed_width = len(item["text"]) * 1.1 + 3
                    if needed_width > current_col_width:
                        ws.column_dimensions[col_letter].width = min(needed_width, 60)
                
                # Apply row height
                ws.row_dimensions[r_idx+1].height = max_font_size + 8
                    
        if not ws_created:
            ws = wb.create_sheet(title="Result")
            ws["A1"] = "No text found in this PDF."
            
        if "Sheet" in wb.sheetnames:
            del wb["Sheet"] 
            
        wb.save(xlsx_path)
        doc.close()
                
        return FileResponse(
            xlsx_path,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename=f"Data_{file.filename}.xlsx"
        )
    except Exception as e:
        print("PDF to Excel Error:", e)
        raise HTTPException(status_code=500, detail=f"Failed to convert PDF to Excel: {e}")

# ---------------------------------------------------------------------
# 🏛️ PDF to PDF/A (Archival Standard)
# ---------------------------------------------------------------------
@router.post("/pdf-to-pdfa")
async def pdf_to_pdfa(file: UploadFile = File(...)):
    try:
        # PyMuPDF doc.save(pdfa=1) requires embedded fonts and rgb space.
        # Alternatively, we can rasterize to guarantee compliance or use ghostscript if installed.
        # A simpler approach using PyMuPDF which attempts PDF/A-1b metadata assignment:
        temp_dir = tempfile.gettempdir()
        in_path = os.path.join(temp_dir, f"in_{file.filename}")
        out_path = os.path.join(temp_dir, f"out_pdfa_{file.filename}")
        
        with open(in_path, "wb") as f:
            f.write(await file.read())
            
        doc = fitz.open(in_path)
        
        # PyMuPDF directly supports saving to PDF/A via ghostscript/internal flags in 1.19+ but we flatten to be safe
        out_doc = fitz.open()
        for page in doc:
            pix = page.get_pixmap(dpi=150)
            img_doc = fitz.open(stream=pix.tobytes("jpeg"), filetype="jpeg")
            img_pdf = img_doc.convert_to_pdf()
            temp_pdf = fitz.open("pdf", img_pdf)
            out_doc.insert_pdf(temp_pdf)
            temp_pdf.close()
            img_doc.close()
            
        # Write metadata for PDF/A
        out_doc.set_metadata({
            "format": "PDF 1.4",
            "title": file.filename,
            "creator": "MeriPDF"
        })
        
        # We apply deflate and clean for best archiving packaging
        out_doc.save(out_path, deflate=True)
        out_doc.close()
        doc.close()
        
        return FileResponse(
            out_path,
            media_type="application/pdf",
            filename=f"Archival_{file.filename}"
        )
    except Exception as e:
        print("PDF to PDF/A Error:", e)
        raise HTTPException(status_code=500, detail=f"Failed to convert PDF to PDF/A: {e}")

# ---------------------------------------------------------------------
# ⚙️ LibreOffice PDF Engine & Multi-Format Converters
# ---------------------------------------------------------------------
def find_libreoffice():
    import shutil
    # 1. Check if in PATH
    path = shutil.which("soffice") or shutil.which("libreoffice")
    if path:
        return path
    
    # 2. Check standard Windows paths
    standard_paths = [
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    ]
    for p in standard_paths:
        if os.path.exists(p):
            return p
            
    return None

def convert_to_pdf_with_libreoffice(in_path: str, temp_dir: str) -> str:
    import subprocess
    
    libreoffice_path = find_libreoffice()
    if not libreoffice_path:
        print("❌ Error: LibreOffice not found on the system.")
        raise HTTPException(
            status_code=500,
            detail="PDF conversion service is currently unavailable on the server (missing rendering engine)."
        )
        
    cmd = [
        libreoffice_path,
        "--headless",
        "--convert-to",
        "pdf",
        "--outdir",
        temp_dir,
        in_path
    ]
    
    startupinfo = None
    if os.name == 'nt':
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        
    result = subprocess.run(
        cmd, 
        stdout=subprocess.PIPE, 
        stderr=subprocess.PIPE, 
        startupinfo=startupinfo, 
        timeout=60
    )
    
    if result.returncode != 0:
        print(f"❌ LibreOffice conversion failed (code {result.returncode}): {result.stderr.decode()}")
        raise HTTPException(
            status_code=500,
            detail="Conversion failed. The document could not be converted to PDF."
        )
        
    base_name = os.path.splitext(os.path.basename(in_path))[0]
    out_path = os.path.join(temp_dir, f"{base_name}.pdf")
    
    if not os.path.exists(out_path):
        raise HTTPException(
            status_code=500,
            detail="Conversion output file not generated."
        )
        
    return out_path

async def handle_libreoffice_conversion(file: UploadFile, allowed_exts: list[str], err_prefix: str, response_prefix: str):
    import uuid
    
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed_exts:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid file extension. Allowed extensions are: {', '.join(allowed_exts)}"
        )
        
    unique_id = str(uuid.uuid4())
    temp_dir = tempfile.gettempdir()
    in_path = os.path.join(temp_dir, f"in_{unique_id}{ext}")
    out_path = None
    
    try:
        with open(in_path, "wb") as f:
            f.write(await file.read())
            
        out_path = convert_to_pdf_with_libreoffice(in_path, temp_dir)
        
        # Cleanup input file
        if os.path.exists(in_path):
            os.remove(in_path)
            
        base_filename = os.path.splitext(file.filename)[0]
        clean_filename = f"{response_prefix}_{base_filename}.pdf"
        
        return FileResponse(
            out_path,
            media_type="application/pdf",
            filename=clean_filename,
            headers={"Content-Disposition": f"attachment; filename={clean_filename}"}
        )
    except HTTPException:
        if os.path.exists(in_path):
            try: os.remove(in_path)
            except: pass
        if out_path and os.path.exists(out_path):
            try: os.remove(out_path)
            except: pass
        raise
    except Exception as e:
        print(f"{err_prefix} Error:", e)
        if os.path.exists(in_path):
            try: os.remove(in_path)
            except: pass
        if out_path and os.path.exists(out_path):
            try: os.remove(out_path)
            except: pass
        raise HTTPException(status_code=500, detail=f"Failed to convert file to PDF: {str(e)}")

# 📄 WORD to PDF (.pdf)
@router.post("/word-to-pdf")
async def word_to_pdf(files: list[UploadFile] = File(...), rotations: list[str] = Form(default=None)):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")
    if len(files) > 50:
        raise HTTPException(status_code=400, detail="Maximum limit of 50 documents exceeded per conversion request.")
    
    # Parse rotations or pad it to match len(files)
    rot_list = []
    if rotations:
        for r in rotations:
            try:
                rot_list.append(int(r))
            except ValueError:
                rot_list.append(0)
            
    while len(rot_list) < len(files):
        rot_list.append(0)
        
    import uuid
    import tempfile
    import zipfile
    
    unique_id = str(uuid.uuid4())
    temp_dir = tempfile.gettempdir()
    
    temp_pdf_paths = []
    temp_in_paths = []
    
    try:
        # Convert each Word document to a PDF in order
        for idx, file in enumerate(files):
            ext = os.path.splitext(file.filename)[1].lower()
            if ext not in [".doc", ".docx"]:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid file extension: {file.filename}. Only .doc and .docx are allowed."
                )
            
            in_path = os.path.join(temp_dir, f"in_{uuid.uuid4()}{ext}")
            temp_in_paths.append(in_path)
            
            with open(in_path, "wb") as f:
                f.write(await file.read())
            
            out_pdf = convert_to_pdf_with_libreoffice(in_path, temp_dir)
            
            # Apply rotation if specified and != 0
            rot = rot_list[idx]
            if rot in [90, 180, 270]:
                doc = fitz.open(out_pdf)
                for page in doc:
                    page.set_rotation((page.rotation + rot) % 360)
                doc.save(out_pdf, incremental=True)
                doc.close()
                
            temp_pdf_paths.append(out_pdf)
            
        # If there is only one file, return it directly
        if len(files) == 1:
            for p in temp_in_paths:
                if os.path.exists(p):
                    try: os.remove(p)
                    except: pass
            
            filename = f"Converted_{os.path.splitext(files[0].filename)[0]}.pdf"
            return FileResponse(
                temp_pdf_paths[0],
                media_type="application/pdf",
                filename=filename,
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )
            
        # If there are multiple files, bundle them into a ZIP archive
        zip_filename = f"Converted_PDF_Documents_{unique_id}.zip"
        zip_path = os.path.join(temp_dir, zip_filename)
        
        with zipfile.ZipFile(zip_path, "w") as zip_file:
            for idx, pdf_path in enumerate(temp_pdf_paths):
                original_name = files[idx].filename
                base_name = os.path.splitext(original_name)[0]
                zip_file.write(pdf_path, arcname=f"{base_name}.pdf")
                
        # Clean up temporary PDFs and input files
        for p in temp_in_paths + temp_pdf_paths:
            if os.path.exists(p):
                try: os.remove(p)
                except: pass
                
        return FileResponse(
            zip_path,
            media_type="application/zip",
            filename="Converted_Word_PDFs.zip",
            headers={"Content-Disposition": "attachment; filename=Converted_Word_PDFs.zip"}
        )
        
    except Exception as e:
        # Cleanup on failure
        for p in temp_in_paths + temp_pdf_paths:
            if os.path.exists(p):
                try: os.remove(p)
                except: pass
        print("Batch Word to PDF Error:", e)
        raise HTTPException(status_code=500, detail=f"Failed to convert Word files to PDF: {str(e)}")

# 📊 POWERPOINT to PDF (.pdf)
@router.post("/ppt-to-pdf")
async def ppt_to_pdf(files: list[UploadFile] = File(...), rotations: list[str] = Form(default=None)):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")
    if len(files) > 50:
        raise HTTPException(status_code=400, detail="Maximum limit of 50 presentations exceeded per conversion request.")
    
    # Parse rotations or pad it to match len(files)
    rot_list = []
    if rotations:
        for r in rotations:
            try:
                rot_list.append(int(r))
            except ValueError:
                rot_list.append(0)
            
    while len(rot_list) < len(files):
        rot_list.append(0)
        
    import uuid
    import tempfile
    import zipfile
    
    unique_id = str(uuid.uuid4())
    temp_dir = tempfile.gettempdir()
    
    temp_pdf_paths = []
    temp_in_paths = []
    
    try:
        # Convert each Presentation slideshow to a PDF in order
        for idx, file in enumerate(files):
            ext = os.path.splitext(file.filename)[1].lower()
            if ext not in [".ppt", ".pptx"]:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid file extension: {file.filename}. Only .ppt and .pptx are allowed."
                )
            
            in_path = os.path.join(temp_dir, f"in_{uuid.uuid4()}{ext}")
            temp_in_paths.append(in_path)
            
            with open(in_path, "wb") as f:
                f.write(await file.read())
            
            out_pdf = convert_to_pdf_with_libreoffice(in_path, temp_dir)
            
            # Apply rotation if specified and != 0
            rot = rot_list[idx]
            if rot in [90, 180, 270]:
                doc = fitz.open(out_pdf)
                for page in doc:
                    page.set_rotation((page.rotation + rot) % 360)
                doc.save(out_pdf, incremental=True)
                doc.close()
                
            temp_pdf_paths.append(out_pdf)
            
        # If there is only one file, return it directly
        if len(files) == 1:
            for p in temp_in_paths:
                if os.path.exists(p):
                    try: os.remove(p)
                    except: pass
            
            filename = f"Converted_{os.path.splitext(files[0].filename)[0]}.pdf"
            return FileResponse(
                temp_pdf_paths[0],
                media_type="application/pdf",
                filename=filename,
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )
            
        # If there are multiple files, bundle them into a ZIP archive
        zip_filename = f"Converted_PDF_Presentations_{unique_id}.zip"
        zip_path = os.path.join(temp_dir, zip_filename)
        
        with zipfile.ZipFile(zip_path, "w") as zip_file:
            for idx, pdf_path in enumerate(temp_pdf_paths):
                original_name = files[idx].filename
                base_name = os.path.splitext(original_name)[0]
                zip_file.write(pdf_path, arcname=f"{base_name}.pdf")
                
        # Clean up temporary PDFs and input files
        for p in temp_in_paths + temp_pdf_paths:
            if os.path.exists(p):
                try: os.remove(p)
                except: pass
                
        return FileResponse(
            zip_path,
            media_type="application/zip",
            filename="Converted_PowerPoint_PDFs.zip",
            headers={"Content-Disposition": "attachment; filename=Converted_PowerPoint_PDFs.zip"}
        )
        
    except Exception as e:
        # Cleanup on failure
        for p in temp_in_paths + temp_pdf_paths:
            if os.path.exists(p):
                try: os.remove(p)
                except: pass
        print("Batch PowerPoint to PDF Error:", e)
        raise HTTPException(status_code=500, detail=f"Failed to convert PowerPoint files to PDF: {str(e)}")

# 📈 EXCEL to PDF (.pdf)
@router.post("/excel-to-pdf")
async def excel_to_pdf(file: UploadFile = File(...)):
    return await handle_libreoffice_conversion(
        file=file, 
        allowed_exts=[".xls", ".xlsx", ".csv"], 
        err_prefix="Excel to PDF", 
        response_prefix="Converted_Data"
    )

async def render_with_playwright(source: str, out_path: str, is_url: bool):
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu"
            ]
        )
        context = await browser.new_context(
            viewport={'width': 1280, 'height': 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            ignore_https_errors=True
        )
        page = await context.new_page()
        
        # Prevent popup alert messages from blocking page load
        page.on("dialog", lambda dialog: dialog.dismiss())
        
        if is_url:
            try:
                await page.goto(source, wait_until="networkidle", timeout=25000)
            except Exception as e:
                print(f"Playwright networkidle timeout/error on {source}: {e}. Proceeding.")
                try:
                    await page.wait_for_timeout(2000)
                except:
                    pass
        else:
            file_url = f"file:///{os.path.abspath(source).replace(os.sep, '/')}"
            try:
                await page.goto(file_url, wait_until="networkidle", timeout=15000)
            except Exception as e:
                print(f"Playwright local html load warning: {e}. Proceeding.")
                
        await page.pdf(
            path=out_path,
            format="A4",
            print_background=True,
            margin={"top": "1cm", "bottom": "1cm", "left": "1cm", "right": "1cm"}
        )
        await browser.close()

async def render_preview_with_playwright(url: str, out_path: str):
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu"
            ]
        )
        context = await browser.new_context(
            viewport={'width': 1280, 'height': 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, with Gecko) Chrome/120.0.0.0 Safari/537.36",
            ignore_https_errors=True
        )
        page = await context.new_page()
        page.on("dialog", lambda dialog: dialog.dismiss())
        
        try:
            await page.goto(url, wait_until="networkidle", timeout=25000)
        except Exception as e:
            print(f"Playwright preview load error: {e}. Proceeding.")
            try:
                await page.wait_for_timeout(2000)
            except:
                pass
                
        await page.screenshot(path=out_path, type="jpeg", quality=80)
        await browser.close()

# 📄 HTML to PDF (.pdf)
@router.post("/html-to-pdf")
async def html_to_pdf(file: UploadFile = File(...)):
    import uuid
    import tempfile
    
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".html", ".htm"]:
        raise HTTPException(
            status_code=400, 
            detail="Invalid file extension. Allowed extensions are: .html, .htm"
        )
        
    unique_id = str(uuid.uuid4())
    temp_dir = tempfile.gettempdir()
    in_path = os.path.join(temp_dir, f"in_{unique_id}{ext}")
    out_path = os.path.join(temp_dir, f"out_{unique_id}.pdf")
    
    try:
        with open(in_path, "wb") as f:
            f.write(await file.read())
            
        await render_with_playwright(in_path, out_path, is_url=False)
        
        base_filename = os.path.splitext(file.filename)[0]
        clean_filename = f"Converted_{base_filename}.pdf"
        
        return FileResponse(
            out_path,
            media_type="application/pdf",
            filename=clean_filename,
            headers={"Content-Disposition": f"attachment; filename={clean_filename}"}
        )
    except Exception as e:
        print("HTML to PDF Playwright Error:", e)
        raise HTTPException(status_code=500, detail=f"Failed to convert HTML to PDF: {str(e)}")
    finally:
        if os.path.exists(in_path):
            try: os.remove(in_path)
            except: pass

# 🌐 URL to PDF
@router.post("/url-to-pdf")
async def url_to_pdf(url: str = Form(...)):
    import uuid
    import tempfile
    from urllib.parse import urlparse
    
    target_url = url.strip()
    if not target_url.startswith(("http://", "https://")):
        target_url = "http://" + target_url
        
    unique_id = str(uuid.uuid4())
    temp_dir = tempfile.gettempdir()
    out_path = os.path.join(temp_dir, f"webpage_{unique_id}.pdf")
    
    try:
        await render_with_playwright(target_url, out_path, is_url=True)
        
        parsed_url = urlparse(target_url)
        domain = parsed_url.netloc.replace("www.", "") or "webpage"
        clean_filename = f"Webpage_{domain}.pdf"
        
        return FileResponse(
            out_path,
            media_type="application/pdf",
            filename=clean_filename,
            headers={"Content-Disposition": f"attachment; filename={clean_filename}"}
        )
    except Exception as e:
        print("URL to PDF Playwright Error:", e)
        raise HTTPException(status_code=500, detail=f"Failed to convert URL to PDF: {str(e)}")

# 🌐 URL to Image Preview
@router.post("/url-preview")
async def url_preview(url: str = Form(...)):
    import uuid
    import tempfile
    from fastapi import BackgroundTasks
    
    target_url = url.strip()
    if not target_url.startswith(("http://", "https://")):
        target_url = "http://" + target_url
        
    unique_id = str(uuid.uuid4())
    temp_dir = tempfile.gettempdir()
    out_path = os.path.join(temp_dir, f"preview_{unique_id}.jpg")
    
    try:
        await render_preview_with_playwright(target_url, out_path)
        
        # Schedule cleanup after response is sent
        def remove_file(filepath: str):
            if os.path.exists(filepath):
                try: os.remove(filepath)
                except: pass
                
        bg_tasks = BackgroundTasks()
        bg_tasks.add_task(remove_file, out_path)
        
        return FileResponse(
            out_path,
            media_type="image/jpeg",
            filename="preview.jpg",
            background=bg_tasks
        )
    except Exception as e:
        print("URL Preview Playwright Error:", e)
        raise HTTPException(status_code=500, detail=f"Failed to generate webpage preview: {str(e)}")



# 🖼️ GENERATE DOCUMENT THUMBNAIL
@router.post("/document-thumbnail")
async def document_thumbnail(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".doc", ".docx", ".ppt", ".pptx", ".pdf"]:
        raise HTTPException(status_code=400, detail="Unsupported file format for thumbnail generation.")
    
    import uuid
    import tempfile
    import fitz
    
    unique_id = str(uuid.uuid4())
    temp_dir = tempfile.gettempdir()
    in_path = os.path.join(temp_dir, f"thumb_in_{unique_id}{ext}")
    
    try:
        # Save temp file
        with open(in_path, "wb") as f:
            f.write(await file.read())
            
        out_pdf_path = None
        
        # If it is already a PDF
        if ext == ".pdf":
            out_pdf_path = in_path
        else:
            # Convert doc/docx/ppt/pptx to PDF with LibreOffice
            out_pdf_path = convert_to_pdf_with_libreoffice(in_path, temp_dir)
            
        # Extract first page using PyMuPDF (fitz)
        doc = fitz.open(out_pdf_path)
        if len(doc) == 0:
            raise Exception("Generated PDF contains no pages")
            
        page = doc[0]
        pix = page.get_pixmap(dpi=100) # Quick preview dpi
        
        png_filename = f"thumb_out_{unique_id}.png"
        png_path = os.path.join(temp_dir, png_filename)
        pix.save(png_path)
        
        doc.close()
        
        # Clean up input and converted files
        if os.path.exists(in_path):
            try: os.remove(in_path)
            except: pass
        if out_pdf_path and out_pdf_path != in_path and os.path.exists(out_pdf_path):
            try: os.remove(out_pdf_path)
            except: pass
            
        # Return the PNG thumbnail
        return FileResponse(
            png_path,
            media_type="image/png",
            filename="thumbnail.png"
        )
        
    except Exception as e:
        # Clean up on failure
        if os.path.exists(in_path):
            try: os.remove(in_path)
            except: pass
        print("Thumbnail Generation Error:", e)
        raise HTTPException(status_code=500, detail=f"Failed to generate thumbnail: {str(e)}")


