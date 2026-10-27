import re
import logging
from datetime import date

from parser.regex_patterns import (
    GSTIN_RE,
    GSTIN_RELAXED_RE,
    GSTIN_BROAD_RE,
    GSTIN_KEYWORD_RE,
    INVOICE_NUMBER_RE,
    INVOICE_ID_FALLBACK_RE,
    INVOICE_HASH_RE,
    INVOICE_STRUCTURED_ID_RE,
    DATE_KEYWORD_HIGH_RE,
    DATE_KEYWORD_LOW_RE,
    DATE_PATTERNS,
    VENDOR_KEYWORD_RE,
    VENDOR_BEFORE_BILLTO_RE,
    SELLER_KEYWORDS_RE,
    BUYER_KEYWORDS_RE,
    SKIP_HEADERS,
    AMOUNT_RE,
    TOTAL_KEYWORD_RE,
    TOTAL_EXCLUDE_RE,
    CGST_KEYWORD_RE,
    SGST_KEYWORD_RE,
    IGST_KEYWORD_RE,
)
from validator.gstin_validator import validate_gstin

logger = logging.getLogger(__name__)

MONTH_MAP = {
    "JAN": 1, "JANUARY": 1, "FEB": 2, "FEBRUARY": 2,
    "MAR": 3, "MARCH": 3, "APR": 4, "APRIL": 4,
    "MAY": 5, "JUN": 6, "JUNE": 6,
    "JUL": 7, "JULY": 7, "AUG": 8, "AUGUST": 8,
    "SEP": 9, "SEPTEMBER": 9, "OCT": 10, "OCTOBER": 10,
    "NOV": 11, "NOVEMBER": 11, "DEC": 12, "DECEMBER": 12,
}

# OCR correction map for GSTIN characters
_OCR_CORRECTIONS = str.maketrans({
    "O": "0", "I": "1", "L": "1", "S": "5", "B": "8",
})


def _clean_numeric_ocr(raw: str) -> str:
    """Clean OCR artifacts from a numeric string before float conversion."""
    s = raw.strip()
    # Remove leading/trailing non-numeric characters (%, |, ), ], etc.)
    # but keep ₹, Rs, INR prefixes (already stripped before this call)
    s = re.sub(r"^[^0-9]+", "", s)
    s = re.sub(r"[^0-9.]+$", "", s)
    # Remove stray spaces inside numbers (e.g., "1 2,345.00" → "12,345.00")
    s = re.sub(r"(\d)\s+(?=[\d,.])", r"\1", s)
    # OCR character corrections in numeric context
    # O → 0, I/l → 1, S → 5 (only when surrounded by digits/commas/dots)
    result = []
    for i, c in enumerate(s):
        if c in "Oo" and _is_numeric_context(s, i):
            result.append("0")
        elif c in "Il" and _is_numeric_context(s, i):
            result.append("1")
        elif c == "S" and _is_numeric_context(s, i):
            result.append("5")
        else:
            result.append(c)
    s = "".join(result)
    # Ensure only one decimal point (keep last one)
    if s.count(".") > 1:
        parts = s.rsplit(".", 1)
        s = parts[0].replace(".", "") + "." + parts[1]
    return s


def _is_numeric_context(s: str, i: int) -> bool:
    """Check if position i in string s is surrounded by digits/commas/dots."""
    prev_ok = i > 0 and s[i - 1] in "0123456789,."
    next_ok = i < len(s) - 1 and s[i + 1] in "0123456789,."
    return prev_ok or next_ok


def _parse_amount(raw: str) -> float | None:
    """Parse an amount string, return None if invalid."""
    if not raw:
        return None
    cleaned = _clean_numeric_ocr(raw)
    cleaned = cleaned.replace(",", "").strip()
    if not cleaned:
        return None
    if cleaned.count(".") > 1:
        return None
    try:
        val = float(cleaned)
    except ValueError:
        return None
    if val < 0:
        return None
    return round(val, 2)


def _parse_date(day: int, month: int, year: int) -> str | None:
    """Validate and return ISO date string, or None if invalid."""
    if year < 100:
        year += 2000
    if not (2000 <= year <= 2099):
        return None
    try:
        d = date(year, month, day)
        return d.isoformat()
    except ValueError:
        return None


def _try_parse_date_match(match: re.Match, pattern_index: int) -> str | None:
    """Convert a date regex match to ISO string based on which pattern matched."""
    groups = match.groups()
    if pattern_index == 0:
        # YYYY-MM-DD
        return _parse_date(int(groups[2]), int(groups[1]), int(groups[0]))
    elif pattern_index == 1:
        # DD/MM/YYYY
        return _parse_date(int(groups[0]), int(groups[1]), int(groups[2]))
    elif pattern_index in (2, 3):
        # DD MON YYYY or DD-MON-YY
        month_str = groups[1].upper()[:3]
        month = MONTH_MAP.get(month_str)
        if month is None:
            return None
        return _parse_date(int(groups[0]), month, int(groups[2]))
    elif pattern_index == 4:
        # MON DD, YYYY
        month_str = groups[0].upper()[:3]
        month = MONTH_MAP.get(month_str)
        if month is None:
            return None
        return _parse_date(int(groups[1]), month, int(groups[2]))
    return None


def _ocr_fix_gstin(raw: str) -> str:
    """Apply position-aware OCR correction to a 15-char GSTIN candidate."""
    if len(raw) != 15:
        return raw
    fixed = list(raw.upper())

    # Positions 0-1: must be digits
    for i in (0, 1):
        if fixed[i] == "O":
            fixed[i] = "0"
        elif fixed[i] in ("I", "L"):
            fixed[i] = "1"
        elif fixed[i] == "S":
            fixed[i] = "5"
        elif fixed[i] == "B" and not fixed[i].isdigit():
            fixed[i] = "8"
        elif fixed[i] == "Z":
            fixed[i] = "2"

    # Positions 2-6: must be letters (PAN alpha part)
    for i in range(2, 7):
        if fixed[i] == "0":
            fixed[i] = "O"
        elif fixed[i] == "1":
            fixed[i] = "I"
        elif fixed[i] == "5":
            fixed[i] = "S"
        elif fixed[i] == "8":
            fixed[i] = "B"

    # Positions 7-10: must be digits (PAN numeric part)
    for i in range(7, 11):
        if fixed[i] == "O":
            fixed[i] = "0"
        elif fixed[i] in ("I", "L"):
            fixed[i] = "1"
        elif fixed[i] == "S":
            fixed[i] = "5"
        elif fixed[i] == "B":
            fixed[i] = "8"
        elif fixed[i] == "Z":
            fixed[i] = "2"

    # Position 11: must be letter (PAN type)
    if fixed[11] == "0":
        fixed[11] = "O"
    elif fixed[11] == "1":
        fixed[11] = "I"

    # Position 12: alphanumeric (entity number) — no correction needed

    # Position 13: must be Z (fix common OCR misread 2→Z)
    if fixed[13] == "2":
        fixed[13] = "Z"

    # Position 14: checksum (alphanumeric) — no correction needed

    return "".join(fixed)


