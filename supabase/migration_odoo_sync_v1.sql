-- ============================================================
-- Phase 3 — Odoo Sync Schema Additions
-- ============================================================
-- Adds granular count/detail columns to odoo_sync_logs.
-- Adds Odoo line identity columns to order_lines.
-- Existing columns are unchanged; all new columns are nullable.
-- ============================================================

-- Section 1 — odoo_sync_logs: granular counters + error details
ALTER TABLE odoo_sync_logs
  ADD COLUMN IF NOT EXISTS fetched_count  integer,
  ADD COLUMN IF NOT EXISTS created_count  integer,
  ADD COLUMN IF NOT EXISTS updated_count  integer,
  ADD COLUMN IF NOT EXISTS skipped_count  integer,
  ADD COLUMN IF NOT EXISTS error_count    integer,
  ADD COLUMN IF NOT EXISTS error_details  jsonb;

-- Section 2 — order_lines: Odoo line identity
ALTER TABLE order_lines
  ADD COLUMN IF NOT EXISTS odoo_line_id    bigint,
  ADD COLUMN IF NOT EXISTS odoo_product_id bigint;

-- Partial unique index: prevents duplicate Odoo lines per order.
-- Existing manual lines (odoo_line_id IS NULL) are excluded entirely.
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_lines_odoo_line_id
  ON order_lines(order_id, odoo_line_id)
  WHERE odoo_line_id IS NOT NULL AND deleted_at IS NULL;
