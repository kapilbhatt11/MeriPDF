import fitz
import io

def test_merge():
    # Create two dummy PDFs with some text
    doc1 = fitz.open()
    page1 = doc1.new_page()
    page1.insert_text((50, 50), "Hello from doc 1")
    pdf_bytes1 = doc1.write()
    doc1.close()

    doc2 = fitz.open()
    page2 = doc2.new_page()
    page2.insert_text((50, 50), "Hello from doc 2")
    pdf_bytes2 = doc2.write()
    doc2.close()

    # Open them from bytes
    src1 = fitz.open(stream=pdf_bytes1, filetype="pdf")
    src2 = fitz.open(stream=pdf_bytes2, filetype="pdf")

    # Merge them
    out_doc = fitz.open()
    
    # Rotate first document's page by 90 degrees
    src1[0].set_rotation(90)
    
    out_doc.insert_pdf(src1)
    out_doc.insert_pdf(src2)
    
    # Verify rotations
    print(f"Page 0 rotation: {out_doc[0].rotation}") # should be 90
    print(f"Page 1 rotation: {out_doc[1].rotation}") # should be 0
    
    # Write to bytes/file
    out_bytes = out_doc.write()
    out_doc.close()
    src1.close()
    src2.close()
    
    print(f"Merged PDF size: {len(out_bytes)} bytes")

if __name__ == "__main__":
    test_merge()
