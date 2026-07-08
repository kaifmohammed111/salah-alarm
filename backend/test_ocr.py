import base64
import json
import sys
import urllib.request

if len(sys.argv) < 2:
    print("Usage: python test_ocr.py <path-to-image>")
    sys.exit(1)

image_path = sys.argv[1]

with open(image_path, "rb") as f:
    img_bytes = f.read()

b64 = base64.b64encode(img_bytes).decode("utf-8")

payload = json.dumps({"image_base64": b64}).encode("utf-8")

req = urllib.request.Request(
    "http://localhost:8000/api/ocr/timetable",
    data=payload,
    headers={"Content-Type": "application/json"},
    method="POST",
)

print("Sending to OCR endpoint, this may take 5-15 seconds...")
try:
    with urllib.request.urlopen(req, timeout=60) as resp:
        result = json.loads(resp.read().decode("utf-8"))
        print(json.dumps(result, indent=2))
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code)
    print(e.read().decode("utf-8"))
except Exception as e:
    print("Error:", e)
