import subprocess
import os
import glob

GS_PATH = r"C:\Program Files\gs\gs10.06.0\bin\gswin64c.exe"

def test_gs_repair(input_path, output_path, log_file):
    def log(msg):
        print(msg)
        log_file.write(msg + "\n")

    log(f"--- GS Repair on {input_path} ---")
    if not os.path.exists(GS_PATH):
        log(f"Ghostscript not found at: {GS_PATH}")
        return False
        
    cmd = [
        GS_PATH,
        "-dNOPAUSE",
        "-dBATCH",
        "-sDEVICE=pdfwrite",
        f"-sOutputFile={output_path}",
        input_path
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            log(f"SUCCESS! Output size: {os.path.getsize(output_path)} bytes")
            return True
        else:
            log(f"FAILED (code {res.returncode})")
            log(f"stdout: {res.stdout}")
            log(f"stderr: {res.stderr}")
            return False
    except Exception as e:
        log(f"EXCEPTION: {e}")
        return False

out_dir = "e:/AI-PROJECT-WORK/doc-intel/tmp/gs_outputs"
os.makedirs(out_dir, exist_ok=True)

with open("e:/AI-PROJECT-WORK/doc-intel/tmp/test_gs_repair.log", "w", encoding="utf-8") as lf:
    for p in sorted(glob.glob("e:/AI-PROJECT-WORK/doc-intel/corrupt_test_files/*.pdf")):
        out_file = os.path.join(out_dir, os.path.basename(p))
        test_gs_repair(p, out_file, lf)
