import os

# A minimal valid PDF v1.4 structure
MINIMAL_PDF_CONTENT = b"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /Name /F1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 44 >>
stream
BT
/F1 24 Tf
50 700 Td
(Test Document) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000332 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
427
%%EOF
"""

def generate_corrupted_files(output_dir):
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    valid_pdf_path = os.path.join(output_dir, "0_valid_test.pdf")
    with open(valid_pdf_path, "wb") as f:
        f.write(MINIMAL_PDF_CONTENT)
    print(f"Created: {valid_pdf_path}")

    # 1. Missing EOF (Hard Corrupt)
    # Removing the %%EOF at the end
    no_eof_path = os.path.join(output_dir, "corrupt_1_missing_eof.pdf")
    with open(no_eof_path, "wb") as f:
        f.write(MINIMAL_PDF_CONTENT[:-10]) # Chops off %%EOF
    print(f"Created: {no_eof_path}")

    # 2. Bad Header (Prepended Junk - Missing %PDF at start exactly)
    bad_header_path = os.path.join(output_dir, "corrupt_2_bad_header.pdf")
    with open(bad_header_path, "wb") as f:
        f.write(b"Malware Injection Bytes or Bad Server Logs...\n\n")
        f.write(MINIMAL_PDF_CONTENT)
    print(f"Created: {bad_header_path}")

    # 3. Truncated (Incomplete file)
    # Slices the file halfway through the page contents
    truncated_path = os.path.join(output_dir, "corrupt_3_truncated.pdf")
    with open(truncated_path, "wb") as f:
        f.write(MINIMAL_PDF_CONTENT[:len(MINIMAL_PDF_CONTENT)//2])
    print(f"Created: {truncated_path}")

if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(base_dir, "corrupt_test_files")
    
    generate_corrupted_files(output_dir)
    
    print(f"\n✅ All corrupted test files have been generated in the folder: {output_dir}")
    print("You can upload these to the Repair tool to test the different layers of repair!")
