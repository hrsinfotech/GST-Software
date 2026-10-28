# HRS Tech AI AP Automation

AI-assisted accounts payable automation for invoice intake, OCR-based data extraction, GST-related validation, vendor and payment workflows, and accounting support.

## Architecture

| Component | Technology | Local address |
|---|---|---|
| Web application | JavaScript, Vite | http://127.0.0.1:5173 |
| AP API | Node.js, TypeScript, Express | http://127.0.0.1:8099 |
| API health check | Express, PostgreSQL | http://127.0.0.1:8099/health |
| Invoice extractor | Python, FastAPI, OCR | http://127.0.0.1:8098 |
| Database | PostgreSQL 16 | 127.0.0.1:5437 |

The web development server proxies `/ap-api` to the AP API and `/extract-api` to the invoice extractor.

## Prerequisites

Install or configure the following software:

- **Git for Windows** — to clone, update, and version the source code.
- **Node.js 20 or newer** — use an active LTS release; npm is included with Node.js.
- **Docker Desktop for Windows** — start Docker Desktop and use Linux containers.
- **Python 3.12** — needed only if developing or running the invoice extractor outside Docker.
- **PostgreSQL client tools (`psql`)** — optional if you use the PostgreSQL client inside the database container instead.
- **Web browser** — for the local web application.

No separate local PostgreSQL server is required when using the supplied Docker Compose database.

Verify the main tools in PowerShell:

```powershell
git --version
node --version
npm --version
docker --version
docker compose version
```

For local Python development:

```powershell
python --version
```

## Repository layout

```text
apps/
  web/                         Vite web application
services/
  api/                         Node.js / TypeScript API
  invoice-extractor/            Python OCR and extraction service
database/
  docker-compose.yml            PostgreSQL service
  init.sql                      Initial database schema
  migrations/                   Incremental database migrations
  .env                          Local database credentials (not committed)
storage/                        Local runtime storage
reference/                      Reference material
THIRD-PARTY-NOTICES/             Third-party license notices
```

## First-time setup

Run commands from the repository root unless otherwise specified.

### 1. Configure database credentials

Create `database/.env` locally. Use the variable names expected by the Compose file:

```dotenv
POSTGRES_DB=hrs_ai_ap
POSTGRES_USER=hrs_ai_ap_app
POSTGRES_PASSWORD=replace_with_a_strong_local_password
```

Use the actual database name, username, and password for your environment if they differ. Do not commit this file or share its contents.

### 2. Start PostgreSQL

```powershell
docker compose -f .\database\docker-compose.yml up -d database
docker compose -f .\database\docker-compose.yml ps
```

The database is exposed on `127.0.0.1:5437` and persists data in the named Docker volume `hrs-ai-ap-postgres-data`.

**Data safety:** Do not run `docker compose down -v`, delete the named volume, or recreate the database volume when existing invoice records must be preserved.

### 3. Install and start the API

Open a PowerShell terminal:

```powershell
Set-Location .\services\api
npm ci
npm run typecheck
npm run dev
```

The API reads database settings from `database/.env` when started with `services/api` as the working directory. Its default port is `8099`.

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:8099/health
```

Keep this terminal running during development.

### 4. Install and start the web application

Open a second PowerShell terminal:

```powershell
Set-Location .\apps\web
npm ci
npm run dev
```

Open http://127.0.0.1:5173 in your browser.

To create a production web build:

```powershell
npm run build
```

### 5. Start the invoice extractor

From the repository root, open another PowerShell terminal:

```powershell
docker compose -f .\services\invoice-extractor\docker-compose.yml up -d --build
docker compose -f .\services\invoice-extractor\docker-compose.yml ps
```

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:8098/health
```

The extractor uses Python, FastAPI, Tesseract OCR, Poppler, and the dependencies listed in `services/invoice-extractor/requirements.txt`.

To inspect its logs:

```powershell
docker compose -f .\services\invoice-extractor\docker-compose.yml logs --tail 100
```

## Database initialization and migrations

The database Compose file mounts `database/init.sql` for initialization of a new PostgreSQL data directory. PostgreSQL's initialization scripts are not automatically rerun on an already initialized data volume.

Incremental migrations are stored in `database/migrations/`. Review each SQL file and confirm the current schema and backup status before applying it. Apply each migration only once, in the intended order, using a database-aware migration process or the PostgreSQL client.

Do not reset the database to apply a migration. Back up important records before schema changes, and verify the resulting tables and application workflows afterward.

## Useful development commands

```powershell
# API type checking
Set-Location .\services\api
npm run typecheck

# Web production build
Set-Location ..\..\apps\web
npm run build

# Database service status (from repository root)
docker compose -f .\database\docker-compose.yml ps

# Invoice extractor logs (from repository root)
docker compose -f .\services\invoice-extractor\docker-compose.yml logs --tail 100
```

## Troubleshooting

- If a port is occupied, identify the owning process before changing the configured port.
- If the API cannot connect to PostgreSQL, verify `database/.env`, the database container health, and the `PGHOST` / `PGPORT` settings.
- If OCR extraction fails, inspect extractor logs and verify that the uploaded file format is supported.
- If a web request fails, inspect the browser console and check that the API and extractor services are running.
- Do not stop or recreate unrelated Payroll or AMS containers while troubleshooting this application.

## Security and data protection

- Never commit `.env` files, passwords, API tokens, private keys, or production credentials.
- Keep database dumps, local backups, temporary reports, and runtime logs out of source control unless a specific, sanitized artifact is intentionally approved for versioning.
- Validate invoice amounts, GST fields, vendor details, and payment information before accounting or payment decisions.
- Apply appropriate authentication, authorization, audit logging, encryption, retention, and backup controls before production use.

## Project status

This repository is under active development. Verify the application workflows, database migrations, automated checks, and deployment security before using it for production accounting or payment operations.

## Licensing

Review `THIRD-PARTY-NOTICES/` for third-party notices. The project owner should define and document the license for the complete application separately.
