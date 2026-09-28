-- Return period for purchase invoices.
-- Legacy rows derive the period from invoice_date.
ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS return_period text;

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_org_return_period
  ON public.purchase_invoices (org_id, return_period);

UPDATE public.purchase_invoices
SET return_period = to_char(invoice_date, 'MM-YYYY')
WHERE return_period IS NULL;
