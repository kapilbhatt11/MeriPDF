import fitz
import os
import requests
import io

def create_sample_pdf(filename="sample.pdf"):
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 50), "Hello DocIntel - Sample File", color=(0, 0, 1))
    doc.save(filename)
    doc.close()
    print(f"Created {filename}")

def create_sample_image(filename="logo.png"):
    # Create a small red square image
    doc = fitz.open()
    page = doc.new_page(width=100, height=100)
    page.draw_rect(fitz.Rect(0, 0, 100, 100), color=(1, 0, 0), fill=(1, 0, 0))
    # Render page to image
    pix = page.get_pixmap()
    pix.save(filename)
    doc.close()
    print(f"Created {filename}")

def test_watermark_api():
    url = "http://127.0.0.1:8000/watermark/add"
    
    # Test Image Watermark
    print("\n--- Testing Image Watermark ---")
    with open("sample.pdf", "rb") as f, open("logo.png", "rb") as img:
        files = {
            "file": ("sample.pdf", f, "application/pdf"),
            "image_file": ("logo.png", img, "image/png")
        }
        data = {
            "watermark_type": "image",
            "transparency": "0.5",
            "rotation": "45",
            "mosaic": "true",
            "layer": "over"
        }
        try:
            res = requests.post(url, files=files, data=data)
            if res.status_code == 200:
                with open("result_image_wm.pdf", "wb") as out:
                    out.write(res.content)
                print("✅ Image Watermark SUCCESS! Saved to result_image_wm.pdf")
            else:
                print(f"❌ Image Watermark FAILED: {res.status_code}")
                print(res.text)
        except Exception as e:
            print(f"❌ API Call Error: {str(e)}")

    # Test Text Watermark
    print("\n--- Testing Text Watermark ---")
    with open("sample.pdf", "rb") as f:
        files = {
            "file": ("sample.pdf", f, "application/pdf")
        }
        data = {
            "watermark_type": "text",
            "watermark_text": "CONFIDENTIAL",
            "text_color": "#FF0000",
            "transparency": "0.4",
            "rotation": "-30",
            "mosaic": "false"
        }
        try:
            res = requests.post(url, files=files, data=data)
            if res.status_code == 200:
                with open("result_text_wm.pdf", "wb") as out:
                    out.write(res.content)
                print("✅ Text Watermark SUCCESS! Saved to result_text_wm.pdf")
            else:
                print(f"❌ Text Watermark FAILED: {res.status_code}")
                print(res.text)
        except Exception as e:
            print(f"❌ API Call Error: {str(e)}")

if __name__ == "__main__":
    create_sample_pdf()
    create_sample_image()
    test_watermark_api()
