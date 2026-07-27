import fitz
import sys
from pdf2docx import Converter

text = "Hello world! This is a test."
doc = fitz.open()

# Make a simple text-based PDF
page = doc.new_page()
page.insert_text((50, 50), text, fontsize=12)

doc.save("test_text.pdf")
doc.close()

# Convert
cv = Converter("test_text.pdf")
cv.convert("test_text.docx")
cv.close()

print("Conversion done.")
