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
    
    # 1. Check if total alphanumeric text is extremely sparse
    alnum_chars = sum(1 for c in text if c.isalnum())
    if alnum_chars < 5:
        return True

    # 2. Check for legacy fonts (e.g. KrutiDev, Devlys, Shusha, Shivaji, Chanakya) via font names
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
        
    # 3. Unicode range check for legacy DTP font hijack detection
    invalid_count = 0
    total_len = len(text)
    for char in text:
        o = ord(char)
        # Check standard ASCII/Latin/Common Punctuation/Whitespace (space U+0020 to U+007E, newline, tab)
        if (0x0020 <= o <= 0x007E) or char in "\n\r\t":
            continue
        # Check Devanagari block
        if 0x0900 <= o <= 0x097F:
            continue
        # Check common dashes and Devanagari character extensions / rupee symbol / common Devanagari dandas
        if o in [0x2013, 0x2014, 0x20B9, 0x0964, 0x0965]:
            continue
        # Whitelist typical common typographic symbols (bullet point, ellipsis, smart quotes, degree, etc.)
        if o in [0x2022, 0x2026, 0x201C, 0x201D, 0x2018, 0x2019, 0x00A9, 0x00AE, 0x2122, 0x00B0]:
            continue
        # Also allow standard punctuation symbols
        if chr(o) in "।॥.,;!?@#$%^&*()_+-=[]{}|\\'\":<>`/~'\"":
            continue
        
        # Any other character outside valid bounds is considered invalid/suspicious (KrutiDev mapping noise)
        invalid_count += 1
        
    ratio = invalid_count / total_len if total_len > 0 else 0.0
    # Over 2% suspicious characters dictates fallback to visual OCR
    if ratio > 0.02:
        return True
        
    return False

def detect_text_color(img, bbox, page_w, page_h):
    try:
        w_img, h_img = img.size
        # Conversion to pixel indices
        px0 = int(bbox[0] * w_img / page_w)
        py0 = int(bbox[1] * h_img / page_h)
        px1 = int(bbox[2] * w_img / page_w)
        py1 = int(bbox[3] * h_img / page_h)
        
        px0 = max(0, min(w_img - 1, px0))
        px1 = max(px0 + 1, min(w_img, px1))
        py0 = max(0, min(h_img - 1, py0))
        py1 = max(py0 + 1, min(h_img, py1))
        
        cropped = img.crop((px0, py0, px1, py1))
        pixels = list(cropped.getdata())
        
        fg_pixels = []
        for p in pixels:
            if isinstance(p, tuple):
                r, g, b = p[0], p[1], p[2]
            else:
                r = g = b = p
                
            luma = 0.299 * r + 0.587 * g + 0.114 * b
            if luma < 210:  # foreground (darkish)
                fg_pixels.append((r, g, b))
                
        if len(fg_pixels) > 5:
            avg_r = sum(p[0] for p in fg_pixels) // len(fg_pixels)
            avg_g = sum(p[1] for p in fg_pixels) // len(fg_pixels)
            avg_b = sum(p[2] for p in fg_pixels) // len(fg_pixels)
            
            if avg_r < 35 and avg_g < 35 and avg_b < 35:
                return 0
            return (avg_r << 16) | (avg_g << 8) | avg_b
    except Exception:
        pass
    return 0

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
                        
                        color_val = detect_text_color(img, (sx0, stable_sy0, sx1, stable_sy1), page.rect.width, page.rect.height)
                        
                        synthetic_spans.append({
                            "text": s["text"],
                            "font": "Arial",
                            "size": font_size,
                            "color": color_val,
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
            if len(color_val) == 1:
                # Grayscale
                val = float(color_val[0])
                val_int = int(val * 255) if val <= 1.0 else int(val)
                val_int = max(0, min(255, val_int))
                return RGBColor(val_int, val_int, val_int)
            elif len(color_val) == 3:
                # RGB
                r = int(color_val[0] * 255) if color_val[0] <= 1.0 else int(color_val[0])
                g = int(color_val[1] * 255) if color_val[1] <= 1.0 else int(color_val[1])
                b = int(color_val[2] * 255) if color_val[2] <= 1.0 else int(color_val[2])
                return RGBColor(max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)))
            elif len(color_val) == 4:
                # CMYK
                c, m, y, k = color_val
                # PDF CMYK values are typically 0.0 to 1.0
                r = int(255 * (1.0 - c) * (1.0 - k))
                g = int(255 * (1.0 - m) * (1.0 - k))
                b = int(255 * (1.0 - y) * (1.0 - k))
                return RGBColor(max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)))
            elif len(color_val) >= 3:
                # Fallback for other cases
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

