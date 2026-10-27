import logging
import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from ocr.ocr_engine import extract_text
from utils.text_cleaner import clean_text
from parser.gst_extractor import extract_all

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("hrs-invoice-extractor")

app = FastAPI(
    title="HRS TECH AI AP Invoice Extractor",
    version="0.1.0",
)

# Restrict CORS to explicitly configured origins in deployment.
# No browser origin is trusted by default.
allowed_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "").split(",")
    if origin.strip()
]
if allowed_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "Authorization"],
    )

MAX_FILE_BYTES = 15 * 1024 * 1024
SUPPORTED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}


@app.get("/health")
def health():
    return {"status": "ok", "service": "hrs-tech-ai-ap-invoice-extractor"}


@app.post("/api/v1/extract")
async def extract_invoice(file: UploadFile = File(...)):
    filename = Path(file.filename or "invoice").name
    extension = Path(filename).suffix.lower()

    if extension not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail="Supported formats: PDF, JPG, JPEG and PNG.",
        )

    temp_path = None

    try:
        contents = await file.read(MAX_FILE_BYTES + 1)

        if not contents:
            raise HTTPException(status_code=400, detail="The uploaded file is empty.")

        if len(contents) > MAX_FILE_BYTES:
            raise HTTPException(
                status_code=413,
                detail="File exceeds the 15 MB limit.",
            )

        with tempfile.NamedTemporaryFile(
            mode="wb",
            suffix=extension,
            prefix="hrs_invoice_",
            delete=False,
        ) as temp_file:
            temp_file.write(contents)
            temp_path = temp_file.name

        # Reuse the existing OCR, cleaning and GST extraction logic.
        raw_text = extract_text(temp_path)
        if not raw_text or not raw_text.strip():
            raise HTTPException(
                status_code=422,
                detail="No readable text was found in the invoice.",
            )

        cleaned_text = clean_text(raw_text)
        result = extract_all(cleaned_text)

        # Return extracted fields, not OCR text or internal debug details.
        return {
            "success": True,
            "filename": filename,
            "data": result,
        }

    except HTTPException:
        raise
    except Exception:
        logger.exception("Invoice extraction failed")
        raise HTTPException(
            status_code=500,
            detail="Invoice extraction failed. Check service logs for details.",
        )
    finally:
        await file.close()
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                logger.warning("Temporary upload cleanup failed.")
