import requests
import sys

BASE_URL = "http://localhost:8000/converters"
TEST_PDF = "sample.pdf"

def test_endpoint(endpoint, output_filename):
    url = f"{BASE_URL}/{endpoint}"
    try:
        with open(TEST_PDF, "rb") as f:
            files = {"file": (TEST_PDF, f, "application/pdf")}
            print(f"Testing {url}...")
            response = requests.post(url, files=files)
            
            if response.status_code == 200:
                with open(output_filename, "wb") as out_f:
                    out_f.write(response.content)
                print(f"✅ Success: {endpoint} -> Saved to {output_filename}")
            else:
                print(f"❌ Failed: {endpoint}")
                print(f"   Status Code: {response.status_code}")
                print(f"   Response: {response.text}")
    except Exception as e:
        print(f"❌ Error testing {endpoint}: {e}")

if __name__ == "__main__":
    print("starting conversion tests...\n")
    test_endpoint("pdf-to-jpg", "test_out_jpg.zip")
    test_endpoint("pdf-to-word", "test_out_word.docx")
    test_endpoint("pdf-to-ppt", "test_out_ppt.pptx")
    test_endpoint("pdf-to-excel", "test_out_excel.xlsx")
    test_endpoint("pdf-to-pdfa", "test_out_pdfa.pdf")
    print("\ncompleted all tests.")
