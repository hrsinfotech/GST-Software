import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import pg from "pg";
import { resolve } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: resolve(process.cwd(), "../../database/.env") });

const { Pool } = pg;
const app = express();
const port = Number(process.env.API_PORT || 8099);

const pool = new Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5437),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  connectionTimeoutMillis: 5000
});

const allowedStatuses = [
  "Pending approval", "Approved", "Rejected",
  "Overdue", "Paid", "Processing"
] as const;

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

function asyncRoute(
  handler: (req: Request, res: Response) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function amount(value: unknown, field: string, required = false): number {
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw Object.assign(new Error(`${field} is required`), { status: 400 });
    }
    return 0;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw Object.assign(
      new Error(`${field} must be a non-negative number`),
      { status: 400 }
    );
  }
  return Math.round(parsed * 100) / 100;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

function badRequest(message: string) {
  return Object.assign(new Error(message), { status: 400 });
}

app.get("/health", asyncRoute(async (_req, res) => {
  const result = await pool.query(
    "SELECT current_database() AS database_name"
  );
  res.json({
    status: "ok",
    service: "hrs-tech-ai-ap-api",
    database: result.rows[0].database_name
  });
}));

// -------------------- INVOICES --------------------

app.get("/api/v1/invoices", asyncRoute(async (req, res) => {
  const status = text(req.query.status);
  const search = text(req.query.search);
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);

  if (status && !allowedStatuses.includes(
    status as typeof allowedStatuses[number]
  )) {
    return res.status(400).json({ error: "Invalid invoice status" });
  }

  const result = await pool.query(
    `SELECT id, invoice_number, vendor_id, vendor_name, gstin, invoice_date,
            total_amount, cgst, sgst, igst, taxable_value, discount_amount,
            other_charges, cess, status, source, approved_at, created_at, updated_at
       FROM public.invoices
      WHERE ($1 = '' OR status = $1)
        AND ($2 = '' OR invoice_number ILIKE '%' || $2 || '%'
             OR vendor_name ILIKE '%' || $2 || '%'
             OR COALESCE(gstin, '') ILIKE '%' || $2 || '%')
      ORDER BY created_at DESC, id DESC
      LIMIT $3`,
    [status, search, limit]
  );

  res.json({ invoices: result.rows });
}));

app.post("/api/v1/invoices", asyncRoute(async (req, res) => {
  const body = req.body ?? {};
  const invoiceNumber = text(body.invoice_number);
  const vendorName = text(body.vendor_name);
  const gstin = text(body.gstin) || null;
  const invoiceDate = text(body.invoice_date) || null;
  const source = text(body.source) || "OCR";

  if (!invoiceNumber || invoiceNumber.length > 100) {
    return res.status(400).json({
      error: "A valid invoice_number (maximum 100 characters) is required"
    });
  }
  if (!vendorName || vendorName.length > 200) {
    return res.status(400).json({
      error: "A valid vendor_name (maximum 200 characters) is required"
    });
  }
  if (gstin && gstin.length > 15) {
    return res.status(400).json({ error: "GSTIN cannot exceed 15 characters" });
  }
  if (invoiceDate && !validDate(invoiceDate)) {
    return res.status(400).json({
      error: "invoice_date must be a real date in YYYY-MM-DD format"
    });
  }

  const total = amount(body.total_amount, "total_amount", true);
  const cgst = amount(body.cgst, "cgst");
  const sgst = amount(body.sgst, "sgst");
  const igst = amount(body.igst, "igst");
  const taxableValue =
    body.taxable_value === undefined ||
    body.taxable_value === null ||
    body.taxable_value === ""
      ? null
      : amount(body.taxable_value, "taxable_value");
  const discountAmount = amount(body.discount_amount, "discount_amount");
  const otherCharges = amount(body.other_charges, "other_charges");
  const cess = amount(body.cess, "cess");

  if (Math.round((cgst + sgst + igst) * 100) / 100 > total + 0.01) {
    return res.status(400).json({
      error: "CGST, SGST and IGST cannot exceed the invoice total."
    });
  }

  if (taxableValue !== null) {
    const expectedTotal = Math.round(
      (taxableValue + cgst + sgst + igst + otherCharges + cess) * 100
    ) / 100;

    if (Math.abs(expectedTotal - total) > 0.01) {
      return res.status(400).json({
        error: `Invoice total reconciliation failed: expected ${expectedTotal.toFixed(2)}.`
      });
    }
  }

  if (igst > 0 && (cgst > 0 || sgst > 0)) {
    return res.status(400).json({
      error: "IGST cannot be combined with CGST or SGST for an ordinary taxable supply."
    });
  }

  const result = await pool.query(
    `INSERT INTO public.invoices
       (invoice_number, vendor_name, gstin, invoice_date, total_amount,
        cgst, sgst, igst, taxable_value, discount_amount, other_charges,
        cess, status, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'Pending approval',$13)
     RETURNING *`,
    [
      invoiceNumber, vendorName, gstin, invoiceDate, total, cgst, sgst,
      igst, taxableValue, discountAmount, otherCharges, cess, source
    ]
  );

  res.status(201).json({ invoice: result.rows[0] });
}));

