"""Generate a synthetic prayer timetable JPEG (base64) for OCR testing."""
from PIL import Image, ImageDraw, ImageFont
import base64
import io


def make_timetable_image_b64() -> str:
    W, H = 1000, 420
    img = Image.new("RGB", (W, H), "white")
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 20)
        font_b = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
    except Exception:
        font = ImageFont.load_default()
        font_b = font

    draw.text((300, 10), "Prayer Timetable - July 2025", fill="black", font=font_b)

    headers = ["Day", "Date", "Fajr", "Sunrise", "Zuhr", "Asr", "Maghrib", "Isha"]
    rows = [
        ["Tue", "1", "03:45", "05:12", "13:10", "18:25", "21:20", "22:45"],
        ["Wed", "2", "03:46", "05:13", "13:10", "18:24", "21:19", "22:44"],
        ["Thu", "3", "03:47", "05:14", "13:11", "18:24", "21:18", "22:43"],
    ]

    col_w = 120
    x0, y0 = 20, 60
    row_h = 60

    # header
    for i, h in enumerate(headers):
        x = x0 + i * col_w
        draw.rectangle([x, y0, x + col_w, y0 + row_h], outline="black", width=2)
        draw.text((x + 10, y0 + 18), h, fill="black", font=font_b)

    for r, row in enumerate(rows):
        y = y0 + (r + 1) * row_h
        for i, cell in enumerate(row):
            x = x0 + i * col_w
            draw.rectangle([x, y, x + col_w, y + row_h], outline="black", width=1)
            draw.text((x + 10, y + 18), cell, fill="black", font=font)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return base64.b64encode(buf.getvalue()).decode()


if __name__ == "__main__":
    print(make_timetable_image_b64()[:80])
