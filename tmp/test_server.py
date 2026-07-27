import urllib.request
import json

def test_health():
    try:
        url = "http://127.0.0.1:8000/health"
        print(f"Sending GET request to {url}...")
        with urllib.request.urlopen(url, timeout=5) as response:
            status = response.getcode()
            body = response.read().decode('utf-8')
            print(f"Response status: {status}")
            print(f"Response body: {body}")
            if status == 200:
                print("Backend server is fully online and healthy!")
            else:
                print("Backend returned non-200 status.")
    except Exception as e:
        print("Backend server check failed with exception:")
        print(e)

if __name__ == "__main__":
    test_health()