def _clean_gstin_candidate(raw: str) -> str:
    """Clean a raw string to extract a potential GSTIN: remove spaces, punctuation."""
    # Remove spaces, commas, dots, hyphens, pipes, brackets inside the string
    cleaned = re.sub(r"[\s,.\-|(){}\[\]'\"]+", "", raw)
    return cleaned.upper()


def _find_gstin_candidates(text: str) -> list[tuple[str, int]]:
    """Find all GSTIN candidates with their line positions.

    Returns list of (candidate_15char, line_index).
    Uses multiple strategies: strict regex, relaxed regex, keyword proximity,
    and broad pattern matching with cleanup.
    """
    lines = text.split("\n")
    candidates = []  # (raw_15char, line_idx)
    seen = set()

    def _add(value: str, line_idx: int):
        if value not in seen:
            seen.add(value)
            candidates.append((value, line_idx))

    # Strategy 1: Strict regex (original pattern)
    for i, line in enumerate(lines):
        for m in GSTIN_RE.finditer(line):
            _add(m.group(0), i)

    # Strategy 2: Relaxed regex (digit at position 11)
    for i, line in enumerate(lines):
        for m in GSTIN_RELAXED_RE.finditer(line):
            _add(m.group(0), i)

    # Strategy 3: Keyword proximity — look for 15-char alphanum near GSTIN keywords
    for i, line in enumerate(lines):
        for kw_match in GSTIN_KEYWORD_RE.finditer(line):
            # Check remainder of same line
            after = line[kw_match.end():]
            m = re.match(r"([A-Z0-9]{15})\b", after)
            if m:
                _add(m.group(1), i)
            else:
                # Try cleaning the remainder (remove stray punctuation)
                cleaned = _clean_gstin_candidate(after[:25])
                if len(cleaned) >= 15:
                    _add(cleaned[:15], i)

            # Check next line too (keyword and value on separate lines)
            if i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                m = re.match(r"([A-Z0-9]{15})\b", next_line.upper())
                if m:
                    _add(m.group(1), i + 1)
                else:
                    cleaned = _clean_gstin_candidate(next_line[:25])
                    if len(cleaned) >= 15:
                        _add(cleaned[:15], i + 1)

    # Strategy 4: GST- prefix pattern (e.g., "GST-27AASCS2460H1Z0" or split "GST-27AASCS2460H 120")
    gst_prefix_re = re.compile(r"GST[-\s]*(.{12,20})", re.IGNORECASE)
    for i, line in enumerate(lines):
        for m in gst_prefix_re.finditer(line):
            raw = _clean_gstin_candidate(m.group(1))
            if len(raw) >= 15:
                _add(raw[:15], i)

    # Exclusion: remove candidates that appear directly after TRANSPORT ID/NO
    transport_id_re = re.compile(
        r"TRANSPORT\s*(?:ID|NO)\.?\s*[:\s]*([A-Z0-9]{15})\b", re.IGNORECASE,
    )
    transport_ids = set()
    for line in lines:
        for m in transport_id_re.finditer(line):
            transport_ids.add(m.group(1).upper())

    # Strategy 5: Broad 14-16 char alphanum — filter for GSTIN-like structure
    for i, line in enumerate(lines):
        for m in GSTIN_BROAD_RE.finditer(line):
            raw = m.group(1)
            if len(raw) < 14 or len(raw) > 16:
                continue
            # Must start with 2 digits
            if not re.match(r"\d{2}", raw):
                continue
            # Must contain Z in positions 12-14 range
            has_z = any(raw[j] == "Z" for j in range(12, min(15, len(raw))))
            if not has_z:
                continue
            # Must have ≥10 alphanumeric chars (already guaranteed by regex)
            # Trim or pad to 15
            if len(raw) == 15:
                _add(raw, i)

    # Filter out known transport IDs
    if transport_ids:
        candidates = [(c, idx) for c, idx in candidates if c not in transport_ids]

    return candidates


def _score_gstin_candidate(
    candidate: str,
    line_idx: int,
    lines: list[str],
    n_lines: int,
) -> int:
    """Score a GSTIN candidate based on position and context."""
    score = 0
    top_30 = max(1, int(n_lines * 0.3))

    # +10 if in top 30% of document
    if line_idx < top_30:
        score += 10

    # Check surrounding lines (±3) for context keywords
    for offset in range(-3, 4):
        ctx_idx = line_idx + offset
        if ctx_idx < 0 or ctx_idx >= n_lines:
            continue
        ctx_line = lines[ctx_idx].upper()

        # +8 if near seller keywords
        if re.search(
            r"\b(?:SOLD\s*BY|SELLER|SUPPLIER|OUR\s*GSTIN|OUR\s*GST"
            r"|M/S\.?|COMPANY\s*NAME|FIRM\s*NAME|BILLED\s*BY)\b",
            ctx_line,
        ):
            score += 8
            break

    for offset in range(-3, 4):
        ctx_idx = line_idx + offset
        if ctx_idx < 0 or ctx_idx >= n_lines:
            continue
        ctx_line = lines[ctx_idx].upper()

        # -10 if near buyer keywords
        if re.search(
            r"\b(?:BILL\s*TO|SHIP\s*TO|CUSTOMER|BUYER|CONSIGNEE"
            r"|SHIPPED\s*TO|DELIVER\s*TO|BILLED\s*TO)\b",
            ctx_line,
        ):
            score -= 10
            break

    for offset in range(-3, 4):
        ctx_idx = line_idx + offset
        if ctx_idx < 0 or ctx_idx >= n_lines:
            continue
        ctx_line = lines[ctx_idx].upper()

        # -12 if near TRANSPORT ID (not a business GSTIN)
        if re.search(r"\bTRANSPORT\s*(?:ID|NO)\b", ctx_line):
            score -= 12
            break

    # +5 if near invoice header keywords
    for offset in range(-5, 6):
        ctx_idx = line_idx + offset
        if ctx_idx < 0 or ctx_idx >= n_lines:
            continue
        ctx_line = lines[ctx_idx].upper()
        if re.search(r"\bTAX\s*INVOICE\b|\bINVOICE\b", ctx_line):
            score += 5
            break

    return score


