BEGIN;

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS taxable_value NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0
        CHECK (discount_amount >= 0),
    ADD COLUMN IF NOT EXISTS other_charges NUMERIC(14,2) NOT NULL DEFAULT 0
        CHECK (other_charges >= 0),
    ADD COLUMN IF NOT EXISTS cess NUMERIC(14,2) NOT NULL DEFAULT 0
        CHECK (cess >= 0);

ALTER TABLE invoices
    ADD CONSTRAINT invoices_taxable_value_nonnegative
    CHECK (taxable_value IS NULL OR taxable_value >= 0);

COMMIT;
