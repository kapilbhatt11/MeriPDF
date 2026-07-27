import requests
import json

url = "http://127.0.0.1:8000/pdf/organize"
pdf_path = "sample.pdf"

try:
    print(f"Opening {pdf_path}...")
    with open(pdf_path, "rb") as f:
        pdf_content = f.read()
    
    files = [("files", ("sample.pdf", pdf_content, "application/pdf"))]
    
    # We want page 1 (index 0) of file index 0, and one blank page
    config = [
        {"type": "page", "fileIndex": 0, "originalIndex": 0, "rotation": 0},
        {"type": "blank", "fileIndex": -1, "originalIndex": -1, "rotation": 0}
    ]
    
    data = {"config": json.dumps(config)}
    
    print("Sending POST request to /pdf/organize...")
    response = requests.post(url, files=files, data=data, timeout=10)
    print(f"Status Code: {response.status_code}")
    if response.status_code == 200:
        print(f"Success! Response bytes length: {len(response.content)}")
    else:
        print(f"Error detail: {response.text}")
except Exception as e:
    print(f"Exception during test: {e}")
