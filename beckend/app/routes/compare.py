import io
import base64
import uuid
import re
import difflib
from fastapi import APIRouter, UploadFile, File, HTTPException
from PIL import Image, ImageChops, ImageEnhance
import fitz

router = APIRouter(prefix="/pdf", tags=["pdf_comparison"])

def pil_to_base64(img: Image.Image) -> str:
    buffered = io.BytesIO()
    # JPEG with quality=85 gives high resolution at small file size (~45KB per page image)
    img.save(buffered, format="JPEG", quality=85)
    img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
    return f"data:image/jpeg;base64,{img_str}"

@router.post("/compare")
async def compare_pdfs(
    file_a: UploadFile = File(...),
    file_b: UploadFile = File(...)
):
    try:
        # Read files
        bytes_a = await file_a.read()
        bytes_b = await file_b.read()
        
        doc_a = fitz.open(stream=bytes_a, filetype="pdf")
        doc_b = fitz.open(stream=bytes_b, filetype="pdf")
        
        len_a = len(doc_a)
        len_b = len(doc_b)
        max_pages = max(len_a, len_b)
        
        pages_result = []
        total_changes_count = 0
        modified_pages_count = 0
        
        for i in range(max_pages):
            page_num = i + 1
            has_changes = False
            
            # Setup indicators if page exists in both
            has_a = i < len_a
            has_b = i < len_b
            
            image_a_b64 = ""
            image_b_b64 = ""
            image_diff_b64 = ""
            text_diffs = []
            diff_lines_count = 0
            
            # 1. Visual Comparison & Render
            img_a = None
            img_b = None
            
            if has_a:
                page_a = doc_a[i]
                pix_a = page_a.get_pixmap(dpi=110) # 110 DPI guarantees excellent readability while staying small
                img_a = Image.frombytes("RGB", [pix_a.width, pix_a.height], pix_a.samples)
                image_a_b64 = pil_to_base64(img_a)
                
            if has_b:
                page_b = doc_b[i]
                pix_b = page_b.get_pixmap(dpi=110)
                img_b = Image.frombytes("RGB", [pix_b.width, pix_b.height], pix_b.samples)
                image_b_b64 = pil_to_base64(img_b)
            
            # Compute visual diff
            if has_a and has_b and img_a and img_b:
                # Ensure they have identical dimension sizes (pad/resize if mismatched)
                w = max(img_a.width, img_b.width)
                h = max(img_a.height, img_b.height)
                
                if img_a.size != (w, h):
                    img_a = img_a.resize((w, h), Image.Resampling.LANCZOS)
                    # refresh base64 with aligned size
                    image_a_b64 = pil_to_base64(img_a)
                if img_b.size != (w, h):
                    img_b = img_b.resize((w, h), Image.Resampling.LANCZOS)
                    image_b_b64 = pil_to_base64(img_b)
                
                # Check pixel diff
                diff = ImageChops.difference(img_a, img_b)
                diff_gray = diff.convert("L")
                
                # Threshold pixels: any change > 15 counts as diff
                threshold = 15
                mask = diff_gray.point(lambda x: 255 if x > threshold else 0)
                
                # Check if mask has any white pixels (value 255)
                extrema = mask.getextrema()
                if extrema and extrema[1] == 255:
                    has_changes = True
                    # Create highlighted image
                    background = img_a.convert("L").convert("RGB")
                    enhancer = ImageEnhance.Brightness(background)
                    background = enhancer.enhance(0.85) # Slightly darkened
                    
                    red_overlay = Image.new("RGB", img_a.size, (239, 68, 68)) # Tailwinds red-500
                    
                    highlighted_diff = Image.composite(red_overlay, background, mask)
                    image_diff_b64 = pil_to_base64(highlighted_diff)
                else:
                    # No pixel changes found, diff is just original copy
                    image_diff_b64 = image_a_b64
                    
            elif has_a:  # Page only in PDF A
                has_changes = True
                image_diff_b64 = image_a_b64
            elif has_b:  # Page only in PDF B
                has_changes = True
                image_diff_b64 = image_b_b64
                
            # 2. Textual Comparison
            text_a = page_a.get_text("text") if has_a else ""
            text_b = page_b.get_text("text") if has_b else ""
            
            if text_a or text_b:
                tokens_a = re.split(r'(\s+)', text_a)
                tokens_b = re.split(r'(\s+)', text_b)
                
                tokens_a = [t for t in tokens_a if t]
                tokens_b = [t for t in tokens_b if t]
                
                s = difflib.SequenceMatcher(None, tokens_a, tokens_b)
                
                for tag, i1, i2, j1, j2 in s.get_opcodes():
                    if tag == 'equal':
                        val = "".join(tokens_a[i1:i2])
                        text_diffs.append({"type": "equal", "text": val})
                    elif tag == 'delete':
                        val = "".join(tokens_a[i1:i2])
                        text_diffs.append({"type": "deleted", "text": val})
                        diff_lines_count += 1
                        has_changes = True
                    elif tag == 'insert':
                        val = "".join(tokens_b[j1:j2])
                        text_diffs.append({"type": "added", "text": val})
                        diff_lines_count += 1
                        has_changes = True
                    elif tag == 'replace':
                        val_del = "".join(tokens_a[i1:i2])
                        val_add = "".join(tokens_b[j1:j2])
                        text_diffs.append({"type": "deleted", "text": val_del})
                        text_diffs.append({"type": "added", "text": val_add})
                        diff_lines_count += 2
                        has_changes = True
            
            if has_changes:
                modified_pages_count += 1
                total_changes_count += max(1, diff_lines_count)
            
            pages_result.append({
                "pageNumber": page_num,
                "hasChanges": has_changes,
                "onlyInA": has_a and not has_b,
                "onlyInB": has_b and not has_a,
                "imageA": image_a_b64,
                "imageB": image_b_b64,
                "imageDiff": image_diff_b64,
                "textDiff": text_diffs,
                "changesCount": max(1, diff_lines_count) if has_changes else 0
            })
            
        doc_a.close()
        doc_b.close()
        
        return {
            "status": "success",
            "totalPagesA": len_a,
            "totalPagesB": len_b,
            "modifiedPagesCount": modified_pages_count,
            "totalChangesCount": total_changes_count,
            "pages": pages_result
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to compare PDF documents: {e}")
