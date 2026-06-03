-- Migration: link a delivery customer back to its source order.
-- Lets the order's card/status follow the customer (move) or release to the pool (remove/card-delete),
-- instead of being orphaned to a stale card. Nullable: customers added by hand have no order.
alter table delivery_customers add column if not exists order_id uuid references orders(id) on delete set null;
create index if not exists idx_delivery_customers_order on delivery_customers(order_id) where order_id is not null;