app.post("/api/v1/invoices/:id/link-vendor", asyncRoute(async (req, res) => {
  const id = text(req.params.id);
  const vendorId = text(req.body?.vendor_id);

  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: "Invalid invoice ID" });
  }
  if (!/^\d+$/.test(vendorId)) {
    return res.status(400).json({ error: "A valid vendor_id is required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const invoiceResult = await client.query(
      `SELECT id, invoice_number, vendor_id, gstin
         FROM public.invoices
        WHERE id = $1
        FOR UPDATE`,
      [id]
    );
    if (invoiceResult.rowCount === 0) {
      throw Object.assign(new Error("Invoice not found"), { status: 404 });
    }

    const vendorResult = await client.query(
      `SELECT id, vendor_name, gstin, is_active
         FROM public.vendors
        WHERE id = $1`,
      [vendorId]
    );
    if (vendorResult.rowCount === 0) {
      throw Object.assign(new Error("Vendor not found"), { status: 404 });
    }

    const invoice = invoiceResult.rows[0];
    const vendor = vendorResult.rows[0];

    if (!vendor.is_active) {
      throw badRequest("Cannot link an invoice to an inactive vendor");
    }
    if (!invoice.gstin || !vendor.gstin) {
      throw badRequest("Both invoice and vendor must have a GSTIN to verify this link");
    }
    if (String(invoice.gstin).trim().toUpperCase() !==
        String(vendor.gstin).trim().toUpperCase()) {
      throw badRequest("Vendor GSTIN does not match the invoice GSTIN; invoice was not linked");
    }

    const updated = await client.query(
      `UPDATE public.invoices
          SET vendor_id = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *`,
      [vendorId, id]
    );

    await client.query("COMMIT");
    res.json({ invoice: updated.rows[0], linked_vendor: vendor });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));
app.patch("/api/v1/invoices/:id/status", asyncRoute(async (req, res) => {
  const id = text(req.params.id);
  const status = text(req.body?.status);

  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: "Invalid invoice ID" });
  }
  if (!allowedStatuses.includes(status as typeof allowedStatuses[number])) {
    return res.status(400).json({ error: "Invalid invoice status" });
  }

  const result = await pool.query(
    `UPDATE public.invoices
        SET status = $1,
            approved_at = CASE WHEN $1 = 'Approved' THEN NOW()
                               WHEN $1 = 'Pending approval' THEN NULL
                               ELSE approved_at END,
            updated_at = NOW()
      WHERE id = $2
      RETURNING *`,
    [status, id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Invoice not found" });
  }
  res.json({ invoice: result.rows[0] });
}));

// -------------------- VENDORS --------------------

app.get("/api/v1/vendors", asyncRoute(async (req, res) => {
  const search = text(req.query.search);

  const result = await pool.query(
    `SELECT v.id, v.vendor_name, v.gstin, v.email, v.phone,
            v.is_active, v.created_at, v.updated_at,
            COUNT(i.id)::int AS invoice_count,
            COALESCE(SUM(i.total_amount) FILTER (
              WHERE i.status <> 'Paid' AND i.status <> 'Rejected'
            ), 0) AS open_balance
       FROM public.vendors v
       LEFT JOIN public.invoices i ON i.vendor_id = v.id
      WHERE ($1 = '' OR v.vendor_name ILIKE '%' || $1 || '%'
             OR COALESCE(v.gstin, '') ILIKE '%' || $1 || '%')
      GROUP BY v.id
      ORDER BY v.vendor_name ASC`,
    [search]
  );

  res.json({ vendors: result.rows });
}));

app.post("/api/v1/vendors", asyncRoute(async (req, res) => {
  const body = req.body ?? {};
  const vendorName = text(body.vendor_name);
  const gstin = text(body.gstin).toUpperCase() || null;
  const email = text(body.email) || null;
  const phone = text(body.phone) || null;

  if (!vendorName || vendorName.length > 200) {
    return res.status(400).json({
      error: "vendor_name is required and must not exceed 200 characters"
    });
  }
  if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) {
    return res.status(400).json({
      error: "GSTIN must contain exactly 15 letters or digits"
    });
  }
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }
  if (phone && phone.length > 30) {
    return res.status(400).json({ error: "Phone cannot exceed 30 characters" });
  }

  const result = await pool.query(
    `INSERT INTO public.vendors (vendor_name, gstin, email, phone)
     VALUES ($1, $2, $3, $4)
     RETURNING id, vendor_name, gstin, email, phone, is_active, created_at, updated_at`,
    [vendorName, gstin, email, phone]
  );

  res.status(201).json({ vendor: result.rows[0] });
}));