def _is_gstin_structure_plausible(s: str) -> bool:
    """Check if a 15-char string has plausible GSTIN structure (no checksum check)."""
    if len(s) != 15:
        return False
    # Positions 0-1: digits (state code 01-38)
    if not s[0:2].isdigit():
        return False
    state = int(s[0:2])
    if state < 1 or state > 38:
        return False
    # Positions 2-6: mostly letters (PAN alpha)
    alpha_count = sum(1 for c in s[2:7] if c.isalpha())
    if alpha_count < 4:
        return False
    # Positions 7-10: mostly digits (PAN numeric)
    digit_count = sum(1 for c in s[7:11] if c.isdigit())
    if digit_count < 3:
        return False
    # Reject repetitive patterns (anonymized/garbled: XXXX, 0000, etc.)
    if re.search(r"(.)\1{2,}", s):
        return False
    return True


def _is_near_gstin_keyword(line_idx: int, lines: list[str]) -> bool:
    """Check if a line is near a GSTIN-related keyword (within ±2 lines)."""
    for offset in range(-2, 3):
        ctx_idx = line_idx + offset
        if 0 <= ctx_idx < len(lines):
            if GSTIN_KEYWORD_RE.search(lines[ctx_idx]):
                return True
    return False


def extract_gstin(text: str) -> str:
    """Extract seller GSTIN using multi-strategy candidate extraction + ranking."""
    lines = [l for l in text.split("\n")]
    n_lines = len(lines)

    # Find all candidates
    raw_candidates = _find_gstin_candidates(text)

    # Phase 1: checksum-valid candidates (with and without OCR correction)
    valid_candidates = []  # (gstin, line_idx, score)
    # Phase 2: structurally-plausible candidates near keywords (no checksum)
    structural_candidates = []

    for raw, line_idx in raw_candidates:
        # Try as-is
        if len(raw) == 15 and validate_gstin(raw):
            score = _score_gstin_candidate(raw, line_idx, lines, n_lines)
            valid_candidates.append((raw, line_idx, score))
            continue

        # Try with OCR correction
        if len(raw) == 15:
            fixed = _ocr_fix_gstin(raw)
            if validate_gstin(fixed):
                score = _score_gstin_candidate(fixed, line_idx, lines, n_lines)
                valid_candidates.append((fixed, line_idx, score))
                continue

            # Phase 2: structural fallback (near GSTIN keyword, plausible structure)
            # Only accept if score > 0 (avoids false positives from transport/buyer GSTINs)
            for candidate in (raw, fixed):
                if _is_gstin_structure_plausible(candidate) and _is_near_gstin_keyword(line_idx, lines):
                    score = _score_gstin_candidate(candidate, line_idx, lines, n_lines)
                    if score > 5:
                        structural_candidates.append((candidate, line_idx, score))

    # Prefer checksum-valid candidates
    pool = valid_candidates if valid_candidates else structural_candidates

    if not pool:
        return ""

    # Rank by score, break ties by earlier position
    pool.sort(key=lambda x: (-x[2], x[1]))

    # Reject if best candidate has very negative score (likely transport/noise)
    if pool[0][2] < -5:
        return ""

    return pool[0][0]


def _is_vendor_keyword_noise(value: str) -> bool:
    """Check if a keyword-extracted vendor name is actually noise/label text."""
    upper = value.upper()
    # Reject if it contains buyer/address/label keywords
    if re.search(
        r"\bBILLING\s*ADDRESS|SHIPPING\s*ADDRESS|CUSTOMER\s*NAME"
        r"|\bPHONE\b|\bMOBILE\b|\bFAX\b|\bEMAIL\b"
        r"|\bPAN\s*NO|\bTAN\s*NO|\bCIN\s*[UL]",
        upper,
    ):
        return True
    # Reject if >50% digits
    digit_count = sum(1 for c in value if c.isdigit())
    if len(value) > 0 and digit_count / len(value) > 0.5:
        return True
    # Reject if long value contains invoice metadata keywords (keyword bleed-through)
    if len(value) > 35 and re.search(
        r"\bCHALLAN\b|\bINVOICE\b|\bBILL\b|\bDATE\b|\bTOTAL\b|\bHSN\b",
        upper,
    ):
        return True
    return False


