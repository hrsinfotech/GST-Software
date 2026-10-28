BEGIN;

CREATE TABLE IF NOT EXISTS public.payments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_id BIGINT NOT NULL
        REFERENCES public.invoices(id) ON DELETE RESTRICT,
    payment_date DATE NOT NULL,
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(50) NOT NULL DEFAULT 'Bank transfer',
    reference_number VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice_id
    ON public.payments(invoice_id);

CREATE INDEX IF NOT EXISTS idx_payments_payment_date
    ON public.payments(payment_date);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_reference_number
    ON public.payments(reference_number)
    WHERE reference_number IS NOT NULL
      AND reference_number <> '';

COMMIT;
