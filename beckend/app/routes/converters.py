from fastapi import APIRouter, File, UploadFile, HTTPException, Form
from fastapi.responses import FileResponse
import tempfile
import os
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
from openpyxl.styles import Font
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
# 🖼️ PDF to JPG (ZIP)
# ---------------------------------------------------------------------
@router.post("/pdf-to-jpg")
async def pdf_to_jpg(
    file: UploadFile = File(...),
    mode: str = Form("pages")
):
    try:
        pdf_bytes = await file.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        if mode == "text":
            text_content = ""
            for page_num in range(len(doc)):
                page = doc.load_page(page_num)
                text_content += f"--- Page {page_num + 1} ---\n\n"
                text_content += page.get_text("text") + "\n\n"
            
            text_bytes = text_content.encode("utf-8")
            return StreamingResponse(
                io.BytesIO(text_bytes),
                media_type="text/plain",
                headers={"Content-Disposition": "attachment; filename=Extracted_Text.txt"}
            )
        elif mode == "text_ocr":
            text_content = ""
            for page_num in range(len(doc)):
                page = doc.load_page(page_num)
                pix = page.get_pixmap(dpi=150)
                img = Image.open(io.BytesIO(pix.tobytes("jpeg")))
                text = pytesseract.image_to_string(img, lang="hin+eng")
                text_content += f"--- Page {page_num + 1} ---\n\n"
                text_content += text + "\n\n"
            
            text_bytes = text_content.encode("utf-8")
            return StreamingResponse(
                io.BytesIO(text_bytes),
                media_type="text/plain",
                headers={"Content-Disposition": "attachment; filename=Extracted_Text_OCR.txt"}
            )
        else:
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, "w") as zipf:
                if mode == "images":
                    img_count = 0
                    for page_num in range(len(doc)):
                        page = doc.load_page(page_num)
                        image_list = page.get_images(full=True)
                        for img_index, img in enumerate(image_list):
                            xref = img[0]
                            base_image = doc.extract_image(xref)
                            image_bytes = base_image["image"]
                            image_ext = base_image["ext"]
                            img_count += 1
                            zipf.writestr(f"Image_{img_count}.{image_ext}", image_bytes)
                    if img_count == 0:
                        zipf.writestr("no_images_found.txt", b"No embedded images were found in this PDF.")
                else:
                    for page_num in range(len(doc)):
                        page = doc.load_page(page_num)
                        pix = page.get_pixmap(dpi=150)
                        img_bytes = pix.tobytes("jpeg")
                        zipf.writestr(f"Page_{page_num + 1}.jpg", img_bytes)
                    
            zip_buffer.seek(0)
            
            filename = "Extracted_Images.zip" if mode == "images" else "Converted_Images.zip"
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
@router.post("/pdf-to-ppt")
async def pdf_to_ppt(file: UploadFile = File(...)):
    try:
        temp_dir = tempfile.gettempdir()
        pdf_bytes = await file.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        prs = Presentation()
        # Empty slide layout is usually index 6
        blank_slide_layout = prs.slide_layouts[6]
        
        # Match PPT slide size to the first page of the PDF
        if len(doc) > 0:
            first_page = doc.load_page(0)
            prs.slide_width = int(Pt(first_page.rect.width))
            prs.slide_height = int(Pt(first_page.rect.height))
            
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            slide = prs.slides.add_slide(blank_slide_layout)
            
            # Since slide size matches PDF size, scale is 1.0 (assuming uniform pages)
            # We will recalculate scale just in case a page has a different size
            pdf_width = page.rect.width
            pdf_height = page.rect.height
            scale_x = prs.slide_width / Pt(pdf_width) if pdf_width else 1.0
            scale_y = prs.slide_height / Pt(pdf_height) if pdf_height else 1.0
            
            page_dict = page.get_text("dict")
            for block in page_dict.get("blocks", []):
                x0, y0, x1, y1 = block.get("bbox", (0, 0, 0, 0))
                
                left = int(Pt(x0) * scale_x)
                top = int(Pt(y0) * scale_y)
                width = int(Pt(x1 - x0) * scale_x)
                height = int(Pt(y1 - y0) * scale_y)
                
                # Text Block
                if block.get("type") == 0:
                    lines = block.get("lines", [])
                    if not lines: continue
                    
                    # Protect against zero width/height
                    if width <= 0: width = Pt(50)
                    if height <= 0: height = Pt(20)
                    
                    txBox = slide.shapes.add_textbox(left, top, width, height)
                    tf = txBox.text_frame
                    tf.word_wrap = True
                    tf.clear() # Clear default empty paragraph
                    
                    for line in lines:
                        p = tf.add_paragraph()
                        # Simple alignment heuristic based on line vs block bbox
                        # For exactness, PPTx alignment is tricky, so we stick to Left by default
                        
                        for span in line.get("spans", []):
                            text = span.get("text", "")
                            if not text.strip(): # Skip entirely empty spans to save objects, but keep spaces if needed
                                if text: p.add_run().text = text
                                continue
                                
                            run = p.add_run()
                            run.text = text
                            
                            # Extract and set font size
                            font_size = span.get("size", 12)
                            # scale font size vertically
                            run.font.size = int(Pt(font_size) * scale_y) 
                            
                            # We can also attempt to read color
                            color_int = span.get("color", 0)
                            # PyMuPDF color is sRGB integer: (R << 16) + (G << 8) + B
                            if type(color_int) == int:
                                b = color_int & 255
                                g = (color_int >> 8) & 255
                                r = (color_int >> 16) & 255
                                run.font.color.rgb = RGBColor(r, g, b)
                                
                            # Basic Font flags: 16 (bold), 2 (italic)
                            flags = span.get("flags", 0)
                            if flags & 16:
                                run.font.bold = True
                            if flags & 2:
                                run.font.italic = True
                        
                # Image Block
                elif block.get("type") == 1:
                    img_bytes = block.get("image")
                    if img_bytes:
                        img_ext = block.get("ext", "png")
                        tmp_img_path = os.path.join(temp_dir, f"tmp_ppt_img_{page_num}_{int(x0)}.{img_ext}")
                        with open(tmp_img_path, "wb") as img_file:
                            img_file.write(img_bytes)
                        
                        try:
                            # Protect against zero width/height
                            if width <= 0: width = Pt(100)
                            if height <= 0: height = Pt(100)
                            slide.shapes.add_picture(tmp_img_path, left, top, width, height)
                        except Exception as e:
                            print(f"Warning: Could not add picture to PPTX: {e}")
                        finally:
                            if os.path.exists(tmp_img_path):
                                os.remove(tmp_img_path)
                    
        doc.close()
        
        pptx_path = os.path.join(temp_dir, f"presentation_{file.filename}.pptx")
        prs.save(pptx_path)
        
        return FileResponse(
            pptx_path,
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            filename=f"Presentation_{file.filename}.pptx"
        )
    except Exception as e:
        print("PDF to PPT Error:", e)
        raise HTTPException(status_code=500, detail=f"Failed to convert PDF to PPT: {e}")

