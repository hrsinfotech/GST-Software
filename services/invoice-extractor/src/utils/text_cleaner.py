import re
import unicodedata


# Currency symbols to preserve during normalization
_CURRENCY_SYMBOLS = {"₹", "$"}

# Unicode → ASCII replacements
_UNICODE_REPLACEMENTS = {
    "\u2018": "'",   # left single curly quote
    "\u2019": "'",   # right single curly quote
    "\u201c": '"',   # left double curly quote
    "\u201d": '"',   # right double curly quote
    "\u2013": "-",   # en-dash
    "\u2014": "-",   # em-dash
    "\u2026": "...", # ellipsis
    "\u00a0": " ",   # non-breaking space
}

# Control characters to remove: 0x00-0x1F (except \t=0x09, \n=0x0A), 0x7F, 0x80-0x9F
_CONTROL_CHAR_RE = re.compile(
    r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\x80-\x9f]"
)

# Multiple consecutive spaces (not newlines)
_MULTI_SPACE_RE = re.compile(r"[^\S\n]+")


def clean_text(raw_text: str) -> str:
    """Normalize OCR output text following PRD Section 6.3 rules.

    Steps (in order):
    1. Convert to uppercase
    2. Preserve line breaks
    3. Replace multiple spaces with single space
    4. Remove non-printable / control characters (keep \\n, \\t)
    5. Remove stray control characters (0x7F, 0x80-0x9F)
    6. Normalize Unicode to ASCII where possible
    7. Do NOT remove currency symbols
    """
    if not raw_text:
        return ""

    text = raw_text

    # Step 6: Unicode normalization (before uppercasing so replacements are correct)
    for uchar, ascii_char in _UNICODE_REPLACEMENTS.items():
        text = text.replace(uchar, ascii_char)

    # Decompose remaining Unicode, drop combining marks, but keep currency symbols
    normalized = []
    for ch in unicodedata.normalize("NFD", text):
        if ch in _CURRENCY_SYMBOLS:
            normalized.append(ch)
        elif unicodedata.category(ch) == "Mn":
            continue  # skip combining marks
        else:
            normalized.append(ch)
    text = "".join(normalized)

    # Step 1: Convert to uppercase
    text = text.upper()

    # Steps 4 & 5: Remove control characters (keep \n and \t)
    text = _CONTROL_CHAR_RE.sub("", text)

    # Step 3: Replace multiple spaces/tabs (not newlines) with single space
    # Process line by line to preserve line breaks (step 2)
    lines = text.split("\n")
    lines = [_MULTI_SPACE_RE.sub(" ", line).strip() for line in lines]
    text = "\n".join(lines)

    return text
