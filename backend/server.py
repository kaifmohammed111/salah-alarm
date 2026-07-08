from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import json
import logging
import re
import uuid
from pathlib import Path
from pydantic import BaseModel, Field
from typing import Optional, List

import base64 as b64lib
import google.generativeai as genai

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
# Flash models stay on Gemini's free tier. Override via env var if Google
# renames/deprecates this model — check available models at aistudio.google.com.
GEMINI_MODEL = os.environ.get('GEMINI_MODEL', 'gemini-2.5-flash')

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ---------- Models ----------
class OcrRequest(BaseModel):
    image_base64: str = Field(..., description="Base64 encoded timetable image (no data URI prefix)")


class OcrResponse(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    month: Optional[str] = None
    year: Optional[str] = None
    rows: List[dict] = []
    raw: Optional[str] = None


OCR_SYSTEM = """You are an expert OCR engine specialised in reading monthly Islamic mosque prayer timetables.
The image is a table with one row per day of the month. Columns usually include: Day, Date, Hijri date,
Fajr, Sunrise, Zuhr (Dhuhr), Asr, Maghrib, Isha. Each prayer may have TWO sub-columns: a Start (Begins/Adhan) time
and a Jamaat (Congregation/Iqamah) time. Sunrise has only one time.

Intelligently identify columns even if headers are abbreviated, the image is blurry, slightly rotated, or fonts vary.
Convert every time to strict 24-hour "HH:MM" format. If a prayer's afternoon/evening (Zuhr/Asr/Maghrib/Isha) is
clearly PM, add 12 hours. Fajr and Sunrise are AM. If a value is unreadable use empty string "".

Return ONLY valid minified JSON, no markdown, no commentary, with this exact schema:
{"month":"July","year":"2025","rows":[
  {"day":"Sat","date":"1","hijri":"5 Muharram",
   "fajr":{"start":"HH:MM","jamaat":"HH:MM"},
   "sunrise":"HH:MM",
   "zuhr":{"start":"HH:MM","jamaat":"HH:MM"},
   "asr":{"start":"HH:MM","jamaat":"HH:MM"},
   "maghrib":{"start":"HH:MM","jamaat":"HH:MM"},
   "isha":{"start":"HH:MM","jamaat":"HH:MM"}}
]}
"date" must be the day-of-month number as a string (e.g. "26"). If a sub-column is missing, put the same time in both start and jamaat."""


def _extract_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        text = text[start:end + 1]
    return json.loads(text)


def _run_gemini(prompt_text: str, mime_type: str, raw_bytes: bytes) -> str:
    model = genai.GenerativeModel(
        model_name=GEMINI_MODEL,
        system_instruction=OCR_SYSTEM,
    )
    response = model.generate_content(
        [prompt_text, {"mime_type": mime_type, "data": raw_bytes}],
    )
    return response.text


@api_router.get("/")
async def root():
    return {"message": "SalahAlarm API running"}


@api_router.post("/ocr/timetable", response_model=OcrResponse)
async def ocr_timetable(req: OcrRequest):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API key not configured")

    img_b64 = req.image_base64
    if "," in img_b64 and img_b64.strip().startswith("data:"):
        img_b64 = img_b64.split(",", 1)[1]

    try:
        img_bytes = b64lib.b64decode(img_b64, validate=False)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image data. Please retake the photo.")

    try:
        raw = _run_gemini(
            "Extract the full prayer timetable from this image as JSON per the schema.",
            "image/jpeg",
            img_bytes,
        )
    except Exception as e:
        logger.exception("OCR LLM call failed")
        raise HTTPException(status_code=502, detail=f"OCR failed: {e}")

    try:
        parsed = _extract_json(raw)
    except Exception:
        logger.error("Failed to parse OCR JSON: %s", raw[:500])
        raise HTTPException(status_code=422, detail="Could not parse timetable from image. Please retry or enter manually.")

    return OcrResponse(
        month=parsed.get("month"),
        year=parsed.get("year"),
        rows=parsed.get("rows", []),
        raw=None,
    )


class PdfRequest(BaseModel):
    file_base64: str = Field(..., description="Base64 encoded PDF of the timetable")


@api_router.post("/ocr/pdf", response_model=OcrResponse)
async def ocr_pdf(req: PdfRequest):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API key not configured")

    data = req.file_base64
    if "," in data and data.strip().startswith("data:"):
        data = data.split(",", 1)[1]

    try:
        raw_bytes = b64lib.b64decode(data, validate=False)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid PDF data. Please pick a valid PDF file.")
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Empty PDF data.")

    try:
        raw = _run_gemini(
            "Extract the full prayer timetable from this PDF document as JSON per the schema.",
            "application/pdf",
            raw_bytes,
        )
    except Exception as e:
        logger.exception("PDF OCR failed")
        raise HTTPException(status_code=502, detail=f"PDF OCR failed: {e}")

    try:
        parsed = _extract_json(raw)
    except Exception:
        logger.error("Failed to parse PDF OCR JSON: %s", raw[:500])
        raise HTTPException(status_code=422, detail="Could not parse timetable from PDF. Please retry or enter manually.")

    return OcrResponse(month=parsed.get("month"), year=parsed.get("year"), rows=parsed.get("rows", []))


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
