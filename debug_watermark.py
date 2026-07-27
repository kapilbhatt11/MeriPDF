import fitz
import io

def debug_watermark_logic():
    print(f"PyMuPDF version: {fitz.version}")
    
    # Simulate parameters
    watermark_text = "CONFIDENTIAL"
    font_size = 60
    font_name = "helv"
    text_color = "#f59e0b"
    transparency = 0.4
    rotation = -45
    mosaic = True
    image_gap = 0.5
    
    # hex_to_rgb simulation
    def hex_to_rgb(hex_str: str):
        hex_str = hex_str.lstrip('#')
        return tuple(int(hex_str[i:i+2], 16) / 255.0 for i in (0, 2, 4))
    
    rgb_color = hex_to_rgb(text_color)
    
    # Create doc
    doc = fitz.open()
    page = doc.new_page()
    rect = page.rect
    
    try:
        rot_matrix = fitz.Matrix().prerotate(rotation)
        print(f"Matrix: {rot_matrix}")
        
        if mosaic:
            step_x = max(150, int(300 * (1 + image_gap)))
            step_y = max(150, int(300 * (1 + image_gap)))
            
            for x in range(0, int(rect.width), step_x):
                for y in range(0, int(rect.height), step_y):
                    pt = fitz.Point(x, y)
                    page.insert_text(
                        pt, watermark_text,
                        fontsize=font_size, fontname=font_name,
                        color=rgb_color, fill_opacity=transparency,
                        morph=(pt, rot_matrix),
                        overlay=True
                    )
        
        print("✅ Text Watermark Logic Executed Successfully")
        
    except Exception as e:
        print(f"❌ Error in Logic: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    debug_watermark_logic()
