import fitz

def verify_insertions():
    log = []
    def log_print(*args):
        log.append(" ".join(map(str, args)))
        print(*args)
        
    doc = fitz.open()
    # Create simple page (300 x 500)
    page = doc.new_page(width=300, height=500)
    page.set_rotation(90)
    log_print("Rotated page to 90. rect =", page.rect)
    
    # We will insert a textbox at visible box Rect(50, 50, 250, 150)
    box = fitz.Rect(50, 50, 250, 150)
    page.insert_textbox(box, "Hello Rotated World", fontsize=16, fontname="helv", color=(0,0,1))
    log_print("Inserted textbox at visible coordinates:", box)
    
    # We will insert a simple 1x1 pixel image at visible box Rect(50, 180, 150, 280)
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0,0,1,1))
    pix.set_rect(fitz.IRect(0,0,1,1), (255, 0, 0)) # Red pixel
    img_bytes = pix.tobytes("png")
    img_box = fitz.Rect(50, 180, 150, 280)
    page.insert_image(img_box, stream=img_bytes)
    log_print("Inserted image at visible coordinates:", img_box)
    
    doc.save("tmp/insertion_test_90.pdf")
    doc.close()
    
    # Re-open and verify
    doc_check = fitz.open("tmp/insertion_test_90.pdf")
    page_check = doc_check[0]
    log_print("Reopened rotated PDF. rect =", page_check.rect, "rotation =", page_check.rotation)
    
    # Let's extract text with coordinates
    text_info = page_check.get_text("blocks")
    log_print("Extracted text blocks:")
    for b in text_info:
        log_print("  rect =:", b[:4], "text =:", repr(b[4]))
        
    # Let's extract image info
    img_info = page_check.get_images()
    log_print("Images list in PDF structure:", img_info)
    img_rects = page_check.get_image_rects(img_info[0][0]) if img_info else []
    log_print("Image rects in visible coordinates:", img_rects)
    
    doc_check.close()
    open("tmp/verify_insertion_out.txt", "w", encoding="utf-8").write("\n".join(log))

if __name__ == "__main__":
    verify_insertions()
