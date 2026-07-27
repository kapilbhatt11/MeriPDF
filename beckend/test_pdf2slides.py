from pdf2slides import Converter

def test():
    try:
        converter = Converter()
        converter.convert("test_text.pdf", "test_out.pptx")
        print("Success")
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    test()
