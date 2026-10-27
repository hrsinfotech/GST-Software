"""Invoice Classification & Validation Gate.

Post-extraction, pre-Excel validation layer.
Determines whether a document is a valid GST invoice
before generating output.

Two-tier model:
  - Hard gates: immediate rejection if ANY fails
  - Soft signals: rejection only if 2+ fail simultaneously
"""

import re

from validator.gstin_validator import _luhn_mod36_checksum

# --- Hard gate: rejection keywords (case-insensitive, whole-phrase match) ---
REJECTION_KEYWORDS = [
    "CREDIT NOTE",
    "DEBIT NOTE",
    "PROFORMA",
    "REFUND",
    "DELIVERY CHALLAN",
    "BANK STATEMENT",
    "SALARY SLIP",
    "PAYSLIP",
    "STATEMENT OF ACCOUNT",
]

# --- Soft signal: invoice keywords (at least one should be present) ---
INVOICE_KEYWORDS = [
    "TAX INVOICE",
    "INVOICE",
    "BILL",
    "RECEIPT",
]

# Structural GSTIN pattern (15-char format, no checksum requirement)
_GSTIN_STRUCTURAL_RE = re.compile(r"\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]")

# Years that could be confused with amounts
_YEAR_MIN = 2000
_YEAR_MAX = 2099

# Max lines to scan for rejection keywords (avoids false positives from boilerplate T&C)
MAX_REJECTION_SCAN_LINES = 60


def validate_invoice(
    result_dict: dict,
    cleaned_text: str,
    page_count: int = 1,
) -> tuple[bool, str]:
    """Validate whether extraction result represents a valid GST invoice.

    Args:
        result_dict: extraction output from extract_all()
        cleaned_text: normalized text from clean_text()
        page_count: number of pages in the source PDF

    Returns:
        (True, "") if valid
        (False, reason_string) if invalid
    """
    # ================================================================
    # HARD GATES — reject if ANY fails
    # ================================================================

    total = result_dict.get("total_amount", 0.0)
    cgst = result_dict.get("cgst", 0.0)
    sgst = result_dict.get("sgst", 0.0)
    igst = result_dict.get("igst", 0.0)
    gstin = result_dict.get("gstin", "")
    invoice_number = result_dict.get("invoice_number", "")

    # 1. Total amount must be positive
    if total <= 0:
        return False, "total_amount <= 0"

    # 2. Tax cannot exceed total
    tax_sum = cgst + sgst + igst
    if tax_sum > total:
        return False, f"tax_sum ({tax_sum}) > total_amount ({total})"

    # 3. GSTIN must be structurally valid (15-char format, no checksum required)
    if not gstin or not _GSTIN_STRUCTURAL_RE.fullmatch(gstin):
        return False, "no valid GSTIN (structural format)"

    # 4. Rejection keywords in top section of text (avoids boilerplate T&C matches)
    scan_lines = cleaned_text.splitlines()[:MAX_REJECTION_SCAN_LINES]
    top_section = "\n".join(scan_lines).upper()
    for keyword in REJECTION_KEYWORDS:
        # Word-boundary match to avoid substring false positives (e.g., "REFUNDS" ≠ "REFUND")
        if re.search(r"\b" + re.escape(keyword) + r"\b", top_section):
            return False, f"rejection keyword found: {keyword}"

    # 5. Total amount equals a 4-digit year (likely misparse)
    #    Skip if taxes are present — a real invoice can legitimately total 2000-2099
    if (total == int(total) and _YEAR_MIN <= int(total) <= _YEAR_MAX
            and (cgst + sgst + igst) == 0):
        return False, f"total_amount looks like a year: {int(total)}"

    # 6. Minimum 2-of-3 rule: at least 2 of {GSTIN, invoice_number, total_amount}
    field_count = 0
    if gstin:
        field_count += 1
    if invoice_number:
        field_count += 1
    if total > 0:
        field_count += 1
    if field_count < 2:
        return False, f"only {field_count}/3 key fields present (need >= 2)"

    # ================================================================
    # SOFT SIGNALS — reject only if 2+ fail
    # ================================================================

    soft_failures = []

    # S1. Invoice keyword not found
    text_upper = cleaned_text.upper()
    has_invoice_keyword = any(
        re.search(r"\b" + re.escape(kw) + r"\b", text_upper) for kw in INVOICE_KEYWORDS
    )
    if not has_invoice_keyword:
        soft_failures.append("no invoice keyword")

    # S2. GSTIN checksum fails (structural format already passed above)
    if not _gstin_checksum_valid(gstin):
        soft_failures.append("GSTIN checksum invalid")

    # S3. Invoice date missing
    invoice_date = result_dict.get("invoice_date", "")
    if not invoice_date:
        soft_failures.append("invoice date missing")

    # S4. Page count exceeds 10
    if page_count > 10:
        soft_failures.append(f"page count {page_count} > 10")

    if len(soft_failures) >= 2:
        return False, f"soft signal failures ({len(soft_failures)}): {', '.join(soft_failures)}"

    return True, ""


def _gstin_checksum_valid(gstin: str) -> bool:
    """Verify GSTIN Luhn mod-36 checksum (last character).

    Returns True if checksum passes, False otherwise.
    Does NOT reject structurally valid GSTINs — this is a soft signal only.
    Delegates to the existing checksum in gstin_validator.py.
    """
    if not gstin or len(gstin) != 15:
        return False
    try:
        expected = _luhn_mod36_checksum(gstin[:14])
        return expected == gstin[14]
    except Exception:
        return False
