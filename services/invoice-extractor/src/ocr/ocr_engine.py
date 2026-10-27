import os
import logging

import pytesseract
from PIL import Image

logger = logging.getLogger(__name__)

# Mandatory Tesseract config (PRD Section 6.2)
TESSERACT_CONFIG = "--oem 3 --psm 6"
TESSERACT_LANG = "eng"
DPI = 300

# Auto-detect Tesseract path on Windows
_TESSERACT_WIN_PATH = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
if os.path.isfile(_TESSERACT_WIN_PATH):
    pytesseract.pytesseract.tesseract_cmd = _TESSERACT_WIN_PATH

# Poppler path for pdf2image (portable install)
_POPPLER_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "tools", "poppler-24.08.0", "Library", "bin",
)
POPPLER_BIN = _POPPLER_PATH if os.path.isdir(_POPPLER_PATH) else None


def _check_tesseract():
    """Verify Tesseract is available. Raises RuntimeError if not found."""
    try:
        pytesseract.get_tesseract_version()
    except Exception:
        raise RuntimeError("Tesseract OCR binary not found. Please install Tesseract.")


def ocr_image(image: Image.Image) -> str:
    """Run OCR on a single PIL Image and return extracted text."""
    return pytesseract.image_to_string(
        image, lang=TESSERACT_LANG, config=TESSERACT_CONFIG
    )


def ocr_from_images(image_path: str) -> str:
    """Run OCR on a JPG/PNG image file."""
    _check_tesseract()
    image = Image.open(image_path)
    return ocr_image(image)


def ocr_from_pdf(pdf_path: str) -> str:
    """Convert PDF pages to images at 300 DPI and run OCR on each page once."""
    from pdf2image import convert_from_path

    _check_tesseract()
    pages = convert_from_path(pdf_path, dpi=DPI, poppler_path=POPPLER_BIN)
    page_texts = []
    for i, page_img in enumerate(pages):
        logger.info("Processing page %d/%d", i + 1, len(pages))
        page_text = ocr_image(page_img)
        page_texts.append(page_text)
    return "\n".join(page_texts)


def _try_extract_pdf_text(pdf_path: str) -> str:
    """Try extracting embedded text from a digital PDF using pdfplumber.

    Returns the extracted text if the PDF has a usable text layer,
    or empty string if not.
    """
    try:
        import pdfplumber
    except ImportError:
        logger.debug("pdfplumber not installed, skipping embedded text extraction")
        return ""

    try:
        page_texts = []
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                page_texts.append(text)
        full_text = "\n".join(page_texts)

        # Validate: must have >200 chars, contain letters, and contain digits
        if (len(full_text) > 200
                and any(c.isalpha() for c in full_text)
                and any(c.isdigit() for c in full_text)):
            logger.info("PDF has usable embedded text (%d chars), skipping OCR", len(full_text))
            return full_text

        logger.info("PDF embedded text too short/empty (%d chars), falling back to OCR", len(full_text))
        return ""
    except Exception as e:
        logger.debug("pdfplumber extraction failed: %s, falling back to OCR", e)
        return ""


def _try_extract_pdf_text_with_pages(pdf_path: str) -> tuple[str, int]:
    """Try extracting embedded text and return (text, page_count).

    Returns ("", 0) if extraction fails or text is not usable.
    """
    try:
        import pdfplumber
    except ImportError:
        logger.debug("pdfplumber not installed, skipping embedded text extraction")
        return "", 0

    try:
        page_texts = []
        with pdfplumber.open(pdf_path) as pdf:
            page_count = len(pdf.pages)
            for page in pdf.pages:
                text = page.extract_text() or ""
                page_texts.append(text)
        full_text = "\n".join(page_texts)

        if (len(full_text) > 200
                and any(c.isalpha() for c in full_text)
                and any(c.isdigit() for c in full_text)):
            logger.info("PDF has usable embedded text (%d chars, %d pages), skipping OCR",
                         len(full_text), page_count)
            return full_text, page_count

        logger.info("PDF embedded text too short/empty (%d chars), falling back to OCR", len(full_text))
        return "", page_count
    except Exception as e:
        logger.debug("pdfplumber extraction failed: %s, falling back to OCR", e)
        return "", 0


def extract_text(file_path: str) -> str:
    """Extract text from a file (PDF or image).

    For PDFs: tries embedded text extraction first, falls back to OCR.
    For images: uses OCR directly.
    """
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".pdf":
        # Try embedded text first (digital PDFs)
        text = _try_extract_pdf_text(file_path)
        if text:
            return text
        # Fallback to OCR (scanned PDFs)
        return ocr_from_pdf(file_path)
    elif ext in (".jpg", ".jpeg", ".png"):
        return ocr_from_images(file_path)
    else:
        raise ValueError(f"Unsupported file format: {ext}")


def extract_text_with_metadata(file_path: str) -> tuple[str, dict]:
    """Extract text from a PDF and return metadata about extraction source.

    Returns (text, {"source": "pdf_embedded" | "ocr"}).

    Only supports PDF files. For the web MVP, images are not accepted.
    This function does NOT modify existing extract_text() behavior.
    """
    ext = os.path.splitext(file_path)[1].lower()
    if ext != ".pdf":
        raise ValueError(f"Unsupported file format: {ext}")

    # Try embedded text first
    text, page_count = _try_extract_pdf_text_with_pages(file_path)
    if text:
        return text, {"source": "pdf_embedded", "page_count": page_count}

    # Fallback to OCR
    from pdf2image import convert_from_path
    _check_tesseract()
    pages = convert_from_path(file_path, dpi=DPI, poppler_path=POPPLER_BIN)
    page_texts = []
    for i, page_img in enumerate(pages):
        logger.info("Processing page %d/%d", i + 1, len(pages))
        page_text = ocr_image(page_img)
        page_texts.append(page_text)
    text = "\n".join(page_texts)
    return text, {"source": "ocr", "page_count": len(pages)}
