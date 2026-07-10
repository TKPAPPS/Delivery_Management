-- Combine same-customer orders into one delivery_customer.
-- The Order->Delivery bridge now groups orders by (normalized) customer name into a single
-- delivery_customer per card. Because one customer can span several orders, we link every
-- order to its delivery_customer explicitly (order_id alone was a single FK and insufficient).
--
-- Idempotent: safe to re-run.

alter table orders add column if not exists delivery_customer_id uuid
  references delivery_customers(id) on delete set null;

create index if not exists idx_orders_delivery_customer on orders(delivery_customer_id)
  where delivery_customer_id is not null;

-- One-time data fix for cards that already have duplicate per-order customer rows.
do $$
declare
  g record;
  keeper uuid;
  vsum numeric;
begin
  -- Backfill the new link from existing 1:1 rows.
  update orders o set delivery_customer_id = dc.id
  from delivery_customers dc
  where dc.order_id = o.id and o.delivery_customer_id is null;

  -- Merge duplicate customers per (card, normalized name): keep the lowest sort_order row,
  -- move its siblings' sale orders / items / orders onto it, sum their order values, and
  -- repoint original_booker_id if it pointed at a removed row.
  for g in
    select delivery_card_id, lower(trim(customer_name)) as k,
           array_agg(id order by sort_order, created_at) as ids
    from delivery_customers
    group by delivery_card_id, lower(trim(customer_name))
    having count(*) > 1
  loop
    keeper := g.ids[1];
    update customer_sale_orders set delivery_customer_id = keeper where delivery_customer_id = any(g.ids[2:]);
    update extra_delivery_items set delivery_customer_id = keeper where delivery_customer_id = any(g.ids[2:]);
    update orders set delivery_customer_id = keeper where delivery_customer_id = any(g.ids[2:]);
    update delivery_cards set original_booker_id = keeper
      where id = g.delivery_card_id and original_booker_id = any(g.ids[2:]);
    select sum(order_value) into vsum from delivery_customers where id = any(g.ids) and order_value is not null;
    update delivery_customers set order_value = vsum where id = keeper;
    delete from customer_sale_orders a using customer_sale_orders b
      where a.delivery_customer_id = keeper and b.delivery_customer_id = keeper
        and a.sale_order_number = b.sale_order_number and a.ctid > b.ctid;
    delete from delivery_customers where id = any(g.ids[2:]);
  end loop;
end $$;
