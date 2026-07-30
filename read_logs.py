import os

def read_logs():
    for name in ["db_test_stdout.log", "db_test_stderr.log"]:
        if os.path.exists(name):
            print(f"=== {name} ===")
            try:
                with open(name, "r", encoding="utf-16") as f:
                    print(f.read())
            except Exception as e:
                print(f"Error reading {name}: {e}")

if __name__ == "__main__":
    read_logs()
