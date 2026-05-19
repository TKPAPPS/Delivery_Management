-- ============================================================
-- Migration: LINE Messaging API support (v3)
-- Replaces LINE Notify (shut down 2025-03-31) with Messaging API
--
-- Run this in the Supabase SQL Editor after migration_logistics_v2.sql
-- ============================================================

-- Rename notify_token → line_target_id on line_groups
-- This column now stores the LINE group/user ID (e.g. Ca56f94637c...)
-- used as the `to` field in Messaging API push calls.
-- The channel access token lives in LINE_CHANNEL_ACCESS_TOKEN env var.
ALTER TABLE line_groups
  RENAME COLUMN notify_token TO line_target_id;