// -------------------- PAYMENTS --------------------

app.get("/api/v1/payments", asyncRoute(async (req, res) => {
  const fromDate = text(req.query.fromDate);
  const toDate = text(req.query.toDate);
  const invoiceId = text(req.query.invoiceId);

  if (fromDate && !validDate(fromDate)) {
    return res.status(400).json({ error: "fromDate must use YYYY-MM-DD format" });
  }
  if (toDate && !validDate(toDate)) {
    return res.status(400).json({ error: "toDate must use YYYY-MM-DD format" });
  }
  if (fromDate && toDate && fromDate > toDate) {
    return res.status(400).json({ error: "fromDate must not be after toDate" });
  }
  if (invoiceId && !/^\d+$/.test(invoiceId)) {
    return res.status(400).json({ error: "Invalid invoiceId" });
  }

  const result = await pool.query(
    `SELECT p.id, p.invoice_id, p.payment_date, p.amount, p.payment_method,
            p.reference_number, p.notes, p.created_at,
            i.invoice_number, i.vendor_name, i.total_amount
       FROM public.payments p
       JOIN public.invoices i ON i.id = p.invoice_id
      WHERE ($1 = '' OR p.payment_date >= $1::date)
        AND ($2 = '' OR p.payment_date <= $2::date)
        AND ($3 = '' OR p.invoice_id = $3::bigint)
      ORDER BY p.payment_date DESC, p.id DESC
      LIMIT 500`,
    [fromDate, toDate, invoiceId]
  );

  res.json({ payments: result.rows });
}));

