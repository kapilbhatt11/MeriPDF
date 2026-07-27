import fitz

def verify_rotated_insertion():
    log = []
    def log_print(*args):
        log.append(" ".join(map(str, args)))
        print(*args)
        
    log_print(f"PyMuPDF version: {fitz.version}")
    
    # Create doc
    doc = fitz.open()
    page = doc.new_page(width=300, height=500) # Portrait page
    log_print("Created unrotated page. page.rect =:", page.rect, "rotation =:", page.rotation)
    
    # Rotate page by 90 degrees
    page.set_rotation(90)
    log_print("Rotated page to 90 degrees. page.rect =:", page.rect, "rotation =:", page.rotation)
    
    # Visible box coordinate: top-left (50, 50), width=100, height=200
    visible_rect = fitz.Rect(50, 50, 150, 270)
    page.draw_rect(visible_rect, color=(1, 0, 0), fill=(1, 0, 0))
    log_print("Drew rect at:", visible_rect)
    
    # Try drawing a circle at visible center (100, 100)
    page.draw_circle(fitz.Point(100, 100), 20, color=(0, 1, 0), fill=(0, 1, 0))
    log_print("Drew circle at Point(100, 100)")
    
    doc.save("tmp/rotated_test_90.pdf")
    doc.close()
    
    # Let's open and inspect
    doc_check = fitz.open("tmp/rotated_test_90.pdf")
    page_check = doc_check[0]
    log_print("Re-opened page.rect =:", page_check.rect, "rotation =:", page_check.rotation)
    
    drawings = page_check.get_drawings()
    log_print("Drawings in saved PDF:")
    for d in drawings:
        log_print("  type =:", d.get("type"), "rect =:", d.get("rect"))
        
    doc_check.close()
    
    open("tmp/verify_out.txt", "w", encoding="utf-8").write("\n".join(log))

if __name__ == "__main__":
    verify_rotated_insertion()
