import fitz
import io

def test_rotation():
    print(f"PyMuPDF version: {fitz.version}")
    
    # Create a simple PDF
    doc = fitz.open()
    page = doc.new_page()
    
    # Create a dummy image (red square)
    img_doc = fitz.open()
    img_page = img_doc.new_page(width=100, height=200) # Vertical image
    img_page.draw_rect(img_page.rect, color=(1,0,0), fill=(1,0,0))
    
    # Try show_pdf_page with 45 degree rotation
    target = fitz.Rect(100, 100, 300, 300) # Square target
    try:
        page.show_pdf_page(target, img_doc, 0, rotate=45)
        print("✅ show_pdf_page with rotate=45 executed successfully")
    except Exception as e:
        print(f"❌ show_pdf_page error: {e}")
        
    doc.save("test_rotation.pdf")
    doc.close()
    img_doc.close()
    print("Test PDF saved to test_rotation.pdf")

if __name__ == "__main__":
    test_rotation()