def _score_vendor_line(
    idx: int,
    line: str,
    n_lines: int,
    seller_lines: set,
    buyer_lines: set,
    gstin_line: int,
) -> int:
    """Score a candidate line as a potential vendor name."""
    upper = line.upper()
    score = 0

    # Near seller keywords: +10
    for sl in seller_lines:
        if abs(idx - sl) <= 3:
            score += 10
            break

    # Near buyer keywords: -10
    for bl in buyer_lines:
        if abs(idx - bl) <= 3:
            score -= 10
            break

    # Near first GSTIN occurrence: +5
    if gstin_line >= 0 and abs(idx - gstin_line) <= 5:
        score += 5

    # Bottom half of document: -3
    if idx >= n_lines // 2:
        score -= 3

    # Top position bonus (first 5 lines): +3, extra +2 for very first line
    if idx < 5:
        score += 3
    if idx == 0:
        score += 2

    # Uppercase multi-word string: +2
    words = line.split()
    if len(words) >= 2 and line == line.upper():
        score += 2

    # Company name indicators: +3
    if re.search(
        r"\b(?:LTD|LIMITED|PVT|PRIVATE|CORP|CORPORATION|ENTERPRISE|ENTERPRISES"
        r"|INDUSTRIES|TRADERS|SOLUTIONS|MOVERS|PACKERS|DHABA"
        r"|BAZAR|BAZAAR|STORE|WHOLESALE|RETAIL)\b",
        upper,
    ):
        score += 3

    # --- Negative patterns ---
    # CIN number
    if re.search(r"\bCIN\s*[:\s]*[UL]\d", upper):
        score -= 15
    # Phone/fax/tel
    if re.search(r"\b(?:PHONE|MOBILE|TEL|FAX|CONTACT)\s*(?:NO)?[.\s:]*\d", upper):
        score -= 12
    # Address indicators (only penalize if no company keywords)
    if re.search(r"\b(?:PLOT|ROAD|STREET|FLOOR|BLOCK|SECTOR|LANE|NAGAR|ESTATE)\b", upper):
        if not re.search(r"\b(?:LTD|LIMITED|PVT|PRIVATE|ENTERPRISE|TRADERS)\b", upper):
            score -= 5
    # Website/email
    if re.search(r"WWW\.|@|\.COM\b|\.IN\b|\.ORG\b|HTTP", upper):
        score -= 8
    # PAN/TAN labels
    if re.search(r"\bPAN\s*(?:NO|:)|\bTAN\s*(?:NO|:)", upper):
        score -= 10
    # Billing/shipping address labels
    if re.search(r"BILLING\s*ADDRESS|SHIPPING\s*ADDRESS", upper):
        score -= 12
    # FSSAI / license
    if re.search(r"\bFSSAI\b|\bLIC\b\.?\s*NO", upper):
        score -= 8
    # REF NO / VEHICLE / TRANSPORT labels
    if re.search(r"\bREF\s*NO\b|\bVEHICLE\b|\bTRANSPORT\s*(?:MODE|ID)\b", upper):
        score -= 5
    # Numeric-heavy strings (>40% digits)
    digit_count = sum(1 for c in line if c.isdigit())
    if len(line) > 0 and digit_count / len(line) > 0.4:
        score -= 8
    # Very short lines (< 3 chars) are unlikely vendor names
    if len(line.strip()) < 3:
        score -= 10

    return score


def extract_vendor_name(text: str, gstin: str) -> str:
    """Extract vendor name using keyword match + scoring-based fallback."""
    # Priority 1: keyword extraction (SOLD BY, M/S, LEGAL ENTITY NAME, etc.)
    for match in VENDOR_KEYWORD_RE.finditer(text):
        name = match.group(1).strip().strip(".:;,")
        if name and not _is_vendor_keyword_noise(name):
            return name

    # Priority 1b: text before "BILL TO:" on same line
    match = VENDOR_BEFORE_BILLTO_RE.search(text)
    if match:
        name = match.group(1).strip().strip(".:;,")
        if name and name.upper() not in SKIP_HEADERS:
            return name

    # Priority 2: scoring-based selection across all lines
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    if not lines:
        return ""

    n_lines = len(lines)

    # Find seller/buyer keyword lines and first GSTIN line
    seller_lines = set()
    buyer_lines = set()
    gstin_line = -1

    for i, line in enumerate(lines):
        if SELLER_KEYWORDS_RE.search(line):
            seller_lines.add(i)
        if BUYER_KEYWORDS_RE.search(line):
            buyer_lines.add(i)
        if gstin_line < 0:
            if gstin and gstin in line:
                gstin_line = i
            elif re.search(r"\bGSTIN\s*[:\s]", line, re.IGNORECASE):
                gstin_line = i

    best_score = float("-inf")
    best_line = ""

    for i, line in enumerate(lines):
        stripped = line.strip().strip(".:;,")
        if not stripped or stripped.upper() in SKIP_HEADERS:
            continue

        score = _score_vendor_line(
            i, stripped, n_lines, seller_lines, buyer_lines, gstin_line,
        )

        if score > best_score:
            best_score = score
            best_line = stripped

    return best_line


# Words that are not valid invoice numbers (keyword bleed-through)
_INVOICE_NUMBER_REJECTS = {
    "DATED", "DATE", "TOTAL", "AMOUNT", "NUMBER", "INVOICE", "BILL", "TAX",
    "GST", "SUPPLY", "ORIGINAL", "DUPLICATE", "COPY", "RECEIPT",
}

# Keywords that, when preceding a candidate, indicate it's NOT an invoice number
_INVOICE_PREFIX_REJECT_RE = re.compile(
    r"(?:ORDER|REF|IRN|ACK|DELIVERY|CHALLAN|PIN|PINCODE|ZIP"
    r"|E[- ]?WAY|EWAY|TRANSPORT|VEHICLE|PHONE|PH|TEL|FAX|MOBILE"
    r"|HSN|SAC)\s*(?:BILL\s*)?(?:NO\.?|NUMBER|#|ID|CODE)?[.:\s/-]*$",
    re.IGNORECASE,
)


def _looks_like_date(s: str) -> bool:
    """Check if string looks like a date pattern."""
    if re.match(r"\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}$", s):
        return True
    if re.match(r"\d{4}[/\-\.]\d{1,2}[/\-\.]\d{1,2}$", s):
        return True
    return False


