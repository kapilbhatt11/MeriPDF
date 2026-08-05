import sys
import os
import json

# Add backend directory to sys.path
sys.path.append(os.path.abspath("beckend"))

from fastapi.testclient import TestClient
from app.main import app
import fitz

client = TestClient(app)

def test_merge_endpoint():
    # Create two dummy PDFs
    doc1 = fitz.open()
    page1 = doc1.new_page()
    page1.insert_text((50, 50), "Hello page 1")
    pdf_bytes1 = doc1.write()
    doc1.close()

    doc2 = fitz.open()
    page2 = doc2.new_page()
    page2.insert_text((50, 50), "Hello page 2")
    pdf_bytes2 = doc2.write()
    doc2.close()

    # Call the endpoint
    files = [
        ("files", ("doc1.pdf", pdf_bytes1, "application/pdf")),
        ("files", ("doc2.pdf", pdf_bytes2, "application/pdf")),
    ]
    rotations = [
        {"name": "doc1.pdf", "rotation": 90},
        {"name": "doc2.pdf", "rotation": 180},
    ]

    response = client.post(
        "/pdf/merge-pdf",
        files=files,
        data={"rotations": json.dumps(rotations)}
    )

    assert response.status_code == 200, f"Error: {response.text}"
    merged_bytes = response.content
    print("Response length:", len(merged_bytes))

    out_doc = fitz.open(stream=merged_bytes, filetype="pdf")
    print("Page 0 rotation:", out_doc[0].rotation)
    print("Page 1 rotation:", out_doc[1].rotation)
    assert out_doc[0].rotation == 90
    assert out_doc[1].rotation == 180
    print("✅ Endpoint test passed successfully!")

if __name__ == "__main__":
    test_merge_endpoint()
