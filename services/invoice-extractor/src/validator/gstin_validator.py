import re


# Valid state codes: 01-38
_VALID_STATE_CODES = {str(i).zfill(2) for i in range(1, 39)}

# GSTIN structure: 2-digit state + 10-char PAN + entity number + Z + checksum
_GSTIN_STRUCTURE_RE = re.compile(
    r"^(\d{2})([A-Z]{5}[0-9]{4}[A-Z])([A-Z0-9])(Z)([A-Z0-9])$"
)

# Character set for Luhn mod 36
_LUHN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
_CHAR_TO_VAL = {ch: i for i, ch in enumerate(_LUHN_CHARS)}


def _luhn_mod36_checksum(gstin_14: str) -> str:
    """Compute Luhn mod 36 checksum for the first 14 characters of a GSTIN."""
    factor = 2
    total = 0
    for i in range(len(gstin_14) - 1, -1, -1):
        code_point = _CHAR_TO_VAL.get(gstin_14[i], 0)
        addend = factor * code_point
        factor = 1 if factor == 2 else 2
        addend = (addend // 36) + (addend % 36)
        total += addend
    remainder = total % 36
    check_code_point = (36 - remainder) % 36
    return _LUHN_CHARS[check_code_point]


def validate_gstin(gstin: str) -> bool:
    """Validate a GSTIN string.

    Checks:
    - Length = 15
    - Characters 1-2: valid state code (01-38)
    - Characters 3-12: valid PAN structure
    - Character 13: alphanumeric (entity number)
    - Character 14: Z (fixed)
    - Character 15: checksum (Luhn mod 36)
    """
    if not gstin or len(gstin) != 15:
        return False

    gstin = gstin.upper()
    match = _GSTIN_STRUCTURE_RE.match(gstin)
    if not match:
        return False

    state_code = match.group(1)
    if state_code not in _VALID_STATE_CODES:
        return False

    # Verify checksum
    expected_checksum = _luhn_mod36_checksum(gstin[:14])
    return gstin[14] == expected_checksum
