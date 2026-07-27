import os
import io
import pikepdf
import fitz

valid_pdf_path = "e:/AI-PROJECT-WORK/doc-intel/corrupt_test_files/0_valid_test.pdf"

# 1. Corrupt the valid file slightly (by changing a single character in the xref table or metadata)
with open(valid_pdf_path, 'rb') as f:
    buf = bytearray(f.read())

# Let's change a byte near the end to corrupt the trailer/xref slightly
idx = len(buf) - 50
buf[idx] = ord('X')

corrupt_path = "e:/AI-PROJECT-WORK/doc-intel/tmp/corrupt_text_test.pdf"
with open(corrupt_path, 'wb') as f:
    f.write(buf)

print("Corrupt file created.")

# 2. Repair with pikepdf
repaired_path = "e:/AI-PROJECT-WORK/doc-intel/tmp/repaired_text_test.pdf"
try:
    with pikepdf.Pdf.open(corrupt_path) as pdf:
        pdf.save(repaired_path)
    print("Repair succeeded.")
    
    # 3. Read text using fitz
    doc = fitz.open(repaired_path)
    text = doc[0].get_text().strip()
    print(f"Repaired Text extracted: '{text}'")
    doc.close()
    
except Exception as e:
    print("Repair failed with error:", e)