app.post("/api/v1/payments", asyncRoute(async (req, res) => {
  const body = req.body ?? {};
  const invoiceId = text(body.invoice_id);
  const paymentDate = text(body.payment_date);
  const paymentMethod = text(body.payment_method) || "Bank transfer";
  const referenceNumber = text(body.reference_number) || null;
  const notes = text(body.notes) || null;
  const paymentAmount = amount(body.amount, "amount", true);

  if (!/^\d+$/.test(invoiceId)) {
    return res.status(400).json({ error: "A valid invoice_id is required" });
  }
  if (!validDate(paymentDate)) {
    return res.status(400).json({
      error: "payment_date must be a real date in YYYY-MM-DD format"
    });
  }
  if (paymentAmount <= 0) {
    return res.status(400).json({ error: "Payment amount must be greater than zero" });
  }
  if (paymentMethod.length > 50) {
    return res.status(400).json({ error: "Payment method cannot exceed 50 characters" });
  }
  if (referenceNumber && referenceNumber.length > 100) {
    return res.status(400).json({ error: "Reference number cannot exceed 100 characters" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const invoiceResult = await client.query(
      `SELECT id, invoice_number, vendor_name, total_amount, status
         FROM public.invoices
        WHERE id = $1
        FOR UPDATE`,
      [invoiceId]
    );

    if (invoiceResult.rowCount === 0) {
      throw Object.assign(new Error("Invoice not found"), { status: 404 });
    }

    const invoice = invoiceResult.rows[0];
    if (invoice.status === "Rejected") {
      throw badRequest("Payments cannot be recorded against a rejected invoice");
    }

    const paidResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS paid_amount
         FROM public.payments
        WHERE invoice_id = $1`,
      [invoiceId]
    );

    const totalAmount = Number(invoice.total_amount);
    const alreadyPaid = Number(paidResult.rows[0].paid_amount);
    const remaining = Math.round((totalAmount - alreadyPaid) * 100) / 100;

    if (paymentAmount > remaining + 0.001) {
      throw badRequest(
        `Payment exceeds the remaining balance of ${remaining.toFixed(2)}`
      );
    }

    const inserted = await client.query(
      `INSERT INTO public.payments
         (invoice_id, payment_date, amount, payment_method, reference_number, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [invoiceId, paymentDate, paymentAmount, paymentMethod, referenceNumber, notes]
    );

    const newPaid = Math.round((alreadyPaid + paymentAmount) * 100) / 100;
    const fullyPaid = newPaid >= totalAmount - 0.001;

    if (fullyPaid) {
      await client.query(
        `UPDATE public.invoices
            SET status = 'Paid', updated_at = NOW()
          WHERE id = $1 AND status <> 'Rejected'`,
        [invoiceId]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      payment: {
        ...inserted.rows[0],
        invoice_number: invoice.invoice_number,
        vendor_name: invoice.vendor_name
      },
      total_amount: totalAmount,
      previously_paid: alreadyPaid,
      total_paid: newPaid,
      remaining_balance: Math.max(0, Math.round((totalAmount - newPaid) * 100) / 100),
      invoice_marked_paid: fullyPaid
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

// -------------------- GST REPORT --------------------

app.get("/api/v1/reports/gst", asyncRoute(async (req, res) => {
  const fromDate = text(req.query.fromDate);
  const toDate = text(req.query.toDate);

  if (!validDate(fromDate) || !validDate(toDate)) {
    return res.status(400).json({
      error: "Valid fromDate and toDate are required in YYYY-MM-DD format"
    });
  }
  if (fromDate > toDate) {
    return res.status(400).json({
      error: "fromDate must not be after toDate"
    });
  }

  const result = await pool.query(
    `SELECT id, invoice_number, vendor_name, gstin, invoice_date,
            total_amount, taxable_value, cgst, sgst, igst, cess,
            other_charges, discount_amount, status, source
       FROM public.invoices
      WHERE invoice_date >= $1::date
        AND invoice_date <= $2::date
      ORDER BY invoice_date ASC, invoice_number ASC`,
    [fromDate, toDate]
  );

  const invoices = result.rows;
  const sum = (key: string) =>
    invoices.reduce((total, row) => total + Number(row[key] || 0), 0);

  const missingTaxableValueCount = invoices.filter(
    row => row.taxable_value === null || row.taxable_value === undefined
  ).length;

  const invoicesWithValidation = invoices.map(row => {
    const flags: string[] = [];
    const total = Number(row.total_amount || 0);
    const taxable = row.taxable_value === null || row.taxable_value === undefined
      ? null
      : Number(row.taxable_value);
    const cgst = Number(row.cgst || 0);
    const sgst = Number(row.sgst || 0);
    const igst = Number(row.igst || 0);
    const cess = Number(row.cess || 0);
    const otherCharges = Number(row.other_charges || 0);

    if (taxable === null) {
      flags.push("Missing taxable value");
    }
    if (igst > 0 && (cgst > 0 || sgst > 0)) {
      flags.push("IGST combined with CGST/SGST");
    }
    if (cgst + sgst + igst > total + 0.01) {
      flags.push("GST amounts exceed invoice total");
    }
    if (taxable !== null) {
      // taxable_value is defined as the value after discount; do not subtract
      // discount_amount a second time. Other charges and cess are included.
      const expected = Math.round(
        (taxable + cgst + sgst + igst + otherCharges + cess) * 100
      ) / 100;
      if (Math.abs(expected - total) > 0.01) {
        flags.push(`Total reconciliation mismatch (expected ${expected.toFixed(2)})`);
      }
    }

    return { ...row, validation_flags: flags };
  });

  res.json({
    fromDate,
    toDate,
    invoice_count: invoices.length,
    totals: {
      invoice_amount: Number(sum("total_amount").toFixed(2)),
      taxable_value: Number(sum("taxable_value").toFixed(2)),
      cgst: Number(sum("cgst").toFixed(2)),
      sgst: Number(sum("sgst").toFixed(2)),
      igst: Number(sum("igst").toFixed(2)),
      cess: Number(sum("cess").toFixed(2)),
      other_charges: Number(sum("other_charges").toFixed(2))
    },
    missing_taxable_value_count: missingTaxableValueCount,
    invoices: invoicesWithValidation
  });
}));

// -------------------- ERROR HANDLING --------------------

app.use((
  err: Error & { status?: number; code?: string },
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err.code === "23505") {
    return res.status(409).json({
      error: "A duplicate invoice number, GSTIN or payment reference already exists"
    });
  }
  if (
    err.code === "23503" || err.code === "23514" ||
    err.code === "22P02" || err.code === "22007"
  ) {
    return res.status(400).json({
      error: "The submitted data violates a database validation rule"
    });
  }

  const status = err.status || 500;
  if (status >= 500) {
    console.error("API error details:", {
      message: err.message,
      code: err.code,
      stack: err.stack
    });
  }
  res.status(status).json({
    error: status >= 500 ? "Internal server error" : err.message
  });
});

const server = app.listen(port, "127.0.0.1", () => {
  console.log(`HRS Tech AI AP API listening on http://127.0.0.1:${port}`);
});

async function shutdown() {
  server.close();
  await pool.end();
}

process.on("SIGINT", () => { void shutdown(); });
process.on("SIGTERM", () => { void shutdown(); });
