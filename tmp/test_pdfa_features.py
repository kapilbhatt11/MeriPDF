import fitz
import sys

def test_pdfa_conversion():
    try:
        # Create a basic PDF with searchable text for testing
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((50, 50), "Hello DocIntel PDF/A Verification", fontsize=20)
        
        # Test direct PDF/A saving flag
        # pdfa=True forces metadata and conforming structure
        temp_path = "test_pdfa_output.pdf"
        doc.save(temp_path, pdfa=True, deflate=True)
        doc.close()
        
        # Verify the saved document
        verify_doc = fitz.open(temp_path)
        print("SUCCESS: PDF/A save completed cleanly.")
        print("Metadata:", verify_doc.metadata)
        print("Number of pages:", len(verify_doc))
        print("Text of first page:", verify_doc[0].get_text().strip())
        verify_doc.close()
        
        import os
        if os.path.exists(temp_path):
            os.remove(temp_path)
            
    except Exception as e:
        print("ERROR: Direct PDF/A save failed:", e)

if __name__ == "__main__":
    test_pdfa_conversion()
