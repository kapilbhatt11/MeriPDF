import io
import fitz
import glob
import sys
import traceback
from PyPDF2 import PdfReader, PdfWriter

def repair(file_path, log_file):
    def log(msg):
        print(msg)
        log_file.write(msg + "\n")

    log(f"=== Testing: {file_path} ===")
    try:
        with open(file_path, 'rb') as f:
            raw_bytes = f.read()
    except Exception as e:
        log(f"Failed to read file: {e}")
        return
    
    # 1. Header Fix
    pdf_start = raw_bytes.find(b'%PDF-')
    if pdf_start == -1:
        raw_bytes = b'%PDF-1.4\n' + raw_bytes
    elif pdf_start > 0:
        raw_bytes = raw_bytes[pdf_start:]
        
    # 2. EOF Fix
    if b'%%EOF' not in raw_bytes[-1024:]:
        raw_bytes += b'\n%%EOF\n'

    # Layer 1
    try:
        reader = PdfReader(io.BytesIO(raw_bytes), strict=False)
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        out_buf = io.BytesIO()
        writer.write(out_buf)
        log("Layer 1 PyPDF2: Success")
        return
    except Exception as e:
        log(f"Layer 1 PyPDF2 Failed: {e}")

    # Layer 2
    try:
        doc = fitz.open(stream=raw_bytes, filetype='pdf')
        out_buf = io.BytesIO()
        doc.save(out_buf, clean=True, deflate=True)
        doc.close()
        log("Layer 2 PyMuPDF Mild: Success")
        return
    except Exception as e:
        log(f"Layer 2 PyMuPDF Mild Failed: {e}")

    # Layer 3
    try:
        doc = fitz.open(stream=raw_bytes, filetype='pdf')
        out_buf = io.BytesIO()
        doc.save(out_buf, garbage=4, deflate=True)
        doc.close()
        log("Layer 3 PyMuPDF Hard: Success")
        return
    except Exception as e:
        log(f"Layer 3 PyMuPDF Hard Failed: {e}")

    # Layer 4
    try:
        doc = fitz.open(stream=raw_bytes, filetype='pdf')
        
        # If open fails or doc is empty
        if len(doc) == 0:
            raise Exception("cannot save with zero pages")
            
        out_doc = fitz.open()
        for page in doc:
            pix = page.get_pixmap(dpi=150)
            img_bytes = pix.tobytes('jpeg')
            img_doc = fitz.open(stream=img_bytes, filetype='jpeg')
            img_pdf = img_doc.convert_to_pdf()
            temp_pdf = fitz.open('pdf', img_pdf)
            out_doc.insert_pdf(temp_pdf)
            temp_pdf.close()
            img_doc.close()
            
        out_buf = io.BytesIO()
        out_doc.save(out_buf, deflate=True)
        out_doc.close()
        doc.close()
        log("Layer 4 Rasterization: Success")
    except Exception as e:
        log(f"Layer 4 Rasterization Failed: {e}")
        log(traceback.format_exc())

with open("e:/AI-PROJECT-WORK/doc-intel/tmp/test_repair_run.log", "w", encoding="utf-8") as lf:
    for p in sorted(glob.glob("e:/AI-PROJECT-WORK/doc-intel/corrupt_test_files/*.pdf")):
        repair(p, lf)
