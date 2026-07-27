with open('C:/Users/Kapil_MLAI/Downloads/test_sample.pdf', 'rb') as f:
    data = f.read()

with open('e:/AI-PROJECT-WORK/doc-intel/tmp/original_user_pdf.txt', 'w', encoding='utf-8') as f:
    f.write(data.decode('utf-8', errors='ignore'))

print("Saved original_user_pdf.txt")
