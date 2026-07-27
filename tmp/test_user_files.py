import os
import io
import pikepdf
import fitz
from PyPDF2 import PdfReader, PdfWriter
import subprocess
import tempfile
import uuid

GS_PATH = r"C:\Program Files\gs\gs10.06.0\bin\gswin64c.exe"

def run_layer_1_pypdf2(raw_bytes):
    try:
        reader = PdfReader(io.BytesIO(raw_bytes), strict=False)
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        out_buf = io.BytesIO()
        writer.write(out_buf)
        return out_buf.getvalue(), "SUCCESS"
    except Exception as e:
        return None, str(e)

def run_layer_1_2_pikepdf(raw_bytes):
    try:
        in_io = io.BytesIO(raw_bytes)
        with pikepdf.Pdf.open(in_io) as pdf:
            out_io = io.BytesIO()
            pdf.save(out_io)
            return out_io.getvalue(), "SUCCESS"
    except Exception as e:
        return None, str(e)

def run_layer_1_5_gs(raw_bytes):
    try:
        temp_dir = tempfile.gettempdir()
        in_temp = os.path.join(temp_dir, f"gs_in_{uuid.uuid4().hex}.pdf")
        out_temp = os.path.join(temp_dir, f"gs_out_{uuid.uuid4().hex}.pdf")
        with open(in_temp, "wb") as f:
            f.write(raw_bytes)
        cmd = [
            GS_PATH if os.path.exists(GS_PATH) else "gswin64c",
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
            return repaired_bytes, "SUCCESS"
        else:
            return None, f"Exit code {res.returncode}"
    except Exception as e:
        return None, str(e)
    finally:
        if os.path.exists(in_temp): os.remove(in_temp)
        if os.path.exists(out_temp): os.remove(out_temp)

def run_layer_2_fitz_mild(raw_bytes):
    try:
        doc = fitz.open(stream=raw_bytes, filetype="pdf")
        out_buf = io.BytesIO()
        doc.save(out_buf, clean=True, deflate=True)
        doc.close()
        return out_buf.getvalue(), "SUCCESS"
    except Exception as e:
        return None, str(e)

def run_layer_4_rasterize(raw_bytes):
    try:
        doc = fitz.open(stream=raw_bytes, filetype="pdf")
        if len(doc) == 0:
            return None, "zero pages"
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
        out_buf = io.BytesIO()
        out_doc.save(out_buf)
        out_doc.close()
        return out_buf.getvalue(), "SUCCESS"
    except Exception as e:
        return None, str(e)

# Target Files
user_dir = r"C:\Users\Kapil_MLAI\Downloads\currupt"
out_dir = "e:/AI-PROJECT-WORK/doc-intel/tmp/user_repaired"
os.makedirs(out_dir, exist_ok=True)

log_path = "e:/AI-PROJECT-WORK/doc-intel/tmp/test_user_files.log"

with open(log_path, "w", encoding="utf-8") as lf:
    def log(msg):
        print(msg)
        lf.write(msg + "\n")

    for fname in os.listdir(user_dir):
        fpath = os.path.join(user_dir, fname)
        if not fname.endswith(".pdf"):
            continue
        log(f"\n========================================\nFILE: {fname} (Size: {os.path.getsize(fpath)} bytes)")
        with open(fpath, "rb") as f:
            raw_bytes = f.read()

        # Fix Header/EOF beforehand (just like main code does)
        pdf_start = raw_bytes.find(b'%PDF-')
        if pdf_start == -1:
            raw_bytes = b'%PDF-1.4\n' + raw_bytes
        elif pdf_start > 0:
            raw_bytes = raw_bytes[pdf_start:]
        if b'%%EOF' not in raw_bytes[-1024:]:
            raw_bytes += b'\n%%EOF\n'

        # Test each layer
        for run_func, name in [
            (run_layer_1_pypdf2, "Layer 1 (PyPDF2)"),
            (run_layer_1_2_pikepdf, "Layer 1.2 (pikepdf)"),
            (run_layer_1_5_gs, "Layer 1.5 (Ghostscript)"),
            (run_layer_2_fitz_mild, "Layer 2 (Fitz Mild)"),
            (run_layer_4_rasterize, "Layer 4 (Rasterize)")
        ]:
            res, status = run_func(raw_bytes)
            log(f"  {name}: {status}")
            if res:
                log(f"    Result Size: {len(res)} bytes")
                # Verify pages and text
                try:
                    doc = fitz.open(stream=res, filetype="pdf")
                    log(f"    Pages: {len(doc)}")
                    text = ""
                    images_on_page_0 = len(doc[0].get_image_info()) if len(doc) > 0 else 0
                    for p in doc[:3]:
                        text += p.get_text()
                    log(f"    Text length (first 3 pages): {len(text.strip())}")
                    log(f"    Images on Page 0: {images_on_page_0}")
                    doc.close()
                except Exception as e2:
                    log(f"    Re-open verification failed: {e2}")