def _validate_invoice_candidate(candidate: str, gstin: str, source: str = "") -> bool:
    """Apply strict filters to an invoice number candidate. Return True if valid.

    source: "keyword", "hash", "invoice_fallback", "heuristic" — keyword sources
    get relaxed pure-digit rules since they're higher confidence.
    """
    s = candidate.strip()
    su = s.upper()

    # Reject common non-invoice words
    if su in _INVOICE_NUMBER_REJECTS:
        return False

    # Reject if starts with DATE/DATED (captures date context, not an ID)
    if re.match(r"^DATE[DS]?\b", su):
        return False

    # Reject if it looks like a date
    if _looks_like_date(s):
        return False

    # Reject if pure digits AND too short
    # Keyword sources (BILL NO., INVOICE NO.) allow shorter pure-digit IDs
    min_pure_digit_len = 3 if source in ("keyword", "invoice_fallback") else 4
    if s.isdigit() and len(s) < min_pure_digit_len:
        return False

    # Reject if candidate equals extracted GSTIN
    if gstin and su == gstin.upper():
        return False

    # Reject if GSTIN-like pattern
    if GSTIN_RE.match(su) or GSTIN_RELAXED_RE.match(su):
        return False

    # Reject if only digits and no letters, unless length >= 6
    has_letter = bool(re.search(r"[A-Za-z]", s))
    has_slash = "/" in s
    has_hyphen = "-" in s
    is_pure_digits = bool(re.match(r"^\d+$", s))

    # For heuristic/hash sources: pure digits need length >= 6
    # For keyword sources: pure digits are OK (already passed min length check above)
    is_keyword_source = source in ("keyword", "invoice_fallback")
    if is_pure_digits and not is_keyword_source and len(s) < 6:
        return False

    # Must contain at least one letter OR one "/" OR one "-"
    # Exception: pure digits with length >= 6, or keyword-sourced pure digits
    if not has_letter and not has_slash and not has_hyphen:
        if not (is_pure_digits and (len(s) >= 6 or is_keyword_source)):
            return False

    # Reject if contains only letters and spaces (not an ID)
    if re.match(r"^[A-Za-z\s]+$", s):
        return False

    # Reject if contains common header/document words (multi-word phrases)
    if re.search(r"\b(?:ORIGINAL|DUPLICATE|RECIPIENT|SUPPLIER|BUYER)\b", su):
        return False

    # Reject PIN code patterns (PIN-XXXXXX or PIN XXXXXX)
    if re.match(r"^PIN[:\s-]*\d{6}$", su):
        return False

    # Exclude phone numbers (10+ consecutive digits after removing separators)
    digits_only = re.sub(r"[/\-.]", "", s)
    if re.match(r"\d{10,}$", digits_only):
        return False

    # Exclude CIN patterns (starts with U or L followed by digits)
    if re.match(r"[UL]\d{5}", s):
        return False

    # Exclude UDYAM/PAN-like patterns
    if re.match(r"UDYAM", s, re.IGNORECASE):
        return False
    if re.match(r"[A-Z]{5}\d{4}[A-Z]$", su):
        return False

    return True


def _is_preceded_by_reject_keyword(text: str, match_start: int) -> bool:
    """Check if the text before a match position contains a reject prefix keyword."""
    # Look at up to 40 chars before the match
    prefix = text[max(0, match_start - 40):match_start]
    return bool(_INVOICE_PREFIX_REJECT_RE.search(prefix))


def _score_invoice_candidate(candidate: str, source: str) -> int:
    """Score an invoice number candidate for ranking. Higher = better."""
    score = 0

    # Prefer candidates containing "/"
    if "/" in candidate:
        score += 5

    # Prefer candidates containing "-"
    if "-" in candidate:
        score += 3

    # Prefer length 6-20
    if 6 <= len(candidate) <= 20:
        score += 4
    elif len(candidate) < 6:
        score -= 2

    # Strongly prefer candidates from keyword sources (INVOICE NO, BILL NO, etc.)
    if source == "keyword":
        score += 10
    elif source == "invoice_fallback":
        score += 6
    elif source == "hash":
        score += 4
    elif source == "heuristic":
        score += 1

    return score


