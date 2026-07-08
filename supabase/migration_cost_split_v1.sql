-- Per-customer delivery cost split
-- Split a truck's cost proportionally by each customer's sales-order value,
-- plus a flat 200 THB surcharge per added (non-original-booker) customer.
--
-- Idempotent: safe to re-run.

alter table delivery_cards
  add column if not exists car_cost numeric(10, 2);

-- The customer exempt from the +200 surcharge (the one who originally booked the truck).
-- Nullable FK; on customer delete it clears (the UI then falls back to lowest sort_order).
alter table delivery_cards
  add column if not exists original_booker_id uuid
    references delivery_customers(id) on delete set null;

-- Per-customer value used for the proportional split. Seeded from the linked order's
-- Odoo amount_total at conversion, but editable as a manual override.
alter table delivery_customers
  add column if not exists order_value numeric(12, 2);

-- Odoo sale.order.amount_total, captured read-only during sync and carried onto the
-- delivery_customer when the order is turned into a delivery.
alter table orders
  add column if not exists amount_total numeric(12, 2);
