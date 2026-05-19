-- ============================================================
-- Migration: LINE Messaging API support (v3)
-- Replaces LINE Notify (shut down 2025-03-31) with Messaging API
--
-- Idempotent — safe to re-run on any DB state:
--   Case A: notify_token exists, line_target_id does not → rename
--   Case B: line_target_id already exists (migration already ran) → no-op
--   Case C: neither column exists (schema bootstrapped without v2) → add column
--
-- Run this in the Supabase SQL Editor after migration_logistics_v2.sql
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'line_groups'
      AND column_name  = 'notify_token'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'line_groups'
      AND column_name  = 'line_target_id'
  ) THEN
    -- Case A: rename in-place; existing values are preserved
    ALTER TABLE line_groups RENAME COLUMN notify_token TO line_target_id;
    RAISE NOTICE 'line_groups.notify_token renamed to line_target_id';

  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'line_groups'
      AND column_name  = 'line_target_id'
  ) THEN
    -- Case B: already migrated
    RAISE NOTICE 'line_groups.line_target_id already exists — no-op';

  ELSE
    -- Case C: neither column present; add line_target_id as the canonical column
    ALTER TABLE line_groups ADD COLUMN line_target_id text;
    RAISE NOTICE 'line_groups.line_target_id added (neither old nor new column existed)';
  END IF;
END $$;