def _invoice_number_heuristic(text: str, gstin: str) -> list:
    """Fallback: find structured alphanumeric IDs in top 20% of document.

    Returns list of (candidate, source) tuples.
    """
    lines = text.split("\n")
    top_limit = max(4, len(lines) // 5)
    search_text = "\n".join(lines[:top_limit])

    results = []
    for match in INVOICE_STRUCTURED_ID_RE.finditer(search_text):
        candidate = match.group(1)
        # Must contain at least one digit
        if not re.search(r"\d", candidate):
            continue
        # Minimum 4 chars
        if len(candidate) < 4:
            continue
        if not _validate_invoice_candidate(candidate, gstin):
            continue
        if _is_preceded_by_reject_keyword(search_text, match.start()):
            continue
        results.append((candidate, "heuristic"))

    return results


def extract_invoice_number(text: str, gstin: str = "") -> str:
    """Extract invoice number using keyword patterns with strict filtering.

    Collects all candidates from multiple sources, applies strict validation
    filters, then ranks and returns the best candidate.
    """
    candidates = []  # list of (value, source)

    # Source 1: expanded keyword match
    for match in INVOICE_NUMBER_RE.finditer(text):
        val = match.group(1).strip()
        if val.upper() not in _INVOICE_NUMBER_REJECTS:
            if not _is_preceded_by_reject_keyword(text, match.start()):
                candidates.append((val, "keyword"))

    # Source 2: standalone "# :" pattern (e.g., "# : PIS/21-22/073")
    for match in INVOICE_HASH_RE.finditer(text):
        val = match.group(1).strip()
        if val.upper() not in _INVOICE_NUMBER_REJECTS:
            candidates.append((val, "hash"))

    # Source 3: "INVOICE <id>" without No/Number keyword
    for match in INVOICE_ID_FALLBACK_RE.finditer(text):
        val = match.group(1).strip()
        if val.upper() not in _INVOICE_NUMBER_REJECTS:
            if not _is_preceded_by_reject_keyword(text, match.start()):
                candidates.append((val, "invoice_fallback"))

    # Source 4: heuristic — structured IDs in top 20%
    candidates.extend(_invoice_number_heuristic(text, gstin))

    # Apply strict validation filters
    valid = []
    seen = set()
    for val, source in candidates:
        if val in seen:
            continue
        seen.add(val)
        if _validate_invoice_candidate(val, gstin, source):
            valid.append((val, source))

    if not valid:
        return ""

    # Rank candidates
    valid.sort(key=lambda x: -_score_invoice_candidate(x[0], x[1]))

    return valid[0][0]


def _find_dates_near_keywords(keyword_re, text: str) -> list:
    """Find dates adjacent to keyword matches. Returns list of (position, iso_date)."""
    results = []
    for kw_match in keyword_re.finditer(text):
        remaining = text[kw_match.end():]
        for pidx, pattern in enumerate(DATE_PATTERNS):
            dm = pattern.match(remaining)
            if dm:
                iso = _try_parse_date_match(dm, pidx)
                if iso:
                    results.append((kw_match.start(), iso))
                    break
    return results


_ORDINAL_SUFFIX_RE = re.compile(r"(\d{1,2})(?:ST|ND|RD|TH)\b", re.IGNORECASE)
_MONTH_DOT_RE = re.compile(
    r"\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\.",
    re.IGNORECASE,
)
_TRAILING_TIME_RE = re.compile(r",\s*\d{1,2}:\d{2}\s*(?:A\.?M\.?|P\.?M\.?)?\s*$", re.IGNORECASE | re.MULTILINE)


def _normalize_date_text(text: str) -> str:
    """Preprocess text to handle ordinal suffixes, abbreviated months with dots, and trailing time."""
    text = _ORDINAL_SUFFIX_RE.sub(r"\1", text)
    text = _MONTH_DOT_RE.sub(r"\1", text)
    text = _TRAILING_TIME_RE.sub("", text)
    return text


def extract_invoice_date(text: str) -> str:
    """Extract invoice date with keyword priority, fallback to first valid date."""
    text = _normalize_date_text(text)
    # Priority 1: high-priority keywords (Invoice Date, Bill Date, Dated, etc.)
    dates = _find_dates_near_keywords(DATE_KEYWORD_HIGH_RE, text)
    if dates:
        dates.sort(key=lambda x: x[0])
        return dates[0][1]

    # Priority 2: generic "Date" keyword
    dates = _find_dates_near_keywords(DATE_KEYWORD_LOW_RE, text)
    if dates:
        dates.sort(key=lambda x: x[0])
        return dates[0][1]

    # Priority 3: fallback to first valid date anywhere
    for pidx, pattern in enumerate(DATE_PATTERNS):
        for dm in pattern.finditer(text):
            iso = _try_parse_date_match(dm, pidx)
            if iso:
                return iso

    return ""


def _score_total_keyword(keyword: str, line: str) -> int:
    """Return base score for a total-related keyword match."""
    kw = keyword.upper().strip()
    line_upper = line.upper()
    if re.search(r"GRAND\s*TOTAL|G[\.\-\s]*TOTAL", kw):
        score = 15
    elif re.search(r"INVOICE\s*(?:VALUE|TOTAL)", kw):
        score = 12
    elif re.search(r"NET\s*(?:PAYABLE|AMOUNT|TOTAL)", kw):
        score = 10
    elif re.search(r"AMOUNT\s*(?:PAYABLE|DUE|CHARGEABLE|INCL)", kw):
        score = 8
    elif re.search(r"BILL\s*AMOUNT", kw):
        score = 8
    elif re.search(r"GROSS\s*(?:AMOUNT|TOTAL)", kw):
        score = 7
    elif re.search(r"TOTAL\s*(?:AMOUNT|VALUE|PAYABLE|DUE)", kw):
        score = 8
    else:
        # Plain "TOTAL" — lowest keyword score
        score = 3

    # INCL (inclusive) on the same line: boost (likely final total)
    if re.search(r"\bINCL", line_upper):
        score += 5
    # EXCL (exclusive) on the same line: penalize (likely subtotal)
    if re.search(r"\bEXCL", line_upper):
        score -= 5

    return score


def _extract_amounts_from_line(line: str) -> list[float]:
    """Extract all valid amounts from a single line."""
    results = []
    for m in AMOUNT_RE.finditer(line):
        val = _parse_amount(m.group(1))
        if val is not None and val > 0:
            results.append(val)
    return results


_TOTAL_PRIORITY_RE = re.compile(
    r"(?:GRAND\s*TOTAL|G[\.\-\s]*TOTAL|TOTAL\s*AMOUNT"
    r"|INVOICE\s*(?:VALUE|TOTAL)"
    r"|NET\s*PAYABLE|AMOUNT\s*(?:PAYABLE|DUE|CHARGEABLE)"
    r"|BILL\s*AMOUNT|TOTAL\s*VALUE|TOTAL\s*PRICE"
    r"|TOTAL\s*\(?.*?INCL"
    r"|TOTAL\s*(?:₹|RS\.?|INR)\s*[\d,]"
    r"|TOTAL\s*:\s*(?:₹|RS\.?|INR)?\s*[\d,]"
    r"|(?<!\w)TOTAL\s+(?!QTY|QUANTITY|ITEMS?|PAGES?|UNITS?|WEIGHT|PIECES?|NOS?\.?\s)[\d,.])",
    re.IGNORECASE,
)

# Lines to skip during P1 keyword scan (payment metadata, not total labels)
_TOTAL_SKIP_LINE_RE = re.compile(
    r"(?:PAYMENT|TRANSACTION|MODE\s*OF\s*PAYMENT)",
    re.IGNORECASE,
)

_TOTAL_EXCLUDE_LINE_RE = re.compile(
    r"(?:SUB\s*TOTAL|TAXABLE|CGST|SGST|IGST|UTGST|ROUND\s*OFF"
    r"|DISCOUNT|BALANCE|PREV|ITEM\(?S?\)?\s*TOTAL"
    r"|IFSC|ACCOUNT\s*NO|BANK\s*DETAIL|HSN"
    r"|SHIPPING|DELIVERY\s*CHARGE|CESS|TCS|TDS)",
    re.IGNORECASE,
)


def _extract_monetary_amounts(line: str) -> list[tuple[float, str]]:
    """Extract plausible monetary amounts from a line.

    Returns list of (parsed_float, raw_match_string) tuples, preserving
    match order (left-to-right). Filtering is applied on the raw match
    string before inclusion.

    Rejection rules (applied on raw match string):
    - Pure digit strings > 8 digits without comma/decimal/currency → ID/phone
    - Exactly 8 digits with no comma and no decimal → likely HSN code
    - Exactly 4 digits matching 2000–2099 → likely year
    - Value > 100,000,000 → unrealistic invoice total
    """
    results = []
    prev_end = -1
    for m in AMOUNT_RE.finditer(line):
        raw = m.group(1)
        val = _parse_amount(raw)
        if val is None or val <= 0:
            continue
        # Skip fragment from split high-precision number (e.g., "116.8199" → "116.81" + "99")
        if prev_end >= 0 and m.start(1) == prev_end:
            continue
        prev_end = m.end(1)
        has_comma = "," in raw
        has_decimal = "." in raw
        full = m.group(0)
        has_currency = bool(re.match(r"(?:RS\.?|INR|₹)", full, re.IGNORECASE))
        digits_only = raw.replace(",", "").replace(".", "")
        # Reject: pure digit strings > 8 digits without formatting (IDs/phones)
        if len(digits_only) > 8 and not has_comma and not has_decimal and not has_currency:
            continue
        # Reject: exactly 8 digits, no comma, no decimal → likely HSN code
        if len(digits_only) == 8 and not has_comma and not has_decimal:
            continue
        # Reject: exactly 4 digits matching year 2000–2099
        if len(digits_only) == 4 and not has_comma and not has_decimal:
            try:
                year_val = int(digits_only)
                if 2000 <= year_val <= 2099:
                    continue
            except ValueError:
                pass
        # Cap at 10 crore (100 million)
        if val > 100_000_000:
            continue
        results.append((val, raw))
    return results


def extract_total_amount(text: str, footer_text: str = "") -> float:
    """Extract total amount using deterministic priority rules.

    Priority 1: Lines containing GRAND TOTAL / INVOICE VALUE / TOTAL: / etc.
                 → rightmost valid monetary amount on that line.
                 If keyword line has no valid amounts, check the next line.
                 Skip lines containing payment/transaction metadata.
                 Runs on full text (to catch first invoice on multi-page PDFs).
    Priority 2: After last tax line (CGST/SGST/IGST), largest monetary amount
                 on non-excluded lines. Runs on footer_text if provided.
    Priority 3: Largest monetary amount in entire text on non-excluded lines.
                 Runs on footer_text if provided.
    """
    lines = text.split("\n")

    # --- Priority 1: High-confidence total keywords (full text) ---
    for i, line in enumerate(lines):
        if _TOTAL_SKIP_LINE_RE.search(line):
            continue
        if _TOTAL_EXCLUDE_LINE_RE.search(line):
            continue
        if _TOTAL_PRIORITY_RE.search(line):
            candidates = _extract_monetary_amounts(line)
            if candidates:
                return candidates[-1][0]  # rightmost value
            # P1 keyword matched but no positive amounts — check for zero amounts
            # (e.g., "TOTAL INR 0.0" on zero-value invoices)
            if AMOUNT_RE.search(line):
                for m in AMOUNT_RE.finditer(line):
                    val = _parse_amount(m.group(1))
                    if val is not None and val == 0.0:
                        return 0.0
            # Keyword found but no valid amounts → check next line
            if i + 1 < len(lines):
                next_candidates = _extract_monetary_amounts(lines[i + 1])
                if next_candidates:
                    return next_candidates[-1][0]

    # P2 and P3 use footer_text if provided (prevents item-price false positives)
    p2p3_lines = (footer_text or text).split("\n")

    # --- Priority 2: After last tax line, largest amount on clean lines ---
    last_tax_idx = -1
    for i, line in enumerate(p2p3_lines):
        if CGST_KEYWORD_RE.search(line) or SGST_KEYWORD_RE.search(line) or IGST_KEYWORD_RE.search(line):
            last_tax_idx = i

    if last_tax_idx >= 0:
        best = 0.0
        for i in range(last_tax_idx + 1, len(p2p3_lines)):
            if _TOTAL_EXCLUDE_LINE_RE.search(p2p3_lines[i]):
                continue
            for val, _raw in _extract_monetary_amounts(p2p3_lines[i]):
                if val > best:
                    best = val
        if best > 0:
            return best

    # --- Priority 3: Largest amount in text excluding keyword lines ---
    best = 0.0
    for line in p2p3_lines:
        if _TOTAL_EXCLUDE_LINE_RE.search(line):
            continue
        for val, _raw in _extract_monetary_amounts(line):
            if val > best:
                best = val

    return best


def _extract_tax_line_based(keyword_re: re.Pattern, text: str) -> float:
    """Extract tax amount by finding keyword on a line, then extracting the last amount on that line.

    Skips amounts immediately followed by '%' (tax rate, not monetary value).
    """
    last_val = 0.0
    for line in text.split("\n"):
        if keyword_re.search(line):
            # Find all amounts on this line, filtering out percentages
            monetary_amounts = []
            for m in AMOUNT_RE.finditer(line):
                # Check if this amount is followed by '%' (percentage, not monetary)
                after = line[m.end():].lstrip()
                if after.startswith("%"):
                    continue
                val = _parse_amount(m.group(1))
                if val is not None and val > 0:
                    monetary_amounts.append(val)
            # Use the last monetary amount on the line
            if monetary_amounts:
                last_val = monetary_amounts[-1]
    return last_val


def extract_taxes(text: str) -> dict:
    """Extract CGST, SGST, IGST and apply tax logic."""
    cgst = _extract_tax_line_based(CGST_KEYWORD_RE, text)
    sgst = _extract_tax_line_based(SGST_KEYWORD_RE, text)
    igst = _extract_tax_line_based(IGST_KEYWORD_RE, text)

    # Tax logic: mutual exclusivity
    if cgst > 0 and sgst > 0:
        igst = 0.0
    elif igst > 0:
        cgst = 0.0
        sgst = 0.0

    return {"cgst": cgst, "sgst": sgst, "igst": igst}


def compute_confidence(data: dict) -> int:
    """Compute confidence score based on PRD Section 10 rules."""
    score = 100

    # GSTIN
    if not data.get("gstin"):
        if data.get("_gstin_raw"):
            score -= 15  # present but invalid
        else:
            score -= 25  # missing

    # Invoice number
    if not data.get("invoice_number"):
        score -= 15

    # Invoice date
    if not data.get("invoice_date"):
        score -= 15

    # Total amount
    total = data.get("total_amount", 0.0)
    if total <= 0:
        if data.get("_total_raw"):
            score -= 10  # present but zero/negative
        else:
            score -= 25  # missing

    # Vendor name
    if not data.get("vendor_name"):
        score -= 10

    # Tax breakdown
    cgst = data.get("cgst", 0.0)
    sgst = data.get("sgst", 0.0)
    igst = data.get("igst", 0.0)
    tax_total = cgst + sgst + igst
    if tax_total == 0:
        score -= 10
    else:
        if total > 0 and tax_total > total:
            score -= 5  # tax > total
        if cgst > 0 and sgst > 0 and cgst != sgst:
            score -= 5  # CGST != SGST

    return max(0, score)


def _build_zones(text: str) -> dict:
    """Split text into header/body/footer zones based on proportional line indices.

    Returns dict with keys: header, body, footer, full, debug.
    Each zone value is a newline-joined string of that zone's lines.
    Zone boundaries: header = first 30% of lines, footer = last 30% of lines.
    """
    lines = [l for l in text.split("\n") if l.strip()]
    n = len(lines)
    if n == 0:
        return {
            "header": "", "body": "", "footer": "", "full": text,
            "debug": {"total_lines": 0, "header_end": 0, "footer_start": 0,
                       "body_line_count": 0},
        }

    # Overlapping zones: header = top 50%, footer = bottom 50%
    # This avoids the boundary-cut problem where fields fall in a dead zone.
    header_end = max(1, int(n * 0.50))
    footer_start = max(1, int(n * 0.50))

    header_lines = lines[:header_end]
    body_lines = lines[header_end:footer_start]
    footer_lines = lines[footer_start:]

    debug = {
        "total_lines": n,
        "header_end": header_end,
        "footer_start": footer_start,
        "header_line_count": len(header_lines),
        "body_line_count": len(body_lines),
        "footer_line_count": len(footer_lines),
    }

    return {
        "header": "\n".join(header_lines),
        "body": "\n".join(body_lines),
        "footer": "\n".join(footer_lines),
        "full": text,
        "debug": debug,
    }


def extract_all(text: str) -> dict:
    """Run full extraction pipeline on normalized text. Returns output schema dict.

    Uses zone-based structural extraction: fields are searched only in their
    expected document zone (header/footer) to reduce false positives.
    Falls back to full text if zone-restricted search yields no result.
    """
    zones = _build_zones(text)
    header = zones["header"]
    body = zones["body"]
    footer = zones["footer"]
    full = zones["full"]
    dbg = zones["debug"]

    debug_log = []
    debug_log.append(
        "ZONE DEBUG: total_lines=%d header_end=%d footer_start=%d "
        "header=%d footer=%d"
        % (dbg["total_lines"], dbg["header_end"], dbg["footer_start"],
           dbg["header_line_count"], dbg["footer_line_count"])
    )

    # --- GSTIN: header zone first, fallback to full ---
    gstin = extract_gstin(header)
    if not gstin:
        gstin = extract_gstin(full)
        debug_log.append("ZONE DEBUG: gstin zone=FULL (header miss)")
    else:
        debug_log.append("ZONE DEBUG: gstin zone=HEADER value=%s" % gstin)

    gstin_raw = bool(
        GSTIN_RE.search(text) or GSTIN_RELAXED_RE.search(text)
        or GSTIN_KEYWORD_RE.search(text)
    )

    # --- Vendor Name: header zone first, fallback to full ---
    vendor_name = extract_vendor_name(header, gstin)
    if not vendor_name:
        vendor_name = extract_vendor_name(full, gstin)
        debug_log.append("ZONE DEBUG: vendor_name zone=FULL (header miss)")
    else:
        debug_log.append("ZONE DEBUG: vendor_name zone=HEADER")

    # --- Invoice Number: header zone, then expanded header (no footer/full fallback) ---
    invoice_number = extract_invoice_number(header, gstin)
    if invoice_number:
        debug_log.append("ZONE DEBUG: invoice_number zone=HEADER value=%s" % repr(invoice_number))
    else:
        # Expand to top 75% of document (header + first half of remaining lines)
        all_lines = [l for l in full.split("\n") if l.strip()]
        expanded_end = max(dbg["header_end"], int(dbg["total_lines"] * 0.75))
        expanded_lines = all_lines[:expanded_end]
        expanded_header = "\n".join(expanded_lines)
        invoice_number = extract_invoice_number(expanded_header, gstin)
        debug_log.append(
            "ZONE DEBUG: invoice_number zone=EXPANDED_HEADER (top %d/%d lines) value=%s"
            % (expanded_end, dbg["total_lines"], repr(invoice_number))
        )

    # --- Invoice Date: header zone first, fallback to full ---
    invoice_date = extract_invoice_date(header)
    if not invoice_date:
        invoice_date = extract_invoice_date(full)
        debug_log.append("ZONE DEBUG: invoice_date zone=FULL (header miss)")
    else:
        debug_log.append("ZONE DEBUG: invoice_date zone=HEADER")

    # --- Total Amount: P1 on full text (multi-page support), P2/P3 on footer ---
    total_amount = extract_total_amount(full, footer_text=footer)
    debug_log.append("ZONE DEBUG: total_amount zone=FULL+FOOTER value=%.2f" % total_amount)

    # --- Taxes: footer zone first, fallback to full ---
    taxes = extract_taxes(footer)
    if taxes["cgst"] == 0.0 and taxes["sgst"] == 0.0 and taxes["igst"] == 0.0:
        taxes = extract_taxes(full)
        debug_log.append("ZONE DEBUG: taxes zone=FULL (footer miss)")
    else:
        debug_log.append("ZONE DEBUG: taxes zone=FOOTER")

    for msg in debug_log:
        logger.debug(msg)

    data = {
        "vendor_name": vendor_name,
        "gstin": gstin,
        "invoice_number": invoice_number,
        "invoice_date": invoice_date,
        "total_amount": total_amount,
        "cgst": taxes["cgst"],
        "sgst": taxes["sgst"],
        "igst": taxes["igst"],
        "_gstin_raw": gstin_raw and not gstin,
        "_total_raw": bool(TOTAL_KEYWORD_RE.search(text)),
    }

    data["confidence_score"] = compute_confidence(data)

    # Remove internal keys
    del data["_gstin_raw"]
    del data["_total_raw"]

    return data
