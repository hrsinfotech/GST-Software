import logging

from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter

logger = logging.getLogger(__name__)

HEADERS = [
    "Vendor Name",
    "GSTIN",
    "Invoice Number",
    "Invoice Date",
    "Total Amount",
    "CGST",
    "SGST",
    "IGST",
]


def export_to_excel(data: dict, output_path: str) -> bool:
    """Export extracted data to an Excel file.

    Returns True on success, False if the file is locked or write fails.
    """
    wb = Workbook()
    ws = wb.active
    ws.title = "Invoice Data"

    # Write bold headers
    bold_font = Font(bold=True)
    for col_idx, header in enumerate(HEADERS, start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font = bold_font

    # Write data row
    row = [
        data.get("vendor_name", ""),
        data.get("gstin", ""),
        data.get("invoice_number", ""),
        data.get("invoice_date", ""),
        data.get("total_amount", 0.0),
        data.get("cgst", 0.0),
        data.get("sgst", 0.0),
        data.get("igst", 0.0),
    ]
    for col_idx, value in enumerate(row, start=1):
        ws.cell(row=2, column=col_idx, value=value)

    # Auto-fit column widths
    for col_idx in range(1, len(HEADERS) + 1):
        col_letter = get_column_letter(col_idx)
        max_len = len(str(HEADERS[col_idx - 1]))
        cell_val = str(row[col_idx - 1])
        max_len = max(max_len, len(cell_val))
        ws.column_dimensions[col_letter].width = max_len + 2

    try:
        wb.save(output_path)
        logger.info("Excel exported: %s", output_path)
        return True
    except PermissionError:
        logger.error("Cannot write to %s — file may be open. Skipping Excel export.", output_path)
        return False
