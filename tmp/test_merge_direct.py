import sys
import os
import json
import asyncio
import io

# Add backend directory to sys.path
sys.path.append(os.path.abspath("beckend"))

from fastapi import UploadFile
from app.routes.pdf_tools import merge_pdf
import fitz

async def test_merge_direct():
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

    # Wrap them in UploadFile objects
    file1 = UploadFile(file=io.BytesIO(pdf_bytes1), filename="doc1.pdf")
    file2 = UploadFile(file=io.BytesIO(pdf_bytes2), filename="doc2.pdf")

    rotations = [
        {"name": "doc1.pdf", "rotation": 90},
        {"name": "doc2.pdf", "rotation": 180},
    ]

    # Call endpoint directly (async)
    response = await merge_pdf(
        files=[file1, file2],
        rotations=json.dumps(rotations)
    )

    # The response is a FileResponse. Let's verify output file exists
    assert os.path.exists(response.path)
    print("Output path:", response.path)

    # Read output and verify page rotation
    out_doc = fitz.open(response.path)
    print("Page 0 rotation:", out_doc[0].rotation)
    print("Page 1 rotation:", out_doc[1].rotation)
    assert out_doc[0].rotation == 90
    assert out_doc[1].rotation == 180

    out_doc.close()
    print("✅ Direct function test passed successfully!")

if __name__ == "__main__":
    asyncio.run(test_merge_direct())
