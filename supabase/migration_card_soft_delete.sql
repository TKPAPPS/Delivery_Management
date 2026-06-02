-- Migration: card soft-delete + pending-signup alert flag
--
-- delivery_cards.deleted_at: soft-delete (reversible) instead of hard delete. All list reads filter
-- `deleted_at is null`; an admin "Deleted" view + restore path bring rows back.
-- profiles.pending_notified: once-only guard so admins are LINE-alerted a single time when a new
-- account is awaiting activation.

alter table delivery_cards add column if not exists deleted_at timestamptz;
create index if not exists idx_delivery_cards_not_deleted on delivery_cards (status) where deleted_at is null;

alter table profiles add column if not exists pending_notified boolean not null default false;
