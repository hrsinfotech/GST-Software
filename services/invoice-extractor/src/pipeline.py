"""High-level extraction pipeline for the web layer.

Wraps coreengine modules into a single process_file() call.
Does NOT modify any existing extraction logic.
"""

from ocr.ocr_engine import extract_text_with_metadata
from utils.text_cleaner import clean_text
from parser.gst_extractor import extract_all


def process_file(file_path: str) -> tuple[dict, dict]:
    """Run full extraction pipeline on a PDF file.

    Returns:
        (result_dict, metadata_dict)

        result_dict: extraction output matching the output schema
            (vendor_name, gstin, invoice_number, invoice_date,
             total_amount, cgst, sgst, igst, confidence_score)

        metadata_dict: {"source": "pdf_embedded" | "ocr"}
    """
    text, metadata = extract_text_with_metadata(file_path)

    if not text or not text.strip():
        return {
            "vendor_name": "",
            "gstin": "",
            "invoice_number": "",
            "invoice_date": "",
            "total_amount": 0.0,
            "cgst": 0.0,
            "sgst": 0.0,
            "igst": 0.0,
            "confidence_score": 0,
        }, metadata

    cleaned = clean_text(text)
    result = extract_all(cleaned)
    metadata["cleaned_text"] = cleaned
    return result, metadata