# ---------------------------------------------------------------------
# 📈 PDF to EXCEL (.xlsx)
# ---------------------------------------------------------------------
@router.post("/pdf-to-excel")
async def pdf_to_excel(file: UploadFile = File(...)):
    try:
        temp_dir = tempfile.gettempdir()
        pdf_path = os.path.join(temp_dir, f"tmp_excel_{file.filename}")
        
        with open(pdf_path, "wb") as f:
            f.write(await file.read())
            
        xlsx_path = os.path.join(temp_dir, f"tables_{file.filename}.xlsx")
        
        doc = fitz.open(pdf_path)
        wb = Workbook()
        ws_created = False
        
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            
            # Use 'dict' to get full styling info: blocks -> lines -> spans
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
                
            ws_created = True
            ws = wb.create_sheet(title=f"Page_{page_num+1}"[:31])
            
            # Sort vertically
            all_elements.sort(key=lambda item: item["y0"])
            
            rows = []
            current_row = []
            current_y = all_elements[0]["y0"]
            y_tolerance = 5 
            
            for el in all_elements:
                if abs(el["y0"] - current_y) <= y_tolerance:
                    current_row.append(el)
                    # Average out the Y for stability
                    current_y = (current_y + el["y0"]) / 2
                else:
                    rows.append(current_row)
                    current_row = [el]
                    current_y = el["y0"]
            if current_row:
                rows.append(current_row)
                
            col_width_factor = 40 # 1 excel column ~ 40 points wide layout
            
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
                    
                    # Apply Font Styles
                    is_bold = bool(item["flags"] & 16)
                    is_italic = bool(item["flags"] & 2)
                    
                    try:
                        cell.font = Font(
                            color=item["color"], 
                            size=int(item["size"]), 
                            bold=is_bold, 
                            italic=is_italic
                        )
                    except Exception:
                        pass # standard fallback
                        
                    max_font_size = max(max_font_size, int(item["size"]))
                    
                    # Approx visual width sizing based on characters
                    col_letter = get_column_letter(col_idx)
                    current_col_width = ws.column_dimensions[col_letter].width or 8
                    needed_width = len(item["text"]) * (item["size"] / 12) * 1.0
                    if needed_width > current_col_width:
                        ws.column_dimensions[col_letter].width = min(needed_width, 50)
                
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
async def word_to_pdf(files: list[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")
    if len(files) > 50:
        raise HTTPException(status_code=400, detail="Maximum limit of 50 documents exceeded per conversion request.")
    
    if len(files) == 1:
        return await handle_libreoffice_conversion(
            file=files[0], 
            allowed_exts=[".doc", ".docx"], 
            err_prefix="Word to PDF", 
            response_prefix="Converted"
        )
    
    import uuid
    unique_id = str(uuid.uuid4())
    temp_dir = tempfile.gettempdir()
    
    temp_pdf_paths = []
    temp_in_paths = []
    
    try:
        # Convert each Word document to a PDF in order
        for file in files:
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
            temp_pdf_paths.append(out_pdf)
            
        # Merge all generated PDFs
        merged_doc = fitz.open()
        for pdf_path in temp_pdf_paths:
            doc = fitz.open(pdf_path)
            merged_doc.insert_pdf(doc)
            doc.close()
            
        output_filename = f"Merged_Converted_Documents_{unique_id}.pdf"
        output_path = os.path.join(temp_dir, output_filename)
        merged_doc.save(output_path)
        merged_doc.close()
        
        # Cleanup temporary files
        for p in temp_in_paths:
            if os.path.exists(p):
                try: os.remove(p)
                except: pass
        for p in temp_pdf_paths:
            if os.path.exists(p):
                try: os.remove(p)
                except: pass
                
        return FileResponse(
            output_path,
            media_type="application/pdf",
            filename="Converted_Word_Documents.pdf",
            headers={"Content-Disposition": "attachment; filename=Converted_Word_Documents.pdf"}
        )
        
    except Exception as e:
        # Cleanup on failure
        for p in temp_in_paths:
            if os.path.exists(p):
                try: os.remove(p)
                except: pass
        for p in temp_pdf_paths:
            if os.path.exists(p):
                try: os.remove(p)
                except: pass
        print("Batch Word to PDF Error:", e)
        raise HTTPException(status_code=500, detail=f"Failed to convert Word files to PDF: {str(e)}")

# 📊 POWERPOINT to PDF (.pdf)
@router.post("/ppt-to-pdf")
async def ppt_to_pdf(files: list[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")
    if len(files) > 50:
        raise HTTPException(status_code=400, detail="Maximum limit of 50 presentations exceeded per conversion request.")
    
    if len(files) == 1:
        return await handle_libreoffice_conversion(
            file=files[0], 
            allowed_exts=[".ppt", ".pptx"], 
            err_prefix="PowerPoint to PDF", 
            response_prefix="Converted_Presentation"
        )
    
    import uuid
    unique_id = str(uuid.uuid4())
    temp_dir = tempfile.gettempdir()
    
    temp_pdf_paths = []
    temp_in_paths = []
    
    try:
        # Convert each Presentation slideshow to a PDF in order
        for file in files:
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
            temp_pdf_paths.append(out_pdf)
            
        # Merge all generated PDFs
        merged_doc = fitz.open()
        for pdf_path in temp_pdf_paths:
            doc = fitz.open(pdf_path)
            merged_doc.insert_pdf(doc)
            doc.close()
            
        output_filename = f"Merged_Converted_Presentations_{unique_id}.pdf"
        output_path = os.path.join(temp_dir, output_filename)
        merged_doc.save(output_path)
        merged_doc.close()
        
        # Cleanup temporary files
        for p in temp_in_paths:
            if os.path.exists(p):
                try: os.remove(p)
                except: pass
        for p in temp_pdf_paths:
            if os.path.exists(p):
                try: os.remove(p)
                except: pass
                
        return FileResponse(
            output_path,
            media_type="application/pdf",
            filename="Converted_Presentations.pdf",
            headers={"Content-Disposition": "attachment; filename=Converted_Presentations.pdf"}
        )
        
    except Exception as e:
        # Cleanup on failure
        for p in temp_in_paths:
            if os.path.exists(p):
                try: os.remove(p)
                except: pass
        for p in temp_pdf_paths:
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

# 📄 HTML to PDF (.pdf)
@router.post("/html-to-pdf")
async def html_to_pdf(file: UploadFile = File(...)):
    return await handle_libreoffice_conversion(
        file=file, 
        allowed_exts=[".html", ".htm"], 
        err_prefix="HTML to PDF", 
        response_prefix="Converted_Web"
    )

# 🌐 URL to PDF
@router.post("/url-to-pdf")
async def url_to_pdf(url: str = Form(...)):
    import requests
    import re
    import uuid
    import tempfile
    from urllib.parse import urljoin, urlparse
    
    try:
        # Fetch the content from the URL
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        res = requests.get(url, headers=headers, timeout=15)
        res.raise_for_status()
        
        html_content = res.text
        
        # Convert relative paths to absolute paths
        def make_absolute(match):
            attr = match.group(1)
            quote = match.group(2)
            val = match.group(3)
            if val.startswith(('http://', 'https://', 'data:', 'javascript:')):
                return match.group(0)
            abs_val = urljoin(url, val)
            return f'{attr}={quote}{abs_val}{quote}'

        pattern = re.compile(r'(src|href)\s*=\s*(["\'])(.*?)\2', re.IGNORECASE)
        html_content = pattern.sub(make_absolute, html_content)
        
        # Inject printing and page responsiveness styling
        responsive_styles = """
<style>
@page {
    size: A4;
    margin: 1.5cm;
}
body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #333333;
    line-height: 1.5;
    background-color: #ffffff !important;
    width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
}
img {
    max-width: 100% !important;
    height: auto !important;
    page-break-inside: avoid;
}
table {
    max-width: 100% !important;
    width: 100% !important;
    border-collapse: collapse !important;
    page-break-inside: auto;
}
tr {
    page-break-inside: avoid;
    page-break-after: auto;
}
pre, code {
    white-space: pre-wrap !important;
    word-wrap: break-word !important;
    max-width: 100% !important;
}
header, footer, nav, aside, .cookie-banner, .modal, .popup {
    position: relative !important;
}
</style>
"""
        if "</head>" in html_content:
            html_content = html_content.replace("</head>", f"{responsive_styles}</head>", 1)
        else:
            html_content = responsive_styles + html_content
            
        unique_id = str(uuid.uuid4())
        temp_dir = tempfile.gettempdir()
        in_path = os.path.join(temp_dir, f"in_{unique_id}.html")
        
        with open(in_path, "w", encoding="utf-8") as f:
            f.write(html_content)
            
        try:
            out_path = convert_to_pdf_with_libreoffice(in_path, temp_dir)
        finally:
            if os.path.exists(in_path):
                os.remove(in_path)
                
        # Extract page domain/name for the filename
        parsed_url = urlparse(url)
        domain = parsed_url.netloc.replace("www.", "") or "webpage"
        clean_filename = f"Webpage_{domain}.pdf"
        return FileResponse(
            out_path,
            media_type="application/pdf",
            filename=clean_filename,
            headers={"Content-Disposition": f"attachment; filename={clean_filename}"}
        )
    except Exception as e:
        print("URL to PDF Error:", e)
        raise HTTPException(status_code=500, detail=f"Failed to convert URL to PDF: {str(e)}")


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


