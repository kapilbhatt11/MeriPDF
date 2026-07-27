with open('C:/Users/Kapil_MLAI/Downloads/currupt/test_sample_corrupted.pdf', 'rb') as f:
    data = f.read()

with open('e:/AI-PROJECT-WORK/doc-intel/tmp/inspect_user_pdf.txt', 'w', encoding='utf-8') as f:
    f.write(data.decode('utf-8', errors='ignore'))

print("Saved inspect_user_pdf.txt")
