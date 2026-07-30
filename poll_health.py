import requests
import time

url = "https://api.meripdf.com/health"
print("Polling api.meripdf.com/health ...")
start_time = time.time()
while time.time() - start_time < 300: # 5 minutes maximum
    try:
        r = requests.get(url)
        data = r.json()
        if "users_columns" in data or "database" in data:
            print(f"Success! Deployed API response detected:")
            print(data)
            break
        else:
            print(f"Still old version (status: ok) - {int(time.time() - start_time)}s elapsed")
    except Exception as e:
        print(f"Server is updating or offline: {e}")
    time.sleep(10)
