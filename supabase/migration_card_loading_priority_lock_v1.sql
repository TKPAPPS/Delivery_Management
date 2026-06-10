-- ============================================================
-- Delivery card: loading priority + single-customer lock v1
-- Run in the Supabase SQL Editor (or via MCP apply_migration).
-- ============================================================

-- Loading priority (1-10): which vehicles the warehouse loads first when
-- capacity is tight. Separate from the normal/urgent `priority` enum. Nullable = unset.
ALTER TABLE delivery_cards ADD COLUMN IF NOT EXISTS loading_priority int
  CHECK (loading_priority IS NULL OR (loading_priority BETWEEN 1 AND 10));

-- When true, the card is locked to a single customer: no additional customers
-- may be added once one is present (enforced in POST /api/cards/[id]/customers).
ALTER TABLE delivery_cards ADD COLUMN IF NOT EXISTS single_customer_lock boolean NOT NULL DEFAULT false;
