import requests
import os

BASE_URL = "http://localhost:8000/converters"
PDF_FILE = "test_text.pdf"

if not os.path.exists(PDF_FILE):
    # create a dummy
    with open(PDF_FILE, "wb") as f:
        f.write(b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF")

def test_endpoint(url, data=None):
    try:
        with open(PDF_FILE, "rb") as f:
            files = {"file": f}
            if data:
                resp = requests.post(url, files=files, data=data)
            else:
                resp = requests.post(url, files=files)
            
            if resp.status_code == 200:
                print(f"✅ SUCCESS: {url} -> Returned Status 200. File bytes: {len(resp.content)}")
                return True
            else:
                print(f"❌ ERROR: {url} -> Status {resp.status_code}: {resp.text}")
                return False
    except Exception as e:
        print(f"❌ CRITICAL EXCEPTION: {url} -> {e}")
        return False

print("Testing Converters...")
test_endpoint(f"{BASE_URL}/pdf-to-word")
test_endpoint(f"{BASE_URL}/pdf-to-ppt")
test_endpoint(f"{BASE_URL}/pdf-to-excel")
test_endpoint(f"{BASE_URL}/pdf-to-pdfa")
test_endpoint(f"{BASE_URL}/pdf-to-jpg", data={"mode": "pages"})
test_endpoint(f"{BASE_URL}/pdf-to-jpg", data={"mode": "images"})

print("Done.")
