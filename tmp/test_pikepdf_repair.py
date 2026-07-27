import pikepdf
import fitz
import os
import glob

def test_pikepdf_repair(input_path, output_path, log_file):
    def log(msg):
        print(msg)
        log_file.write(msg + "\n")

    log(f"--- PikePDF Repair on {input_path} ---")
    try:
        # Opening page structures using pikepdf's native C++ recovery engine
        with pikepdf.Pdf.open(input_path) as pdf:
            pdf.save(output_path)
        log(f"SUCCESS! Output size: {os.path.getsize(output_path)} bytes")
        
        # Verify text layout in repaired file
        doc = fitz.open(output_path)
        log(f"  Pages rebuilt: {len(doc)}")
        text_found = False
        for i, page in enumerate(doc[:5]):
            txt = page.get_text().strip()
            if txt:
                log(f"  Page {i} text preview: '{txt[:100]}...'")
                text_found = True
        if not text_found:
            log("  Warning: No text could be extracted from the first 5 pages.")
        doc.close()
        return True
    except Exception as e:
        log(f"FAILED: {e}")
        return False

out_dir = "e:/AI-PROJECT-WORK/doc-intel/tmp/pikepdf_outputs"
os.makedirs(out_dir, exist_ok=True)

with open("e:/AI-PROJECT-WORK/doc-intel/tmp/test_pikepdf_repair.log", "w", encoding="utf-8") as lf:
    for p in sorted(glob.glob("e:/AI-PROJECT-WORK/doc-intel/corrupt_test_files/*.pdf")):
        if "valid" in p:
            continue
        out_file = os.path.join(out_dir, os.path.basename(p))
        test_pikepdf_repair(p, out_file, lf)
