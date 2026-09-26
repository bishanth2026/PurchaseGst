-- Complete Row Level Security (RLS) & Storage Access Policies
-- Version: 1.1.0
-- Target: PostgreSQL / Supabase

-- 1. Helper function for Role-Based Access Control (RBAC)
CREATE OR REPLACE FUNCTION user_has_role(check_org_id UUID, allowed_roles VARCHAR[])
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id = check_org_id 
      AND user_id = auth.uid() 
      AND role = ANY(allowed_roles)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. ORGANIZATIONS POLICIES
DROP POLICY IF EXISTS "Users can view their organizations" ON organizations;
CREATE POLICY "Users can view their organizations"
    ON organizations FOR SELECT
    USING (user_belongs_to_org(id));

DROP POLICY IF EXISTS "Admins can update their organizations" ON organizations;
CREATE POLICY "Admins can update their organizations"
    ON organizations FOR UPDATE
    USING (user_has_role(id, ARRAY['ADMIN']));

-- 3. ORGANIZATION MEMBERS POLICIES
DROP POLICY IF EXISTS "Members can view org memberships" ON organization_members;
CREATE POLICY "Members can view org memberships"
    ON organization_members FOR SELECT
    USING (user_belongs_to_org(org_id));

DROP POLICY IF EXISTS "Admins can manage memberships" ON organization_members;
CREATE POLICY "Admins can manage memberships"
    ON organization_members FOR ALL
    USING (user_has_role(org_id, ARRAY['ADMIN']));

-- 4. UPLOAD BATCHES POLICIES
DROP POLICY IF EXISTS "Users can view batches in their org" ON upload_batches;
CREATE POLICY "Users can view batches in their org"
    ON upload_batches FOR SELECT
    USING (user_belongs_to_org(org_id));

DROP POLICY IF EXISTS "Staff can insert batches in their org" ON upload_batches;
CREATE POLICY "Staff can insert batches in their org"
    ON upload_batches FOR INSERT
    WITH CHECK (user_has_role(org_id, ARRAY['ADMIN', 'ACCOUNTANT']));

DROP POLICY IF EXISTS "Staff can update batches in their org" ON upload_batches;
CREATE POLICY "Staff can update batches in their org"
    ON upload_batches FOR UPDATE
    USING (user_has_role(org_id, ARRAY['ADMIN', 'ACCOUNTANT']));

-- 5. INVOICE LINE ITEMS POLICIES
DROP POLICY IF EXISTS "Users can view line items for their org invoices" ON invoice_line_items;
CREATE POLICY "Users can view line items for their org invoices"
    ON invoice_line_items FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM purchase_invoices pi
        WHERE pi.id = invoice_line_items.invoice_id AND user_belongs_to_org(pi.org_id)
      )
    );

DROP POLICY IF EXISTS "Staff can insert line items for their org invoices" ON invoice_line_items;
CREATE POLICY "Staff can insert line items for their org invoices"
    ON invoice_line_items FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM purchase_invoices pi
        WHERE pi.id = invoice_line_items.invoice_id AND user_has_role(pi.org_id, ARRAY['ADMIN', 'ACCOUNTANT'])
      )
    );

DROP POLICY IF EXISTS "Staff can update line items for their org invoices" ON invoice_line_items;
CREATE POLICY "Staff can update line items for their org invoices"
    ON invoice_line_items FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM purchase_invoices pi
        WHERE pi.id = invoice_line_items.invoice_id AND user_has_role(pi.org_id, ARRAY['ADMIN', 'ACCOUNTANT'])
      )
    );

DROP POLICY IF EXISTS "Staff can delete line items for their org invoices" ON invoice_line_items;
CREATE POLICY "Staff can delete line items for their org invoices"
    ON invoice_line_items FOR DELETE
    USING (
      EXISTS (
        SELECT 1 FROM purchase_invoices pi
        WHERE pi.id = invoice_line_items.invoice_id AND user_has_role(pi.org_id, ARRAY['ADMIN', 'ACCOUNTANT'])
      )
    );

-- 6. GSTR-2B POLICIES (Completing UPDATE and DELETE)
DROP POLICY IF EXISTS "Staff can update 2B records in their org" ON gstr2b_records;
CREATE POLICY "Staff can update 2B records in their org"
    ON gstr2b_records FOR UPDATE
    USING (user_has_role(org_id, ARRAY['ADMIN', 'ACCOUNTANT']));

DROP POLICY IF EXISTS "Admins can delete 2B records in their org" ON gstr2b_records;
CREATE POLICY "Admins can delete 2B records in their org"
    ON gstr2b_records FOR DELETE
    USING (user_has_role(org_id, ARRAY['ADMIN']));

-- 7. RECONCILIATION RECORDS POLICIES (Completing INSERT and DELETE)
DROP POLICY IF EXISTS "Staff can insert recon records in their org" ON reconciliation_records;
CREATE POLICY "Staff can insert recon records in their org"
    ON reconciliation_records FOR INSERT
    WITH CHECK (user_has_role(org_id, ARRAY['ADMIN', 'ACCOUNTANT', 'AUDITOR']));

DROP POLICY IF EXISTS "Admins can delete recon records in their org" ON reconciliation_records;
CREATE POLICY "Admins can delete recon records in their org"
    ON reconciliation_records FOR DELETE
    USING (user_has_role(org_id, ARRAY['ADMIN']));

-- 8. AUDIT LOGS POLICIES
DROP POLICY IF EXISTS "Users can view audit logs in their org" ON audit_logs;
CREATE POLICY "Users can view audit logs in their org"
    ON audit_logs FOR SELECT
    USING (user_belongs_to_org(org_id));

DROP POLICY IF EXISTS "Users can append audit logs in their org" ON audit_logs;
CREATE POLICY "Users can append audit logs in their org"
    ON audit_logs FOR INSERT
    WITH CHECK (user_belongs_to_org(org_id));

-- Audit logs are strictly append-only (immutable): No UPDATE or DELETE policies allowed!

-- 9. STORAGE BUCKET POLICIES FOR INVOICES
INSERT INTO storage.buckets (id, name, public) 
VALUES ('invoices', 'invoices', false) 
ON CONFLICT (id) DO NOTHING;

-- Storage object policies enforcing organization isolation
-- Object names are structured as: {org_id}/{invoice_id}/{filename}
DROP POLICY IF EXISTS "Users can download invoices for their org" ON storage.objects;
CREATE POLICY "Users can download invoices for their org"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'invoices' AND 
      user_belongs_to_org((storage.foldername(name))[1]::uuid)
    );

DROP POLICY IF EXISTS "Staff can upload invoices for their org" ON storage.objects;
CREATE POLICY "Staff can upload invoices for their org"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'invoices' AND 
      user_has_role((storage.foldername(name))[1]::uuid, ARRAY['ADMIN', 'ACCOUNTANT'])
    );

DROP POLICY IF EXISTS "Admins can delete invoice files for their org" ON storage.objects;
CREATE POLICY "Admins can delete invoice files for their org"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'invoices' AND 
      user_has_role((storage.foldername(name))[1]::uuid, ARRAY['ADMIN'])
    );
