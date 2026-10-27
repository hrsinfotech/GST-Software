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
  "Pending approval",
  "Approved",
  "Rejected",
  "Overdue",
  "Paid",
  "Processing"
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
    if (required) throw Object.assign(new Error(`${field} is required`), { status: 400 });
    return 0;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw Object.assign(new Error(`${field} must be a non-negative number`), { status: 400 });
  }
  return parsed;
}

app.get("/health", asyncRoute(async (_req, res) => {
  const result = await pool.query("SELECT current_database() AS database_name");
  res.json({ status: "ok", service: "hrs-tech-ai-ap-api", database: result.rows[0].database_name });
}));

app.get("/api/v1/invoices", asyncRoute(async (req, res) => {
  const status = text(req.query.status);
  const search = text(req.query.search);
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);

  if (status && !allowedStatuses.includes(status as typeof allowedStatuses[number])) {
    return res.status(400).json({ error: "Invalid invoice status" });
  }

  const result = await pool.query(
    `SELECT id, invoice_number, vendor_id, vendor_name, gstin, invoice_date,
            total_amount, cgst, sgst, igst, status, source, approved_at,
            created_at, updated_at
       FROM invoices
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
    return res.status(400).json({ error: "A valid invoice_number (maximum 100 characters) is required" });
  }
  if (!vendorName || vendorName.length > 200) {
    return res.status(400).json({ error: "A valid vendor_name (maximum 200 characters) is required" });
  }
  if (gstin && gstin.length > 15) {
    return res.status(400).json({ error: "GSTIN cannot exceed 15 characters" });
  }
  if (invoiceDate && !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) {
    return res.status(400).json({ error: "invoice_date must use YYYY-MM-DD format" });
  }

  const total = amount(body.total_amount, "total_amount", true);
  const cgst = amount(body.cgst, "cgst");
  const sgst = amount(body.sgst, "sgst");
  const igst = amount(body.igst, "igst");

  const result = await pool.query(
    `INSERT INTO invoices
       (invoice_number, vendor_name, gstin, invoice_date,
        total_amount, cgst, sgst, igst, status, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Pending approval', $9)
     RETURNING id, invoice_number, vendor_id, vendor_name, gstin,
               invoice_date, total_amount, cgst, sgst, igst, status,
               source, approved_at, created_at, updated_at`,
    [invoiceNumber, vendorName, gstin, invoiceDate, total, cgst, sgst, igst, source]
  );

  res.status(201).json({ invoice: result.rows[0] });
}));

app.patch("/api/v1/invoices/:id/status", asyncRoute(async (req, res) => {
  const id = text(req.params.id);
  const status = text(req.body?.status);

  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: "Invalid invoice ID" });
  }
  if (!["Approved", "Rejected", "Paid", "Overdue", "Pending approval", "Processing"].includes(status)) {
    return res.status(400).json({ error: "Invalid invoice status" });
  }

  const result = await pool.query(
    `UPDATE invoices
        SET status = $1,
            approved_at = CASE WHEN $1 = 'Approved' THEN NOW()
                               WHEN $1 = 'Pending approval' THEN NULL
                               ELSE approved_at END,
            updated_at = NOW()
      WHERE id = $2
      RETURNING id, invoice_number, vendor_name, gstin, invoice_date,
                total_amount, cgst, sgst, igst, status, source,
                approved_at, created_at, updated_at`,
    [status, id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Invoice not found" });
  }

  res.json({ invoice: result.rows[0] });
}));

app.use((err: Error & { status?: number; code?: string }, _req: Request, res: Response, _next: NextFunction) => {
  if (err.code === "23505") {
    return res.status(409).json({ error: "An invoice with this invoice number already exists" });
  }
  if (err.code === "23503" || err.code === "23514" || err.code === "22P02" || err.code === "22007") {
    return res.status(400).json({ error: "The invoice data violates a database validation rule" });
  }

  const status = err.status || 500;
  if (status >= 500) console.error("API error:", err.message);
  res.status(status).json({ error: status >= 500 ? "Internal server error" : err.message });
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
