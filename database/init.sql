CREATE TABLE IF NOT EXISTS vendors (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    vendor_name VARCHAR(200) NOT NULL,
    gstin VARCHAR(15),
    email VARCHAR(254),
    phone VARCHAR(30),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendors_gstin
    ON vendors (gstin)
    WHERE gstin IS NOT NULL AND gstin <> '';

CREATE TABLE IF NOT EXISTS invoices (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_number VARCHAR(100) NOT NULL,
    vendor_id BIGINT REFERENCES vendors(id),
    vendor_name VARCHAR(200) NOT NULL,
    gstin VARCHAR(15),
    invoice_date DATE,
    total_amount NUMERIC(14,2) NOT NULL CHECK (total_amount >= 0),
    cgst NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (cgst >= 0),
    sgst NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (sgst >= 0),
    igst NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (igst >= 0),
    status VARCHAR(30) NOT NULL DEFAULT 'Pending approval'
        CHECK (status IN ('Pending approval', 'Approved', 'Rejected',
                          'Overdue', 'Paid', 'Processing')),
    source VARCHAR(50) NOT NULL DEFAULT 'Manual',
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_vendor ON invoices(vendor_id);