-- Device-scoped reconciliation identity.
-- Additive only: no row is deleted, renumbered, or rewritten.

ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS sync_source_id TEXT;
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS source_row_id BIGINT;
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS formula_profile_id INTEGER;
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS formula_settings TEXT;
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS cashbox_posting_enabled INTEGER;
ALTER TABLE cash_receipts ADD COLUMN IF NOT EXISTS sync_source_id TEXT;
ALTER TABLE cash_receipts ADD COLUMN IF NOT EXISTS source_row_id BIGINT;
ALTER TABLE cash_receipts ADD COLUMN IF NOT EXISTS is_modified INTEGER DEFAULT 0;
ALTER TABLE bank_receipts ADD COLUMN IF NOT EXISTS sync_source_id TEXT;
ALTER TABLE bank_receipts ADD COLUMN IF NOT EXISTS source_row_id BIGINT;
ALTER TABLE bank_receipts ADD COLUMN IF NOT EXISTS is_modified INTEGER DEFAULT 0;
ALTER TABLE postpaid_sales ADD COLUMN IF NOT EXISTS sync_source_id TEXT;
ALTER TABLE postpaid_sales ADD COLUMN IF NOT EXISTS source_row_id BIGINT;
ALTER TABLE postpaid_sales ADD COLUMN IF NOT EXISTS is_modified INTEGER DEFAULT 0;
ALTER TABLE customer_receipts ADD COLUMN IF NOT EXISTS sync_source_id TEXT;
ALTER TABLE customer_receipts ADD COLUMN IF NOT EXISTS source_row_id BIGINT;
ALTER TABLE customer_receipts ADD COLUMN IF NOT EXISTS is_modified INTEGER DEFAULT 0;
ALTER TABLE manual_postpaid_sales ADD COLUMN IF NOT EXISTS sync_source_id TEXT;
ALTER TABLE manual_postpaid_sales ADD COLUMN IF NOT EXISTS source_row_id BIGINT;
ALTER TABLE manual_customer_receipts ADD COLUMN IF NOT EXISTS sync_source_id TEXT;
ALTER TABLE manual_customer_receipts ADD COLUMN IF NOT EXISTS source_row_id BIGINT;
ALTER TABLE return_invoices ADD COLUMN IF NOT EXISTS sync_source_id TEXT;
ALTER TABLE return_invoices ADD COLUMN IF NOT EXISTS source_row_id BIGINT;
ALTER TABLE return_invoices ADD COLUMN IF NOT EXISTS is_modified INTEGER DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS sync_source_id TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS source_row_id BIGINT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS is_modified INTEGER DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reconciliations_sync_source_row_unique
ON reconciliations(sync_source_id, source_row_id)
WHERE sync_source_id IS NOT NULL AND source_row_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_receipts_sync_source_row_unique
ON cash_receipts(sync_source_id, source_row_id)
WHERE sync_source_id IS NOT NULL AND source_row_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_receipts_sync_source_row_unique
ON bank_receipts(sync_source_id, source_row_id)
WHERE sync_source_id IS NOT NULL AND source_row_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_postpaid_sales_sync_source_row_unique
ON postpaid_sales(sync_source_id, source_row_id)
WHERE sync_source_id IS NOT NULL AND source_row_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_receipts_sync_source_row_unique
ON customer_receipts(sync_source_id, source_row_id)
WHERE sync_source_id IS NOT NULL AND source_row_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_postpaid_sync_source_row_unique
ON manual_postpaid_sales(sync_source_id, source_row_id)
WHERE sync_source_id IS NOT NULL AND source_row_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_receipts_sync_source_row_unique
ON manual_customer_receipts(sync_source_id, source_row_id)
WHERE sync_source_id IS NOT NULL AND source_row_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_return_invoices_sync_source_row_unique
ON return_invoices(sync_source_id, source_row_id)
WHERE sync_source_id IS NOT NULL AND source_row_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_sync_source_row_unique
ON suppliers(sync_source_id, source_row_id)
WHERE sync_source_id IS NOT NULL AND source_row_id IS NOT NULL;
