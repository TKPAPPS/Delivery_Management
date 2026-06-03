-- Migration: snapshot the Odoo partner email + address onto the order.
-- Captured at sync; used to seed a customer_directory company (by name) when the order is
-- converted to a draft delivery. No customer is created at sync time.
alter table orders add column if not exists customer_email text;
alter table orders add column if not exists customer_address text;
