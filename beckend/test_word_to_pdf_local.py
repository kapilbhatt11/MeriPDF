import requests
import os
from docx import Document

# 1. Create a dummy DOCX file
doc = Document()
doc.add_heading('DocIntel Test', 0)
doc.add_paragraph('This is a test document for Word to PDF conversion.')
doc.save('test_sample.docx')

# 2. Test the endpoint
URL = "http://localhost:8000/converters/word-to-pdf"

try:
    with open('test_sample.docx', 'rb') as f:
        files = {'file': ('test_sample.docx', f, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')}
        print(f"Sending request to {URL}...")
        response = requests.post(URL, files=files)
        
        if response.status_code == 200:
            with open('test_result.pdf', 'wb') as out:
                out.write(response.content)
            print("✅ SUCCESS: Word to PDF converted! saved as test_result.pdf")
        else:
            print(f"❌ FAILED: Status {response.status_code}")
            print(f"Response: {response.text}")
finally:
    # Cleanup
    if os.path.exists('test_sample.docx'):
        os.remove('test_sample.docx')
