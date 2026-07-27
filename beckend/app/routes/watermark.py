from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
import urllib.parse
import fitz  # PyMuPDF
import io
import math
from typing import Optional

router = APIRouter(prefix="/watermark", tags=["Watermark PDF"])

def hex_to_rgb(hex_str: str):
    try:
        hex_str = hex_str.lstrip('#')
        if len(hex_str) == 3:
            hex_str = "".join([c*2 for c in hex_str])
        return tuple(int(hex_str[i:i+2], 16) / 255.0 for i in (0, 2, 4))
    except Exception:
        return (0.7, 0.7, 0.7) # Fallback to gray

@router.post("/add")
async def add_watermark(
    file: UploadFile = File(...),
    watermark_type: str = Form("text"), # "text" or "image"
    watermark_text: Optional[str] = Form(None),
    image_file: Optional[UploadFile] = File(None),
    text_color: str = Form("#000000"),
    font_name: str = Form("helv"),
    font_size: int = Form(50),
    transparency: float = Form(0.5), # 0.0 to 1.0 (0=invisible, 1=opaque)
    rotation: int = Form(45),
    position: str = Form("center"), # not used if mosaic is true
    mosaic: bool = Form(False),
    page_range: str = Form("all"), # "all" or e.g. "1-5"
    layer: str = Form("over"), # "over" or "below"
    image_size: int = Form(200), # Size in points (default 200)
    image_gap: float = Form(0.5), # Gap as fraction of image size (0.5 = 50% gap)
    pos_x: float = Form(0.5),
    pos_y: float = Form(0.5)
):
    """Advanced watermark tool supporting text/image, rotation, transparency, positioning and tiling."""
    
    try:
        print(f"Adding {watermark_type} watermark to {file.filename} (Pages: {page_range})")
        pdf_bytes = await file.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        total_pages = len(doc)
        
        # Color & Opacity
        rgb_color = hex_to_rgb(text_color)
        is_overlay = (layer == "over")
        
        # Parse Page Range
        pages_to_apply = []
        if page_range == "all":
            pages_to_apply = list(range(total_pages))
        else:
            try:
                parts = page_range.split('-')
                start = max(1, int(parts[0])) - 1
                end = min(total_pages, int(parts[1])) if len(parts) > 1 else start + 1
                pages_to_apply = list(range(start, end))
            except:
                pages_to_apply = list(range(total_pages))

        wm_image_bytes = None
        img_w, img_h = 0, 0
        if watermark_type == "image" and image_file:
            orig_bytes = await image_file.read()
            try:
                from PIL import Image
                img = Image.open(io.BytesIO(orig_bytes)).convert("RGBA")
                if transparency < 1.0:
                    alpha = img.split()[3]
                    alpha = alpha.point(lambda p: p * transparency)
                    img.putalpha(alpha)
                if rotation != 0:
                    img = img.rotate(-rotation, expand=True, resample=Image.BICUBIC)
                
                out_buf = io.BytesIO()
                img.save(out_buf, format="PNG")
                wm_image_bytes = out_buf.getvalue()
                
                pix = fitz.Pixmap(wm_image_bytes)
                img_w, img_h = pix.width, pix.height
                pix = None
            except Exception as e:
                print(f"Error processing watermark image with PIL: {e}")
                wm_image_bytes = orig_bytes
                img_w, img_h = 200, 200
        try:
            for p_idx in pages_to_apply:
                page = doc[p_idx]
                rect = page.rect
                
                # Adjust rotation: UI CSS rotate(45deg) is clockwise, PyMuPDF Matrix(45) relies on counter-clockwise.
                # So we negate the rotation sent by UI.
                actual_rotation = -rotation 
                
                if watermark_type == "text" and watermark_text:
                    # Text Watermark Logic
                    rot_matrix = fitz.Matrix(actual_rotation)
                    text_length = fitz.get_text_length(watermark_text, fontname=font_name, fontsize=font_size)

                    if mosaic:
                        # Improved text mosaic density using image_gap
                        step_x = max(150, int(300 * (1 + image_gap)))
                        step_y = max(150, int(300 * (1 + image_gap)))
                        
                        for x in range(0, int(rect.width), step_x):
                            for y in range(0, int(rect.height), step_y):
                                center_x = x + (step_x / 2)
                                center_y = y + (step_y / 2)
                                pt_x = center_x - (text_length / 2)
                                pt_y = center_y + (font_size * 0.3)
                                bottom_left_pt = fitz.Point(pt_x, pt_y)
                                morph_center = fitz.Point(center_x, center_y)

                                page.insert_text(
                                    bottom_left_pt, watermark_text,
                                    fontsize=font_size, fontname=font_name,
                                    color=rgb_color, fill_opacity=transparency,
                                    morph=(morph_center, rot_matrix),
                                    overlay=is_overlay
                                )
                    else:
                        # Account for pos_x and pos_y relative placements
                        center_x = rect.width * pos_x
                        center_y = rect.height * pos_y
                        
                        pt_x = center_x - (text_length / 2)
                        pt_y = center_y + (font_size * 0.3)
                        
                        bottom_left_pt = fitz.Point(pt_x, pt_y)
                        morph_center = fitz.Point(center_x, center_y)

                        page.insert_text(
                            bottom_left_pt, watermark_text,
                            fontsize=font_size, fontname=font_name,
                            color=rgb_color, fill_opacity=transparency,
                            morph=(morph_center, rot_matrix),
                            overlay=is_overlay
                        )

                elif watermark_type == "image" and wm_image_bytes:
                    # Logic using insert_image without passing opacity/rotate (PIL handles it)
                    aspect = img_h / float(img_w) if img_w > 0 else 1.0
                    w = image_size
                    h = image_size * aspect

                    if mosaic:
                        step_x = max(100, int(w * (1 + image_gap)))
                        step_y = max(100, int(h * (1 + image_gap)))

                        for x in range(0, int(rect.width), step_x):
                            for y in range(0, int(rect.height), step_y):
                                target = fitz.Rect(x, y, x + w, y + h)
                                page.insert_image(
                                    target, 
                                    stream=wm_image_bytes,
                                    overlay=is_overlay
                                )
                    else:
                        center_x = rect.width * pos_x
                        center_y = rect.height * pos_y
                        target = fitz.Rect(
                            center_x - w / 2,
                            center_y - h / 2,
                            center_x + w / 2,
                            center_y + h / 2
                        )
                        page.insert_image(
                            target, 
                            stream=wm_image_bytes,
                            overlay=is_overlay
                        )
        finally:
            pass # No wm_doc to close anymore

        output_buffer = io.BytesIO()
        # garbage=3 clears unused objects, deflate=True compresses streams. 
        # This prevents the corrupted PDF text view issues.
        doc.save(output_buffer, garbage=3, deflate=True)
        output_buffer.seek(0)
        
        safe_filename = urllib.parse.quote(file.filename)
        return StreamingResponse(
            output_buffer,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename*=UTF-8\'\'Watermarked_{safe_filename}',
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to add watermark: {str(e)}")
