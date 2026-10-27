import argparse
import json
import logging
import os
import sys

from ocr.ocr_engine import extract_text
from utils.text_cleaner import clean_text
from parser.gst_extractor import extract_all
from exporter.excel_exporter import export_to_excel

SUPPORTED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(
        description="GSTExtract — Extract structured GST data from invoices"
    )
    parser.add_argument("file_path", help="Path to invoice file (PDF/JPG/PNG)")
    args = parser.parse_args()

    file_path = os.path.abspath(args.file_path)

    # Validate file exists
    if not os.path.isfile(file_path):
        print(f"Error: File not found: {file_path}", file=sys.stderr)
        sys.exit(1)

    # Validate extension
    ext = os.path.splitext(file_path)[1].lower()
    if ext not in SUPPORTED_EXTENSIONS:
        print(f"Error: Unsupported file format: {ext}", file=sys.stderr)
        sys.exit(1)

    try:
        # OCR
        logger.info("Extracting text from: %s", file_path)
        raw_text = extract_text(file_path)

        if not raw_text or not raw_text.strip():
            logger.warning("OCR returned empty text")
            result = {
                "vendor_name": "",
                "gstin": "",
                "invoice_number": "",
                "invoice_date": "",
                "total_amount": 0.0,
                "cgst": 0.0,
                "sgst": 0.0,
                "igst": 0.0,
                "confidence_score": 0,
            }
        else:
            # Normalize
            cleaned_text = clean_text(raw_text)
            logger.info("Text normalized (%d chars)", len(cleaned_text))

            # Extract fields
            result = extract_all(cleaned_text)

        # Format amounts to 2 decimal places for JSON output
        amount_fields = ("total_amount", "cgst", "sgst", "igst")
        json_result = {
            k: f"{v:.2f}" if k in amount_fields else v
            for k, v in result.items()
        }

        # Output JSON to stdout
        print(json.dumps(json_result, indent=2))

        # Excel export
        base_name = os.path.splitext(file_path)[0]
        xlsx_path = base_name + ".xlsx"
        export_to_excel(result, xlsx_path)

    except SystemExit:
        raise
    except RuntimeError as e:
        logger.error("%s", e)
        sys.exit(2)
    except Exception as e:
        logger.error("Unexpected error: %s", e)
        # Graceful degradation: output empty result
        result = {
            "vendor_name": "",
            "gstin": "",
            "invoice_number": "",
            "invoice_date": "",
            "total_amount": 0.0,
            "cgst": 0.0,
            "sgst": 0.0,
            "igst": 0.0,
            "confidence_score": 0,
        }
        print(json.dumps(result, indent=2))

    sys.exit(0)


if __name__ == "__main__":
    main()
