-- Biznexco Purchase Invoice Automation and GST Reconciliation Schema
-- Version: 1.0.0
-- Target: PostgreSQL / Supabase

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ORGANIZATIONS
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255),
    gstin VARCHAR(15) NOT NULL UNIQUE,
    state_code VARCHAR(2) NOT NULL,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. ORGANIZATION MEMBERS (Role Based Access Control)
CREATE TABLE IF NOT EXISTS organization_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- references auth.users(id)
    role VARCHAR(30) NOT NULL CHECK (role IN ('ADMIN', 'ACCOUNTANT', 'AUDITOR', 'VIEWER')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(org_id, user_id)
);

-- 3. UPLOAD BATCHES
CREATE TABLE IF NOT EXISTS upload_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    batch_name VARCHAR(255) NOT NULL,
    total_files INTEGER DEFAULT 0,
    processed_files INTEGER DEFAULT 0,
    failed_files INTEGER DEFAULT 0,
    status VARCHAR(30) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. PURCHASE INVOICES (Books Register)
CREATE TABLE IF NOT EXISTS purchase_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES upload_batches(id) ON DELETE SET NULL,
    supplier_name VARCHAR(255) NOT NULL,
    supplier_gstin VARCHAR(15) NOT NULL,
    supplier_address TEXT,
    buyer_gstin VARCHAR(15) NOT NULL,
    invoice_number VARCHAR(64) NOT NULL,
    normalized_invoice_number VARCHAR(64) NOT NULL,
    invoice_date DATE NOT NULL,
    document_type VARCHAR(10) NOT NULL CHECK (document_type IN ('INV', 'CRN', 'DBN')),
    place_of_supply VARCHAR(2) NOT NULL,
    taxable_value NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    cgst_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    sgst_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    igst_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    cess_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    hsn_sac VARCHAR(20),
    itc_eligibility VARCHAR(30) DEFAULT 'ELIGIBLE' CHECK (itc_eligibility IN ('ELIGIBLE', 'INELIGIBLE_17_5', 'PENDING')),
    status VARCHAR(30) DEFAULT 'PENDING_REVIEW' CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'FLAGGED')),
    file_url TEXT,
    file_name VARCHAR(255),
    confidence_scores JSONB DEFAULT '{}'::jsonb,
    extraction_warnings TEXT[] DEFAULT '{}',
    validation_errors TEXT[] DEFAULT '{}',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(org_id, supplier_gstin, normalized_invoice_number)
);

-- 5. INVOICE LINE ITEMS
CREATE TABLE IF NOT EXISTS invoice_line_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID REFERENCES purchase_invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    hsn_sac VARCHAR(20),
    quantity NUMERIC(12, 3) DEFAULT 1.0,
    unit VARCHAR(20) DEFAULT 'NOS',
    unit_rate NUMERIC(15, 2) DEFAULT 0.00,
    taxable_value NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    gst_rate NUMERIC(5, 2) NOT NULL DEFAULT 18.00,
    cgst_amount NUMERIC(15, 2) DEFAULT 0.00,
    sgst_amount NUMERIC(15, 2) DEFAULT 0.00,
    igst_amount NUMERIC(15, 2) DEFAULT 0.00,
    cess_amount NUMERIC(15, 2) DEFAULT 0.00,
    total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    confidence NUMERIC(3, 2) DEFAULT 1.0
);

-- 6. GSTR-2B RECORDS
CREATE TABLE IF NOT EXISTS gstr2b_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    return_period VARCHAR(10) NOT NULL, -- Format: 'MM-YYYY' e.g. '04-2024'
    supplier_gstin VARCHAR(15) NOT NULL,
    supplier_name VARCHAR(255) NOT NULL,
    invoice_number VARCHAR(64) NOT NULL,
    normalized_invoice_number VARCHAR(64) NOT NULL,
    invoice_date DATE NOT NULL,
    document_type VARCHAR(10) NOT NULL CHECK (document_type IN ('INV', 'CRN', 'DBN')),
    invoice_value NUMERIC(15, 2) NOT NULL,
    place_of_supply VARCHAR(2) NOT NULL,
    reverse_charge BOOLEAN DEFAULT FALSE,
    taxable_value NUMERIC(15, 2) NOT NULL,
    igst_amount NUMERIC(15, 2) DEFAULT 0.00,
    cgst_amount NUMERIC(15, 2) DEFAULT 0.00,
    sgst_amount NUMERIC(15, 2) DEFAULT 0.00,
    cess_amount NUMERIC(15, 2) DEFAULT 0.00,
    itc_available BOOLEAN DEFAULT TRUE,
    filing_date DATE,
    gstr1_filing_status VARCHAR(20) DEFAULT 'FILED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. RECONCILIATION RECORDS
