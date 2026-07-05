"""Backend API tests for SalahAlarm prayer timetable OCR service.

Tests are SEQUENTIAL (see -p no:xdist enforced by lack of -n) because the
Emergent LLM key rate-limits concurrent requests.
"""
import os
import re
import base64
import io
import pytest
import requests
from PIL import Image

from gen_timetable_image import make_timetable_image_b64

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

TIME_RE = re.compile(r"^\d{2}:\d{2}$")


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Health check ----------
class TestHealth:
    def test_root(self, api):
        r = api.get(f"{BASE_URL}/api/", timeout=30)
        assert r.status_code == 200, r.text
        assert "message" in r.json()


# ---------- OCR happy path ----------
class TestOcrTimetable:
    def test_ocr_valid_timetable(self, api):
        img_b64 = make_timetable_image_b64()
        r = api.post(
            f"{BASE_URL}/api/ocr/timetable",
            json={"image_base64": img_b64},
            timeout=180,
        )
        assert r.status_code == 200, f"status={r.status_code} body={r.text[:500]}"
        data = r.json()
        assert "rows" in data and isinstance(data["rows"], list)
        assert len(data["rows"]) >= 1, "No rows extracted"

        row0 = data["rows"][0]
        # Required keys
        for key in ("date", "fajr", "sunrise", "zuhr", "asr", "maghrib", "isha"):
            assert key in row0, f"Missing key {key} in row: {row0}"

        # HH:MM 24h validation on prayer times
        for pk in ("fajr", "zuhr", "asr", "maghrib", "isha"):
            obj = row0[pk]
            assert isinstance(obj, dict), f"{pk} not object: {obj}"
            assert "start" in obj and "jamaat" in obj
            for tval in (obj["start"], obj["jamaat"]):
                assert tval == "" or TIME_RE.match(tval), f"{pk} bad time '{tval}'"

        # sunrise scalar
        s = row0["sunrise"]
        assert s == "" or TIME_RE.match(s), f"bad sunrise '{s}'"


# ---------- OCR error handling ----------
class TestOcrErrors:
    def test_missing_body(self, api):
        r = api.post(f"{BASE_URL}/api/ocr/timetable", json={}, timeout=30)
        # Pydantic validation -> 422
        assert r.status_code in (400, 422), r.text

    def test_non_table_image(self, api):
        # Solid gradient image with random noise - has features but no table
        img = Image.new("RGB", (200, 200), "white")
        px = img.load()
        for x in range(200):
            for y in range(200):
                px[x, y] = ((x * 3) % 255, (y * 5) % 255, ((x + y) * 2) % 255)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=80)
        b64 = base64.b64encode(buf.getvalue()).decode()

        r = api.post(
            f"{BASE_URL}/api/ocr/timetable",
            json={"image_base64": b64},
            timeout=180,
        )
        # Should NOT crash with 500 (except LLM key issue). Accept 200 (LLM
        # returned empty rows), 422 (parse failed), or 502 (LLM error).
        assert r.status_code in (200, 400, 422, 502), (
            f"Unexpected crash: {r.status_code} {r.text[:400]}"
        )
        if r.status_code == 200:
            data = r.json()
            assert isinstance(data.get("rows", []), list)
        else:
            # Must have detail (graceful)
            assert "detail" in r.json()
