# Biznexco Purchase Invoice Automation & GST Reconciliation App

Biznexco is an enterprise-grade Purchase Invoice Automation and GSTR-2B Reconciliation platform engineered for statutory compliance with **Section 16(2)(aa) of the CGST Act 2017** and **Rule 36(4)**.

---

## Architecture & Workflows

### 1. Manual Purchase Invoice Entry & Validation
- **Statutory Fields**: Supplier Name, Supplier GSTIN with checksum/state validation, Invoice Number (max 16 chars per Rule 46(b)), Invoice Date, Document Type (`INV`, `CRN`, `DBN`), Taxable Value, CGST, SGST, IGST, Cess, Total Amount, HSN/SAC, Line Items, ITC Eligibility (`ELIGIBLE`, `INELIGIBLE_17_5`, `COMMON_RULE_42_43`, `CAPITAL_GOODS`).
- **Mathematical Integrity**: Enforces `CGST === SGST` on intra-state supplies, `IGST > 0` on inter-state supplies, and total amount calculation within ₹1.00 tolerance.

### 2. Multi-Invoice Ingestion & Gemini Vision OCR
- **Supported Formats**: PDF, JPG, PNG, scanned vouchers.
- **Batch Processing**: Groups files into batches with upload, OCR processing, and extraction states.
- **AI Extraction**: Server-side proxy (`/api/ocr-extract`) calling `@google/genai` (`gemini-2.5-flash`). Returns confidence scores for every field (`0.0` to `1.0`).
- **Review Workflow**: Any field with low confidence (<0.85) or validation errors is flagged for manual review with side-by-side voucher inspection. **Missing statutory values are never invented**.

### 3. Purchase Register & Export
- **Search & Filtering**: Search by supplier name, GSTIN, invoice number; filter by approval status, document type, and return period.
- **Excel & CSV Export**: Export active or filtered purchase registers directly to formatted `.xlsx` or `.csv`.

### 4. GSTR-2B Ingestion
- Ingest auto-drafted ITC statements via Excel, CSV, or standard GST Portal JSON.
- Parse supplier GSTIN, invoice number, invoice date, document type, taxable value, IGST, CGST, SGST, Cess, Reverse Charge (`RCM`), and filing date.

### 5. Multi-Pass Reconciliation Engine
- **Pass 0 (Duplicate Detection)**: Scans for duplicate vouchers in Books and duplicate filings in GSTR-2B, locking duplicate copies to prevent double-claiming of ITC.
- **Pass 1 (Exact Match)**: Exact GSTIN + normalized invoice number + matching document type + matching taxable and tax amounts within ₹1.00 tolerance.
- **Pass 2 (Document Type Mismatch)**: Same invoice number but opposing document types (e.g. INV vs CRN).
- **Pass 3 (Tax / Value Discrepancy)**: Matching GSTIN + invoice number with tax variance or taxable difference.
- **Pass 4 (Probable / Date Variance)**: Matching invoice with filing date difference > 30 days or fuzzy number variations.
- **Pass 5 (Missing Records)**: Missing in GSTR-2B (vendor defaulted on GSTR-1) and Missing in Books (unclaimed ITC in 2B).
- **Manual Overrides**: Users can accept, reject, or manually link matches with audit log history and link locks that persist across re-runs.

### 6. Security, Supabase & Row Level Security
- Organization-scoped multi-tenancy (`org_id`).
- Row Level Security (RLS) policies for `organizations`, `purchase_invoices`, `gstr2b_records`, `reconciliation_items`, `upload_batches`, and `audit_logs`.
- Persistent local-first fallback with optional cloud sync to Supabase.

---

## 100-Invoice Stress Test Benchmark Results

| Metric | Result |
|---|---|
| **Input Books Invoices** | **100** |
| **Input GSTR-2B Records** | **97** |
| **Output Reconciliation Records** | **107** (100 Books + 5 Missing in Books + 2 GSTR-2B Duplicates) |
| **Matched Invoices (Exact + Normalized)** | **60** |
| **Probable Matches (Date Variance > 30d)** | **10** |
| **Tax / Value Mismatches** | **20** |
| **Missing in GSTR-2B (Vendor Default)** | **5** |
| **Missing in Books (Unclaimed ITC)** | **5** |
| **Duplicate Records Flagged** | **7** (5 Books duplicates + 2 GSTR-2B duplicates) |
| **Total Books Taxable Value** | **₹54,95,000.00** |
| **Total Books CGST** | **₹1,97,390.00** |
| **Total Books SGST** | **₹1,97,390.00** |
| **Total Books IGST** | **₹5,22,280.00** |
| **Total Net Books ITC** | **₹9,17,060.00** |
| **Dropped or Unaccounted Records** | **0 (Zero Record Loss Guarantee: PASS)** |
| **Mathematical Balance Check** | **PASS** |

---

## Setup & Running the Application

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start Dev Server**:
   ```bash
   npm run dev
   ```
   Access at `http://localhost:3000`.

3. **Production Build & Lint Verification**:
   ```bash
   npm run lint
   npm run build
   ```

4. **Execute 100-Invoice Stress Test via CLI**:
   ```bash
   npx tsx -e "import { run100InvoiceStressAudit } from './src/utils/stressTest100'; console.log(JSON.stringify(run100InvoiceStressAudit(), null, 2));"
   ```
