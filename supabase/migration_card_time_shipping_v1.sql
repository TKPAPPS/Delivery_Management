-- ============================================================
-- Delivery card: planned time + shipping type v1
-- planned_time: a delivery time (Car/Truck assignments).
-- shipping_type: cargo temperature, Dry/Frozen/Chilled (Car/Truck + Post/Courier).
-- Run in the Supabase SQL Editor (or via MCP apply_migration).
-- ============================================================

ALTER TABLE delivery_cards ADD COLUMN IF NOT EXISTS planned_time time;

ALTER TABLE delivery_cards ADD COLUMN IF NOT EXISTS shipping_type text
  CHECK (shipping_type IS NULL OR shipping_type IN ('Dry','Frozen','Chilled'));
