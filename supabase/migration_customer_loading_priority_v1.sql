-- ============================================================
-- Per-customer loading priority (1-10)
-- Loading priority moved from the card (vehicle) to each customer on the card,
-- so a multi-customer vehicle can prioritise which customer loads first.
-- The card-level delivery_cards.loading_priority is retained but no longer used.
-- ============================================================

ALTER TABLE delivery_customers ADD COLUMN IF NOT EXISTS loading_priority int
  CHECK (loading_priority IS NULL OR (loading_priority BETWEEN 1 AND 10));
