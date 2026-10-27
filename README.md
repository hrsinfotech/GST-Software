# HRS Tech AI AP Automation

AI-powered Accounts Payable (AP) automation for invoice processing, data extraction, validation, and accounting workflows.

## Project Overview

This project is designed to help automate invoice-processing tasks and support more efficient accounts payable operations.

### Key Components

- **Web Application:** Frontend interface built with JavaScript, HTML, CSS, and Vite.
- **API Service:** Node.js and TypeScript service for application API functionality.
- **Invoice Extractor:** Python service for OCR, GST-related invoice data extraction, validation, and Excel export.
- **Database:** Database initialization scripts and Docker Compose configuration.
- **Documentation and Notices:** Project references and third-party license notices.

### Repository Structure

```text
hrs-tech-ai-ap-automation/
├── apps/
│   └── web/                  # Web application
├── database/                 # Database scripts and configuration
├── services/
│   ├── api/                  # Node.js / TypeScript API
│   └── invoice-extractor/     # Python invoice extraction service
├── storage/                  # Application storage
├── reference/                # Reference materials
├── THIRD-PARTY-NOTICES/      # Third-party license notices
├── .gitignore
└── README.md
```

## Technology Stack

- JavaScript, HTML, CSS, and Vite
- Node.js and TypeScript
- Python
- OCR and invoice data extraction
- GST-related data validation
- Excel export
- Docker Compose
- Git and GitHub

## Getting Started

### Prerequisites

Install the required versions of Node.js, npm, Python, and Docker Desktop, depending on which services you intend to run.

### 1. Start the Web Application

Open PowerShell in the project root and run:

```powershell
cd apps/web
npm install
npm run dev
```

Open the local URL printed by Vite in your browser. The development server commonly uses `http://localhost:5173/`.

### 2. Start the API Service

```powershell
cd services/api
npm install
npm run
```

Review the available scripts printed by npm and the service configuration before starting the API.

### 3. Run the Invoice Extractor

Review `services/invoice-extractor/requirements.txt` and its Docker configuration before installing dependencies or starting the service.

The invoice extractor includes OCR, GST data extraction, invoice validation, and Excel export modules.

### 4. Database

Review `database/docker-compose.yml` and `database/init.sql` before starting the database. Configure credentials through local environment variables; do not commit secrets to Git.

## Security Notes

- Never commit `.env` files, passwords, access tokens, private keys, or production credentials.
- Validate extracted invoice data before using it for accounting or payment decisions.
- Review third-party license notices before redistributing or deploying dependencies.
- Protect financial and vendor information with appropriate access controls.

## Development Status

This repository contains the initial project source code. Verify each service's configuration, dependencies, and tests before deploying to production.

## License

Review the `THIRD-PARTY-NOTICES/` directory for third-party license terms. Licensing for the complete project should be defined separately by the project owner.