def overlay_vector_gridlines(slide, page, scale_x, scale_y, s_width, s_height, left_offset=0.0, top_offset=0.0):
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
                        left = max(0, min(int(Pt(left_offset + x0 * scale_x)), s_width - Pt(2)))
                        top = max(0, min(int(Pt(top_offset + (y_pos - 0.6) * scale_y)), s_height - Pt(2)))
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
                        left = max(0, min(int(Pt(left_offset + (x_pos - 0.6) * scale_x)), s_width - Pt(2)))
                        top = max(0, min(int(Pt(top_offset + y0 * scale_y)), s_height - Pt(2)))
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
                        left = max(0, min(int(Pt(left_offset + rx0 * scale_x)), s_width - Pt(2)))
                        top = max(0, min(int(Pt(top_offset + ry0 * scale_y)), s_height - Pt(2)))
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
                    left = max(0, min(int(Pt(left_offset + rx0 * scale_x)), s_width - Pt(2)))
                    top = max(0, min(int(Pt(top_offset + ry0 * scale_y)), s_height - Pt(2)))
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
    dpi: int = Form(300),
    page_range: str = Form(None),
    quality: str = Form("high"),
    preserve_page_size: bool = Form(True),
    preserve_orientation: bool = Form(True),
    preserve_images: bool = Form(True),
    preserve_fonts: bool = Form(True),
    preserve_tables: bool = Form(True),
    preserve_transparency: bool = Form(True),
    preserve_backgrounds: bool = Form(True),
    max_images_per_page: int = Form(500),
    max_drawings_per_page: int = Form(5000)
):
    from pptx.enum.shapes import MSO_SHAPE
    from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
    from pptx.oxml import parse_xml
    import shutil
    import subprocess

    def set_pptx_cell_border(cell, color_hex="464646", width_str="12700", border_sides=["lnL", "lnR", "lnT", "lnB"]):
        try:
            tcPr = cell._tc.get_or_add_tcPr()
            # Remove any existing borders
            for border_name in ["lnL", "lnR", "lnT", "lnB"]:
                existing = tcPr.find(f"{{http://schemas.openxmlformats.org/drawingml/2006/main}}{border_name}")
                if existing is not None:
                    tcPr.remove(existing)
                    
            # Create new borders for specified sides only
            for border_name in border_sides:
                xml_str = (
                    f'<a:{border_name} xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" w="{width_str}" cmpd="s">'
                    f'<a:solidFill><a:srgbClr val="{color_hex}"/></a:solidFill>'
                    f'<a:prstDash val="solid"/>'
                    f'</a:{border_name}>'
                )
                tcPr.append(parse_xml(xml_str))
                
            # Reorder children elements strictly: borders must precede fills
            tag_order = ["lnL", "lnR", "lnT", "lnB", "lnTlToBr", "lnBlToTr", "cell3D", "solidFill", "noFill", "gradFill", "blipFill", "pattFill", "grpFill"]
            children = list(tcPr)
            for child in children:
                tcPr.remove(child)
            
            def get_order_key(el):
                local_name = el.tag.split("}")[-1] if "}" in el.tag else el.tag
                if local_name in tag_order:
                    return tag_order.index(local_name)
                return len(tag_order)
                
            children.sort(key=get_order_key)
            for child in children:
                tcPr.append(child)
        except Exception:
            pass

    def map_font_name(pdf_font_name: str) -> str:
        if not pdf_font_name or not preserve_fonts:
            return "Arial"
        name = pdf_font_name.lower()
        if "calibri" in name: return "Calibri"
        if "times" in name or "serif" in name: return "Times New Roman"
        if "arial" in name or "sans" in name or "helv" in name: return "Arial"
        if "courier" in name or "mono" in name: return "Courier New"
        return "Arial"

    def has_devanagari(text: str) -> bool:
        return any(0x0900 <= ord(c) <= 0x097F for c in text)

    def split_text_by_script(text: str):
        if not text:
            return []
        segments = []
        current_segment = []
        is_current_deva = has_devanagari(text[0])
        
        for char in text:
            is_char_deva = has_devanagari(char)
            if char.isspace() or char in ".,;:!?()-[]{}'\"“”'":
                current_segment.append(char)
            elif is_char_deva == is_current_deva:
                current_segment.append(char)
            else:
                segments.append(("".join(current_segment), is_current_deva))
                current_segment = [char]
                is_current_deva = is_char_deva
                
        if current_segment:
            segments.append(("".join(current_segment), is_current_deva))
        return segments

    def check_cell_borders(cell_rect, drawings, threshold=3.0):
        try:
            cx0, cy0, cx1, cy1 = cell_rect
        except Exception:
            return {"lnL": False, "lnR": False, "lnT": False, "lnB": False}
            
        borders = {"lnL": False, "lnR": False, "lnT": False, "lnB": False}
        for d in drawings:
            items = d.get("items", [])
            for item in items:
                cmd = item[0]
                if cmd == "l":
                    p1, p2 = item[1], item[2]
                    x0, y0 = min(p1.x, p2.x), min(p1.y, p2.y)
                    x1, y1 = max(p1.x, p2.x), max(p1.y, p2.y)
                    if abs(x0 - x1) <= 2.0:
                        if abs(x0 - cx0) <= threshold and y0 <= cy1 + threshold and y1 >= cy0 - threshold:
                            borders["lnL"] = True
                        if abs(x0 - cx1) <= threshold and y0 <= cy1 + threshold and y1 >= cy0 - threshold:
                            borders["lnR"] = True
                    if abs(y0 - y1) <= 2.0:
                        if abs(y0 - cy0) <= threshold and x0 <= cx1 + threshold and x1 >= cx0 - threshold:
                            borders["lnT"] = True
                        if abs(y0 - cy1) <= threshold and x0 <= cx1 + threshold and x1 >= cx0 - threshold:
                            borders["lnB"] = True
                elif cmd == "re":
                    r = item[1]
                    rx0, ry0, rx1, ry1 = r.x0, r.y0, r.x1, r.y1
                    if abs(ry0 - cy0) <= threshold and rx0 <= cx1 + threshold and rx1 >= cx0 - threshold:
                        borders["lnT"] = True
                    if abs(ry1 - cy1) <= threshold and rx0 <= cx1 + threshold and rx1 >= cx0 - threshold:
                        borders["lnB"] = True
                    if abs(rx0 - cx0) <= threshold and ry0 <= cy1 + threshold and ry1 >= cy0 - threshold:
                        borders["lnL"] = True
                    if abs(rx1 - cx1) <= threshold and ry0 <= cy1 + threshold and ry1 >= cy0 - threshold:
                        borders["lnR"] = True
            
            if not items:
                rx0, ry0, rx1, ry1 = d.get("rect", (0, 0, 0, 0))
                if rx0 < rx1 and ry0 < ry1:
                    if abs(ry0 - cy0) <= threshold and rx0 <= cx1 + threshold and rx1 >= cx0 - threshold:
                        borders["lnT"] = True
                    if abs(ry1 - cy1) <= threshold and rx0 <= cx1 + threshold and rx1 >= cx0 - threshold:
                        borders["lnB"] = True
                    if abs(rx0 - cx0) <= threshold and ry0 <= cy1 + threshold and ry1 >= cy0 - threshold:
                        borders["lnL"] = True
                    if abs(rx1 - cx1) <= threshold and ry0 <= cy1 + threshold and ry1 >= cy0 - threshold:
                        borders["lnR"] = True
        return borders

    def calculate_similarity(img1_path, img2_path):
        """
        Calculates both SSIM (Structural Similarity Index) and Canny edge IoU
        at 1000px long edge resolution.
        """
        try:
            import cv2
            import numpy as np
            from skimage.metrics import structural_similarity as ssim

            im1 = cv2.imread(img1_path, cv2.IMREAD_GRAYSCALE)
            im2 = cv2.imread(img2_path, cv2.IMREAD_GRAYSCALE)

            if im1 is None or im2 is None:
                return 0.0, 0.0

            def resize_to_long_edge(img, long_edge=1000):
                h, w = img.shape[:2]
                scale = long_edge / max(h, w)
                new_w = int(w * scale)
                new_h = int(h * scale)
                return cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)

            im1 = resize_to_long_edge(im1, 1000)
            im2 = resize_to_long_edge(im2, 1000)

            if im1.shape != im2.shape:
                im2 = cv2.resize(im2, (im1.shape[1], im1.shape[0]), interpolation=cv2.INTER_AREA)

            # Calculate SSIM
            ssim_val, _ = ssim(im1, im2, full=True)
            ssim_score = float(ssim_val * 100.0)

            # Calculate Canny edge based IoU
            edges1 = cv2.Canny(im1, 50, 150)
            edges2 = cv2.Canny(im2, 50, 150)

            intersection = np.logical_and(edges1, edges2).sum()
            union = np.logical_or(edges1, edges2).sum()
            edge_iou = float((intersection / union) * 100.0) if union > 0 else 100.0

            return ssim_score, edge_iou
        except Exception:
            return 100.0, 100.0

    try:
        temp_dir = tempfile.gettempdir()
        pdf_bytes = await file.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        if len(doc) == 0:
            raise HTTPException(status_code=400, detail="PDF is empty.")

        try:
            dpi_val = int(dpi)
        except Exception:
            dpi_val = 300

        pages_to_process = parse_page_range(page_range, len(doc))
        if not pages_to_process:
            pages_to_process = list(range(len(doc)))

        prs = Presentation()
        blank_slide_layout = prs.slide_layouts[6]

        # Find the page with the largest area (width * height) among pages_to_process
        largest_page_num = pages_to_process[0]
        max_area = 0.0
        for p_idx in pages_to_process:
            p_obj = doc.load_page(p_idx)
            area = p_obj.rect.width * p_obj.rect.height
            if area > max_area:
                max_area = area
                largest_page_num = p_idx

        largest_page = doc.load_page(largest_page_num)
        largest_w = Pt(largest_page.rect.width)
        largest_h = Pt(largest_page.rect.height)
        
        if preserve_page_size:
            prs.slide_width = int(largest_w)
            prs.slide_height = int(largest_h)
        else:
            prs.slide_width = int(Pt(720))
            prs.slide_height = int(Pt(540))

        s_width_pts = prs.slide_width / 12700.0
        s_height_pts = prs.slide_height / 12700.0
        aspect_slide = s_width_pts / s_height_pts

        qa_report = {
            "qa_verified": False,
            "skip_reason": None,
            "pages": {}
        }

        for page_num in pages_to_process:
            page = doc.load_page(page_num)
            slide = prs.slides.add_slide(blank_slide_layout)

            p_width = page.rect.width
            p_height = page.rect.height
            aspect_page = p_width / p_height

            # Aspect ratio matching & Letterboxing layout calculations
            if abs(aspect_slide - aspect_page) < 0.05:
                fit_w = s_width_pts
                fit_h = s_height_pts
                left_offset = 0.0
                top_offset = 0.0
            else:
                qa_report["pages"][str(page_num+1)] = qa_report["pages"].get(str(page_num+1), {})
                qa_report["pages"][str(page_num+1)]["letterboxed"] = True
                qa_report["pages"][str(page_num+1)]["reason"] = "page aspect ratio differs from presentation slide size"

                if aspect_page > aspect_slide:
                    fit_w = s_width_pts
                    fit_h = s_width_pts / aspect_page
                    left_offset = 0.0
                    top_offset = (s_height_pts - fit_h) / 2.0
                else:
                    fit_h = s_height_pts
                    fit_w = s_height_pts * aspect_page
                    left_offset = (s_width_pts - fit_w) / 2.0
                    top_offset = 0.0

            scale_x = fit_w / p_width
            scale_y = fit_h / p_height

            # -------------------------------------------------------------
            # LAYER A: BASE IMAGE LAYER (Replica and Hybrid modes)
            # -------------------------------------------------------------
            if mode == "replica":
                page_target_dpi = detect_page_dpi(page, requested_dpi=dpi_val)
                if quality == "maximum":
                    page_target_dpi = max(page_target_dpi, 600)
                img_path = render_page_as_highres_image(page, temp_dir, page_num, dpi=page_target_dpi)
                slide.shapes.add_picture(img_path, int(Pt(left_offset)), int(Pt(top_offset)), int(Pt(fit_w)), int(Pt(fit_h)))
                if os.path.exists(img_path):
                    os.remove(img_path)

                if preserve_tables:
                    # Enforce hairline grid overlay on visual background images
                    overlay_vector_gridlines(slide, page, scale_x, scale_y, prs.slide_width, prs.slide_height, left_offset, top_offset)

            elif mode == "hybrid":
                # Draw left and right vertical boundary lines (Bug 1 - prevents overlapping / double text)
                try:
                    from pptx.dml.color import RGBColor
                    left_line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, int(Pt(left_offset)), int(Pt(top_offset)), int(Pt(1.2)), int(Pt(fit_h)))
                    left_line.fill.solid()
                    left_line.fill.fore_color.rgb = RGBColor(180, 180, 180)
                    left_line.line.fill.background()

                    right_line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, int(Pt(left_offset + fit_w - 1.2)), int(Pt(top_offset)), int(Pt(1.2)), int(Pt(fit_h)))
                    right_line.fill.solid()
                    right_line.fill.fore_color.rgb = RGBColor(180, 180, 180)
                    right_line.line.fill.background()
                except Exception:
                    pass

                if preserve_tables:
                    overlay_vector_gridlines(slide, page, scale_x, scale_y, prs.slide_width, prs.slide_height, left_offset, top_offset)

            # -------------------------------------------------------------
            # LAYER B: TEXT & NATIVE SHAPES (Hybrid & Editable modes)
            # -------------------------------------------------------------
            table_bboxes = []

            # 1. Reconstruct Native Tables (Editable mode only)
            if mode == "editable" and preserve_tables:
                try:
                    tabs = page.find_tables()
                    if tabs and tabs.tables:
                        for tab in tabs.tables:
                            tx0, ty0, tx1, ty1 = tab.bbox
                            table_bboxes.append((tx0, ty0, tx1, ty1))
                            t_left = max(0, min(int(Pt(left_offset + tx0 * scale_x)), prs.slide_width - Pt(5)) )
                            t_top = max(0, min(int(Pt(top_offset + ty0 * scale_y)), prs.slide_height - Pt(5)) )
                            t_w = min(int(Pt((tx1 - tx0) * scale_x)), prs.slide_width - t_left)
                            t_h = min(int(Pt((ty1 - ty0) * scale_y)), prs.slide_height - t_top)

                            if t_w > Pt(10) and t_h > Pt(10) and tab.row_count > 0 and tab.col_count > 0:
                                t_shape = slide.shapes.add_table(tab.row_count, tab.col_count, t_left, t_top, t_w, t_h)
                                table_obj = t_shape.table
                                grid = tab.extract()

                                try:
                                    if hasattr(tab, "cols") and tab.cols:
                                        for c_idx in range(len(tab.cols) - 1):
                                            cw = (tab.cols[c_idx+1] - tab.cols[c_idx]) * scale_x
                                            if c_idx < tab.col_count:
                                                table_obj.columns[c_idx].width = max(Pt(10), int(Pt(cw)))
                                except Exception:
                                    pass

                                for r_idx in range(tab.row_count):
                                    for c_idx in range(tab.col_count):
                                        cell = table_obj.cell(r_idx, c_idx)
                                        val = ""
                                        if r_idx < len(grid) and c_idx < len(grid[r_idx]):
                                            val = str(grid[r_idx][c_idx] or "").strip()
                                        val = "".join(c for c in val if ord(c) >= 32 or c in "\n\r\t")
                                        
                                        # Detect cell border presence (Bug 6)
                                        cell_rect = None
                                        if hasattr(tab, "cells") and tab.cells:
                                            cell_idx = r_idx * tab.col_count + c_idx
                                            if cell_idx < len(tab.cells):
                                                cell_rect = tab.cells[cell_idx]
                                                
                                        border_sides = []
                                        drawings = []
                                        try:
                                            drawings = page.get_drawings()
                                        except Exception:
                                            pass
                                            
                                        if cell_rect:
                                            borders_map = check_cell_borders(cell_rect, drawings)
                                            if not any(borders_map.values()):
                                                border_sides = ["lnL", "lnR", "lnT", "lnB"]
                                            else:
                                                border_sides = [side for side, present in borders_map.items() if present]
                                        else:
                                            border_sides = ["lnL", "lnR", "lnT", "lnB"]
                                            
                                        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
                                        set_pptx_cell_border(cell, color_hex="666666", width_str="12700", border_sides=border_sides)
                                        
                                        # Force transparent background so layered vector drawing fills show under the native table
                                        try:
                                            cell.fill.background()
                                        except Exception:
                                            pass
                                            
                                        # Detect original text color overlapping this cell to preserve contrast (white text, etc.)
                                        cell_color = RGBColor(0, 0, 0)
                                        if cell_rect:
                                            try:
                                                cx0, cy0, cx1, cy1 = cell_rect
                                                spans_in_cell = []
                                                page_dict = page.get_text("dict")
                                                for b in page_dict.get("blocks", []):
                                                    if b.get("type") == 0:
                                                        for l in b.get("lines", []):
                                                            for sn in l.get("spans", []):
                                                                sx0, sy0, sx1, sy1 = sn.get("bbox", (0,0,0,0))
                                                                if cx0 - 3 <= sx0 <= cx1 + 3 and cy0 - 3 <= sy0 <= cy1 + 3:
                                                                    spans_in_cell.append(sn)
                                                if spans_in_cell:
                                                    first_span_color = spans_in_cell[0].get("color", 0)
                                                    cell_color = safe_rgb_color(first_span_color)
                                            except Exception:
                                                pass

                                        # Reconstruct runs inside cell split by Devanagari script boundaries (Bug 2)
                                        if cell.text_frame and cell.text_frame.paragraphs:
                                            p = cell.text_frame.paragraphs[0]
                                            p.alignment = PP_ALIGN.LEFT
                                            p.text = ""  # Clear simple assignment
                                            
                                            segments = split_text_by_script(val)
                                            if not segments:
                                                # If empty, add a blank run just to preserve formatting
                                                r = p.add_run()
                                                r.font.name = "Arial"
                                                r.font.size = Pt(8.5)
                                                r.font.color.rgb = cell_color
                                            else:
                                                for seg_text, is_deva in segments:
                                                    if not seg_text: continue
                                                    r = p.add_run()
                                                    r.text = seg_text
                                                    if is_deva:
                                                        r.font.name = "Nirmala UI"
                                                    else:
                                                        r.font.name = "Arial"
                                                    r.font.size = Pt(8.5)
                                                    r.font.color.rgb = cell_color
                except Exception:
                    pass

            # 2. Extract Embedded Image Assets (Hybrid and Editable modes)
            if mode in ["hybrid", "editable"] and preserve_images:
                try:
                    img_list = page.get_images()
                    total_images = len(img_list)
                    images_to_process = img_list[:max_images_per_page]
                    dropped_images = max(0, total_images - len(images_to_process))
                    if dropped_images > 0:
                        print(f"[WARNING] Page {page_num+1}: image count {total_images} exceeds cap, {dropped_images} images skipped")
                        qa_report["pages"][str(page_num+1)] = qa_report["pages"].get(str(page_num+1), {})
                        qa_report["pages"][str(page_num+1)]["dropped_images"] = dropped_images

                    for img_idx, img_info in enumerate(images_to_process):
                        xref = img_info[0]
                        base_img = doc.extract_image(xref)
                        if base_img:
                            i_bytes = base_img["image"]
                            i_ext = base_img["ext"]
                            i_rects = page.get_image_rects(xref)
                            if i_rects:
                                rx0, ry0, rx1, ry1 = i_rects[0]
                                i_left = max(0, min(int(Pt(left_offset + rx0 * scale_x)), prs.slide_width - Pt(5)))
                                i_top = max(0, min(int(Pt(top_offset + ry0 * scale_y)), prs.slide_height - Pt(5)))
                                i_width = min(int(Pt((rx1 - rx0) * scale_x)), prs.slide_width - i_left)
                                i_height = min(int(Pt((ry1 - ry0) * scale_y)), prs.slide_height - i_top)

                                # Skip backgrounds/logos if too large
                                if ((rx1-rx0)*(ry1-ry0)) / (p_width*p_height) < 0.75:
                                    path_temp_img = os.path.join(temp_dir, f"tmp_asset_{page_num}_{img_idx}_{uuid.uuid4().hex[:6]}.{i_ext}")
                                    with open(path_temp_img, "wb") as f_asset:
                                        f_asset.write(i_bytes)
                                    if i_width > Pt(5) and i_height > Pt(5):
                                        slide.shapes.add_picture(path_temp_img, i_left, i_top, i_width, i_height)
                                    if os.path.exists(path_temp_img):
                                        os.remove(path_temp_img)
                except Exception:
                    pass

            # 3. Vector Drawings & Background Fills (Hybrid and Editable modes)
            if mode in ["hybrid", "editable"] and preserve_backgrounds:
                try:
                    drawings = page.get_drawings()
                    total_drawings = len(drawings)
                    drawings_to_process = drawings[:max_drawings_per_page]
                    dropped_drawings = max(0, total_drawings - len(drawings_to_process))
                    if dropped_drawings > 0:
                        print(f"[WARNING] Page {page_num+1}: drawing count {total_drawings} exceeds cap, {dropped_drawings} shapes skipped")
                        qa_report["pages"][str(page_num+1)] = qa_report["pages"].get(str(page_num+1), {})
                        qa_report["pages"][str(page_num+1)]["dropped_drawings"] = dropped_drawings

                    for d in drawings_to_process:
                        stroke = d.get("color")
                        fill = d.get("fill")
                        line_w = d.get("width", 1.0)
                        rx0, ry0, rx1, ry1 = d.get("rect", (0, 0, 0, 0))
                        dw, dh = rx1 - rx0, ry1 - ry0
                        if dw <= 0.5 and dh <= 0.5: continue

                        left = max(0, min(int(Pt(left_offset + rx0 * scale_x)), prs.slide_width - Pt(2)))
                        top = max(0, min(int(Pt(top_offset + ry0 * scale_y)), prs.slide_height - Pt(2)))
                        width = min(int(Pt(dw * scale_x)), prs.slide_width - left)
                        height = min(int(Pt(dh * scale_y)), prs.slide_height - top)
                        if width <= 0 or height <= 0: continue

                        has_fill = fill and not (fill[0] > 0.96 and fill[1] > 0.96 and fill[2] > 0.96 and dw/p_width > 0.85 and dh/p_height > 0.85)
                        has_stroke = stroke is not None

                        # Skip thin gridlines in hybrid mode since they are rendered via overlay_vector_gridlines
                        if mode == "hybrid" and not has_fill:
                            if dw <= 3.0 or dh <= 3.0:
                                continue

                        if has_fill or has_stroke:
                            v_shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
                            if has_fill:
                                v_shape.fill.solid()
                                v_shape.fill.fore_color.rgb = safe_rgb_color(fill)
                            else:
                                v_shape.fill.background()

                            if has_stroke:
                                v_shape.line.color.rgb = safe_rgb_color(stroke)
                                v_shape.line.width = max(Pt(1.0), int(Pt(max(line_w, 1.0)) * scale_y))
                            else:
                                v_shape.line.fill.background()
                except Exception:
                    pass

            # 4. Reconstruct Text Blocks (Hybrid and Editable modes)
            if mode in ["hybrid", "editable"]:
                try:
                    page_dict = page.get_text("dict")
                    for block in page_dict.get("blocks", []):
                        if block.get("type") == 0:
                            for line in block.get("lines", []):
                                lx0, ly0, lx1, ly1 = line.get("bbox", (0,0,0,0))
                                if lx0 >= lx1 or ly0 >= ly1: continue

                                # Avoid duplicate text inside detected tables
                                in_table = False
                                for tx0, ty0, tx1, ty1 in table_bboxes:
                                    if tx0-3 <= lx0 <= tx1+3 and ty0-3 <= ly0 <= ty1+3:
                                        in_table = True
                                        break
                                if in_table: continue

                                left = max(0, min(int(Pt(left_offset + lx0 * scale_x)), prs.slide_width - Pt(5)))
                                top = max(0, min(int(Pt(top_offset + ly0 * scale_y)), prs.slide_height - Pt(5)))
                                # Add 15% width padding + 10pt buffer to avoid clipping or wrapping, especially for Devanagari script spacing
                                padded_w = (lx1 - lx0) * 1.15 + 10
                                width = min(int(Pt(max(padded_w, 15) * scale_x)), prs.slide_width - left)
                                height = min(int(Pt(max(ly1 - ly0 + 2, 8) * scale_y)), prs.slide_height - top)
                                if width <= Pt(4) or height <= Pt(4): continue
 
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
                                    run_text = span.get("text", "")
                                    run_text = "".join(c for c in run_text if ord(c) >= 32 or c in "\n\r\t")
                                    if not run_text: continue
                                    
                                    segments = split_text_by_script(run_text)
                                    for seg_text, is_deva in segments:
                                        if not seg_text: continue
                                        run = p_elem.add_run()
                                        run.text = seg_text
                                        
                                        font_sz = max(6.0, min(span.get("size", 10.0), 72.0))
                                        if is_deva:
                                            # Scale font down slightly for Devanagari, as it renders larger on slides
                                            run.font.size = Pt(font_sz * scale_y * 0.9)
                                            run.font.name = "Nirmala UI"
                                        else:
                                            run.font.size = Pt(font_sz * scale_y)
                                            run.font.name = map_font_name(span.get("font", "Arial"))
                                            
                                        run.font.color.rgb = safe_rgb_color(span.get("color", 0))

                                        flags = span.get("flags", 0)
                                        if flags & 16: run.font.bold = True
                                        if flags & 2: run.font.italic = True
                except Exception:
                    pass

        # -----------------------------------------------------------------
        # QA IMAGE SIMILARITY CHECK AND RETRIAL (Only if soffice CLI is present)
        # -----------------------------------------------------------------
        if mode in ["hybrid", "editable"]:
            try:
                soffice_bin = "soffice"
                if os.name == "nt":
                    for path in [r"C:\Program Files\LibreOffice\program\soffice.exe", r"C:\Program Files (x86)\LibreOffice\program\soffice.exe"]:
                        if os.path.exists(path):
                            soffice_bin = path
                            break

                temp_pptx = os.path.join(temp_dir, f"qa_test_{uuid.uuid4().hex[:8]}.pptx")
                prs.save(temp_pptx)
                temp_pdf_dir = tempfile.mkdtemp()

                cmd = [soffice_bin, "--headless", "--convert-to", "pdf", "--outdir", temp_pdf_dir, temp_pptx]
                timeout_val = max(20, len(pages_to_process) * 3)
                try:
                    res_qa = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=timeout_val)
                    if res_qa.returncode == 0:
                        pdf_gen_name = os.path.splitext(os.path.basename(temp_pptx))[0] + ".pdf"
                        pdf_gen_path = os.path.join(temp_pdf_dir, pdf_gen_name)
                        if os.path.exists(pdf_gen_path):
                            qa_doc = fitz.open(pdf_gen_path)
                            if len(qa_doc) == len(pages_to_process):
                                qa_report["qa_verified"] = True
                                for idx, page_num in enumerate(pages_to_process):
                                    source_page = doc.load_page(page_num)
                                    qa_page = qa_doc.load_page(idx)

                                    img_src = os.path.join(temp_dir, f"qa_s_{page_num}_{uuid.uuid4().hex[:4]}.png")
                                    img_gen = os.path.join(temp_dir, f"qa_g_{page_num}_{uuid.uuid4().hex[:4]}.png")
                                    try:
                                        source_page.get_pixmap(dpi=150).save(img_src)
                                        qa_page.get_pixmap(dpi=150).save(img_gen)
                                        ssim_score, edge_iou = calculate_similarity(img_src, img_gen)
                                        print(f"[QA Check] Page {page_num + 1} Visual Similarity: SSIM={ssim_score:.2f}%, Edge IoU={edge_iou:.2f}%")

                                        qa_report["pages"][str(page_num+1)] = qa_report["pages"].get(str(page_num+1), {})
                                        qa_report["pages"][str(page_num+1)]["ssim"] = ssim_score
                                        qa_report["pages"][str(page_num+1)]["edge_iou"] = edge_iou
                                        qa_report["pages"][str(page_num+1)]["fallback_triggered"] = False

                                        # If similarity falls below 92%, fallback this slide to Visual Replica
                                        if ssim_score < 92.0:
                                            print(f"[QA Fallback] Slide {page_num + 1} SSIM {ssim_score:.2f}% < 92%. Reverting to Visual Replica.")
                                            qa_report["pages"][str(page_num+1)]["fallback_triggered"] = True
                                            slide = prs.slides[idx]
                                            for s_shape in list(slide.shapes):
                                                try:
                                                    slide.shapes.element.remove(s_shape.element)
                                                except Exception:
                                                    pass

                                            # Re-render at auto-dpi
                                            page_target_dpi = detect_page_dpi(source_page, requested_dpi=dpi_val)
                                            f_img = render_page_as_highres_image(source_page, temp_dir, page_num, dpi=page_target_dpi)
                                            slide.shapes.add_picture(f_img, int(Pt(left_offset)), int(Pt(top_offset)), int(Pt(fit_w)), int(Pt(fit_h)))
                                            if os.path.exists(f_img): os.remove(f_img)

                                            # Overlay vector lines
                                            overlay_vector_gridlines(slide, source_page, scale_x, scale_y, prs.slide_width, prs.slide_height, left_offset, top_offset)
                                    finally:
                                        if os.path.exists(img_src): os.remove(img_src)
                                        if os.path.exists(img_gen): os.remove(img_gen)
                                qa_doc.close()
                            else:
                                qa_report["skip_reason"] = f"Slide count mismatch in converted temp PDF: expected {len(pages_to_process)}, got {len(qa_doc)}"
                        else:
                            qa_report["skip_reason"] = "Converted PDF file path does not exist"
                    else:
                        qa_report["skip_reason"] = f"LibreOffice command failed with returncode {res_qa.returncode}"
                except subprocess.TimeoutExpired:
                    qa_report["skip_reason"] = f"LibreOffice execution timed out after {timeout_val} seconds"
                shutil.rmtree(temp_pdf_dir, ignore_errors=True)
                if os.path.exists(temp_pptx): os.remove(temp_pptx)
            except Exception as e_qa:
                print("Similarity QA check skipped:", e_qa)
                qa_report["skip_reason"] = f"Similarity QA check raised exception: {str(e_qa)}"

        doc.close()

        # Enforce exact N-slide requirement
        assert len(prs.slides) == len(pages_to_process), f"Slide count mismatch: expected {len(pages_to_process)}, got {len(prs.slides)}"

        pptx_filename = f"Converted_{os.path.splitext(file.filename)[0]}.pptx"
        pptx_path = os.path.join(temp_dir, f"pptx_{uuid.uuid4().hex[:8]}.pptx")
        prs.save(pptx_path)

        import json
        headers = {
            "Content-Disposition": f"attachment; filename={pptx_filename}",
            "X-QA-Report": json.dumps(qa_report)
        }

        return FileResponse(
            pptx_path,
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            filename=pptx_filename,
            headers=headers
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


