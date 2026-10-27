import re

# ---------------------------------------------------------------------------
# GSTIN
# ---------------------------------------------------------------------------
# Strict GSTIN: 2-digit state + 5 letters + 4 digits + letter + alphanum + Z + alphanum
GSTIN_RE = re.compile(r"\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]\b")

# Relaxed GSTIN: allows digit at position 11 (entity type), broader matching
GSTIN_RELAXED_RE = re.compile(r"\b\d{2}[A-Z]{5}\d{4}[A-Z0-9][A-Z0-9]Z[A-Z0-9]\b")

# Very broad: any 14-16 char alphanumeric cluster (for OCR recovery)
GSTIN_BROAD_RE = re.compile(r"\b([A-Z0-9]{14,16})\b")

# GSTIN keyword patterns (expanded beyond just "GSTIN")
GSTIN_KEYWORD_RE = re.compile(
    r"(?:GSTIN|GST\s*(?:NO\.?|NUMBER|ID|IN)|GSTN)\s*[:\s.-]*",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# Invoice Number
# ---------------------------------------------------------------------------
INVOICE_NUMBER_RE = re.compile(
    r"(?:"
    r"(?:TAX\s+)?INVOICE\s*(?:NO\.?|NUMBER|#|ID|CODE)"
    r"|INV\.?\s*(?:NO\.?|NUMBER|#|ID)"
    r"|BILL\s*(?:NO\.?|NUMBER|#|ID)"
    r"|REF(?:ERENCE)?\s*(?:NO\.?|NUMBER|#|ID)"
    r"|DOC(?:UMENT)?\s*(?:NO\.?|NUMBER|#|ID)"
    r"|VOUCHER\s*(?:NO\.?|NUMBER|#)"
    r"|RECEIPT\s*(?:NO\.?|NUMBER|#)"
    r"|MEMO\s*(?:NO\.?|NUMBER|#)"
    r")"
    r"[.\s:=+#/-]*\s*([\w/\-]+(?:[^\S\n][\w/\-]+)*?)"
    r"(?=\s{2,}|\n|\s*(?:INVOICE|BILL|DATE|GSTIN|TOTAL|PLACE|HSN|ORDER|AMOUNT|SUPPLY|$))",
    re.IGNORECASE,
)

# Fallback: "INVOICE <id>" without No/Number (e.g., "INVOICE X33")
INVOICE_ID_FALLBACK_RE = re.compile(
    r"\bINVOICE\s+([A-Z0-9][A-Z0-9/\-_ ]*[A-Z0-9])\b"
    r"(?=\s{2,}|\n|\s*$|\s*(?:DATE|GSTIN|TOTAL))",
    re.IGNORECASE,
)

# Fallback: standalone "# :" at line start (e.g., "# : PIS/21-22/073")
INVOICE_HASH_RE = re.compile(
    r"(?:^|\n)\s*#\s*[:\s]+\s*([\w/\-]+(?:[^\S\n][\w/\-]+)*?)"
    r"(?=\s{2,}|\n|\s*(?:INVOICE|BILL|DATE|GSTIN|TOTAL|PLACE|SUPPLY|$))",
    re.IGNORECASE,
)

# Fallback heuristic: structured alphanumeric ID with separator (/ or -)
INVOICE_STRUCTURED_ID_RE = re.compile(
    r"\b([A-Z0-9]+[/\-][A-Z0-9/\-.]+[A-Z0-9])\b",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# Invoice Date keywords
# ---------------------------------------------------------------------------
# High-priority date keywords (invoice/bill specific)
DATE_KEYWORD_HIGH_RE = re.compile(
    r"(?:INVOICE\s*DATE|INV\s*DATE|BILL\s*DATE|DATE\s*OF\s*INVOICE"
    r"|DOCUMENT\s*DATE|DATED)"
    r"[.\s:/-]*\s*",
    re.IGNORECASE,
)

# Low-priority date keyword (generic "Date")
# Exclude non-invoice date contexts: DUE DATE, P.O. DATE, DELIVERY DATE, etc.
DATE_KEYWORD_LOW_RE = re.compile(
    r"(?<!DUE )(?<!P\.O\. )(?<!DELIVERY )(?<!PAYMENT )(?<!EXPIRY )"
    r"\bDATE\b"
    r"[.\s:/-]*\s*",
    re.IGNORECASE,
)

# Date format patterns (used after a keyword or standalone)
DATE_PATTERNS = [
    # YYYY-MM-DD (ISO)
    re.compile(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b"),
    # DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    re.compile(r"\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b"),
    # DD MON YYYY (e.g., 15 Jan 2024)
    re.compile(
        r"\b(\d{1,2})\s+"
        r"(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:TEMBER)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)\s+"
        r"(\d{4})\b",
        re.IGNORECASE,
    ),
    # DD-MON-YY (e.g., 15-Jan-24)
    re.compile(
        r"\b(\d{1,2})[-\s]"
        r"(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:TEMBER)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)[-\s]"
        r"(\d{2})\b",
        re.IGNORECASE,
    ),
    # MON DD, YYYY (e.g., March 03, 2018)
    re.compile(
        r"\b(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:TEMBER)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)\s+"
        r"(\d{1,2}),?\s+"
        r"(\d{4})\b",
        re.IGNORECASE,
    ),
]

# ---------------------------------------------------------------------------
# Vendor Name keywords
# ---------------------------------------------------------------------------
VENDOR_KEYWORD_RE = re.compile(
    r"(?:M/S\.?|SOLD\s*BY|SELLER|SUPPLIER|COMPANY\s*NAME|FIRM\s*NAME|BILLED\s*BY"
    r"|LEGAL\s*ENTITY\s*NAME)"
    r"[.\s:/-]*\s*(.+)",
    re.IGNORECASE,
)

# Seller proximity keywords (for scoring)
SELLER_KEYWORDS_RE = re.compile(
    r"\b(?:SOLD\s*BY|SELLER|SUPPLIER|M/S\.?|COMPANY\s*NAME|FIRM\s*NAME"
    r"|BILLED\s*BY|LEGAL\s*ENTITY\s*NAME)\b",
    re.IGNORECASE,
)

# Buyer proximity keywords (for scoring)
BUYER_KEYWORDS_RE = re.compile(
    r"\b(?:BILL\s*TO|SHIP\s*TO|CUSTOMER|BUYER|CONSIGNEE"
    r"|SHIPPED\s*TO|DELIVER\s*TO|BILLED\s*TO)\b",
    re.IGNORECASE,
)

# Capture vendor name appearing before "BILL TO" on the same line
VENDOR_BEFORE_BILLTO_RE = re.compile(
    r"^(.+?)\s+BILL\s*TO\s*:",
    re.IGNORECASE | re.MULTILINE,
)

SKIP_HEADERS = {
    "TAX INVOICE", "INVOICE", "GST INVOICE", "ORIGINAL", "DUPLICATE",
    "ORIGINAL FOR RECIPIENT", "DUPLICATE FOR SUPPLIER", "ORIGINAL FOR BUYER",
    "",
}

# ---------------------------------------------------------------------------
# Amount pattern (shared across total + tax extraction)
# ---------------------------------------------------------------------------
AMOUNT_RE = re.compile(
    r"(?:RS\.?|INR|₹|[%])?\s*([\d,]+\.?\d{0,2})",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# Total Amount keywords (used by scoring-based extraction)
# ---------------------------------------------------------------------------
# Each pattern is paired with a score in gst_extractor.py
TOTAL_KEYWORD_RE = re.compile(
    r"(?:GRAND\s*TOTAL|G[\.\-\s]*TOTAL"
    r"|INVOICE\s*(?:VALUE|TOTAL)"
    r"|NET\s*(?:PAYABLE|AMOUNT|TOTAL)"
    r"|AMOUNT\s*(?:PAYABLE|DUE|CHARGEABLE|INCL\w*(?:\s+\w+)*)"
    r"|TOTAL\s*(?:AMOUNT|VALUE|PAYABLE|DUE)"
    r"|GROSS\s*(?:AMOUNT|TOTAL)"
    r"|BILL\s*AMOUNT"
    r"|TOTAL\s*(?:\(?\s*(?:RS|INR|₹|INCL)\.?\s*\w*\s*\)?)?"
    r")",
    re.IGNORECASE,
)

# Negative/exclusion keywords near total candidates
TOTAL_EXCLUDE_RE = re.compile(
    r"(?:TAXABLE|SUB\s*TOTAL|ROUND\s*OFF|DISCOUNT|ADVANCE|BALANCE\s*DUE"
    r"|TCS\b|TDS\b|QUANTITY|QTY\b|ITEMS?\b|NOS?\b|PCS\b)",
    re.IGNORECASE,
)

# Legacy patterns kept for backward compatibility in case they're imported elsewhere
TOTAL_HIGH_PRIORITY_RE = re.compile(
    r"(?:GRAND\s*TOTAL|INVOICE\s*VALUE|TOTAL\s*AMOUNT|AMOUNT\s*DUE)[.\s:/-]*\s*",
    re.IGNORECASE,
)

TOTAL_LOW_PRIORITY_RE = re.compile(
    r"(?:TOTAL\s*AMOUNT|AMOUNT\s*PAYABLE|NET\s*PAYABLE|TOTAL)[.\s:/-]*\s*",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# Tax keyword patterns (keyword only, amount extracted separately per line)
# ---------------------------------------------------------------------------
CGST_KEYWORD_RE = re.compile(
    r"(?:CGST|CENTRAL\s*(?:TAX|GST))",
    re.IGNORECASE,
)

SGST_KEYWORD_RE = re.compile(
    r"(?:SGST|UTGST|STATE\s*(?:TAX|GST))",
    re.IGNORECASE,
)

IGST_KEYWORD_RE = re.compile(
    r"(?:IGST|INTEGRATED\s*(?:TAX|GST))",
    re.IGNORECASE,
)
