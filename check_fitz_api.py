import fitz
import inspect
import traceback

print("PyMuPDF version:", fitz.version[0])
print("fitz module attrs with 'cs':", [a for a in dir(fitz) if 'cs' in a.lower() or 'rgb' in a.lower() or 'color' in a.lower()])

print("\n=== insert_image params ===")
sig = inspect.signature(fitz.Page.insert_image)
for name, param in sig.parameters.items():
    print(f"  {name}: default={repr(param.default)}")

print("\n=== insert_text params ===")
sig2 = inspect.signature(fitz.Page.insert_text)
for name, param in sig2.parameters.items():
    print(f"  {name}: default={repr(param.default)}")

# Test 1: Text watermark
print("\n=== TEST 1: Text watermark (morph + fill_opacity) ===")
try:
    doc = fitz.open()
    page = doc.new_page()
    rect = page.rect
    rot_matrix = fitz.Matrix().prerotate(-45)
    pt = fitz.Point(rect.width/2, rect.height/2)
    r = page.insert_text(
        pt, "CONFIDENTIAL",
        fontsize=60, fontname="helv",
        color=(1, 0, 0),
        fill_opacity=0.4,
        morph=(pt, rot_matrix),
        overlay=True
    )
    print("  insert_text result:", r, " -> SUCCESS")
except Exception as e:
    print("  FAILED:", e)
    traceback.print_exc()

# Test 2: Image watermark with 'opacity' param
print("\n=== TEST 2: insert_image with opacity= ===")
try:
    doc2 = fitz.open()
    page2 = doc2.new_page()
    # Make a simple pixmap
    pix = fitz.Pixmap(fitz.Colorspace(fitz.CS_RGB), fitz.IRect(0, 0, 50, 50))
    pix.set_rect(fitz.IRect(0, 0, 50, 50), (255, 0, 0))
    img_bytes = pix.tobytes("png")
    target = fitz.Rect(100, 100, 300, 300)
    r2 = page2.insert_image(target, stream=img_bytes, rotate=45, opacity=0.5, overlay=True)
    print("  insert_image (opacity=) result:", r2, " -> SUCCESS")
except Exception as e:
    print("  FAILED with opacity=:", e)
    traceback.print_exc()

# Test 3: Image watermark without opacity param
print("\n=== TEST 3: insert_image without opacity param ===")
try:
    doc3 = fitz.open()
    page3 = doc3.new_page()
    pix = fitz.Pixmap(fitz.Colorspace(fitz.CS_RGB), fitz.IRect(0, 0, 50, 50))
    pix.set_rect(fitz.IRect(0, 0, 50, 50), (255, 0, 0))
    img_bytes = pix.tobytes("png")
    target = fitz.Rect(100, 100, 300, 300)
    r3 = page3.insert_image(target, stream=img_bytes, rotate=45, overlay=True)
    print("  insert_image (no opacity) result:", r3, " -> SUCCESS")
except Exception as e:
    print("  FAILED:", e)
    traceback.print_exc()

print("\n=== DONE ===")
