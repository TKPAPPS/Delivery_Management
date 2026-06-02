-- Migration: drop the legacy, unused planning_queue table.
-- Superseded by draft delivery_cards (status='draft'). Was empty; its API routes are removed.
drop table if exists planning_queue cascade;
