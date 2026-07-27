import os
import random

def corrupt_pdf(input_path, output_path, level):
    # Check if file exists
    if not os.path.exists(input_path):
        print(f"❌ ERROR: File nahi mili! \nPath: {input_path}")
        print("Kripaya PDF ko sahi location pe rakho aur path check karo.")
        return
    
    with open(input_path, 'rb') as f:
        data = bytearray(f.read())
    
    size = len(data)
    
    if level == 'low':
        num_changes = int(size * 0.005)   # ~0.5%
        print("Low corruption: ~0.5% bytes badle")
    elif level == 'medium':
        num_changes = int(size * 0.05)    # ~5%
        print("Medium corruption: ~5% bytes badle")
    else:  # high
        num_changes = int(size * 0.20)    # ~20%
        data = data[:int(size * 0.95)]    # file thoda chhota bhi kar dete hain
        print("High corruption: ~20% bytes badle + file truncate kiya")
    
    # Random bytes corrupt
    indices = random.sample(range(len(data)), min(num_changes, len(data)))
    for idx in indices:
        data[idx] = random.randint(0, 255)
    
    with open(output_path, 'wb') as f:
        f.write(data)
    
    print(f"✅ {output_path} successfully ban gaya!")

# ================== MAIN ==================
random.seed(42)   # har baar same result milega

# 🔥 Tumhara exact path yahan hai
original_file = r"C:\Users\Kapil_MLAI\Downloads\test docintel\Nai Sawari.pdf"

corrupt_pdf(original_file, "nai_sawari_low_corrupt.pdf", "low")
corrupt_pdf(original_file, "nai_sawari_medium_corrupt.pdf", "medium")
corrupt_pdf(original_file, "nai_sawari_high_corrupt.pdf", "high")

print("\n🎉 Teeno corrupted files ban gaye!")
print("Ab inko apne DocIntel project mein test kar sakte ho.")