CREATE TABLE IF NOT EXISTS reconciliation_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    return_period VARCHAR(10) NOT NULL,
    invoice_id UUID REFERENCES purchase_invoices(id) ON DELETE CASCADE,
    gstr2b_id UUID REFERENCES gstr2b_records(id) ON DELETE CASCADE,
    match_type VARCHAR(30) NOT NULL CHECK (match_type IN (
        'EXACT', 'PROBABLE', 'MISMATCH_VALUE', 'MISMATCH_TAX',
        'MISSING_IN_2B', 'MISSING_IN_BOOKS', 'DUPLICATE', 'CRN_DBN_DIFF', 'MANUAL_MATCH'
    )),
    match_score NUMERIC(5, 2) DEFAULT 0.00,
    match_reason TEXT NOT NULL,
    confidence_level VARCHAR(10) DEFAULT 'MEDIUM' CHECK (confidence_level IN ('HIGH', 'MEDIUM', 'LOW')),
    taxable_diff NUMERIC(15, 2) DEFAULT 0.00,
    cgst_diff NUMERIC(15, 2) DEFAULT 0.00,
    sgst_diff NUMERIC(15, 2) DEFAULT 0.00,
    igst_diff NUMERIC(15, 2) DEFAULT 0.00,
    cess_diff NUMERIC(15, 2) DEFAULT 0.00,
    total_diff NUMERIC(15, 2) DEFAULT 0.00,
    status VARCHAR(30) DEFAULT 'PENDING_REVIEW' CHECK (status IN ('PENDING_REVIEW', 'ACCEPTED', 'REJECTED', 'RESOLVED')),
    user_comments TEXT,
    reviewed_by UUID,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    record_type VARCHAR(50) NOT NULL,
    record_id VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    details TEXT,
    performed_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- INDEXES FOR MAXIMUM QUERY PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_invoices_org ON purchase_invoices(org_id);
CREATE INDEX IF NOT EXISTS idx_invoices_gstin ON purchase_invoices(supplier_gstin);
CREATE INDEX IF NOT EXISTS idx_invoices_norm_no ON purchase_invoices(normalized_invoice_number);
CREATE INDEX IF NOT EXISTS idx_gstr2b_org_period ON gstr2b_records(org_id, return_period);
CREATE INDEX IF NOT EXISTS idx_gstr2b_gstin_norm_no ON gstr2b_records(supplier_gstin, normalized_invoice_number);
CREATE INDEX IF NOT EXISTS idx_recon_org_period ON reconciliation_records(org_id, return_period);

-- ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE gstr2b_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper security function: Check membership
CREATE OR REPLACE FUNCTION user_belongs_to_org(check_org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id = check_org_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policies for Purchase Invoices
CREATE POLICY "Users can view invoices for their organizations"
    ON purchase_invoices FOR SELECT
    USING (user_belongs_to_org(org_id));

CREATE POLICY "Users can insert invoices for their organizations"
    ON purchase_invoices FOR INSERT
    WITH CHECK (user_belongs_to_org(org_id));

CREATE POLICY "Users can update invoices for their organizations"
    ON purchase_invoices FOR UPDATE
    USING (user_belongs_to_org(org_id));

CREATE POLICY "Users can delete invoices for their organizations"
    ON purchase_invoices FOR DELETE
    USING (user_belongs_to_org(org_id));

-- Policies for GSTR2B Records
CREATE POLICY "Users can view 2B records in their org"
    ON gstr2b_records FOR SELECT
    USING (user_belongs_to_org(org_id));

CREATE POLICY "Users can insert 2B records in their org"
    ON gstr2b_records FOR INSERT
    WITH CHECK (user_belongs_to_org(org_id));

-- Policies for Reconciliation Records
CREATE POLICY "Users can view recon records in their org"
    ON reconciliation_records FOR SELECT
    USING (user_belongs_to_org(org_id));

CREATE POLICY "Users can update recon records in their org"
    ON reconciliation_records FOR UPDATE
    USING (user_belongs_to_org(org_id));

-- STORAGE BUCKET CONFIGURATION (Run in Supabase Dashboard or Storage API)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('invoices', 'invoices', true) ON CONFLICT DO NOTHING;
