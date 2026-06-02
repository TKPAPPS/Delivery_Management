-- Migration: rename line_groups.token -> line_target_id
--
-- The live DB's line_groups target column was named `token` (the base schema), while ALL app code
-- references `line_target_id` (see migration_messaging_api_v3.sql, /api/line-groups, communications
-- route, notifications.ts, /api/line/webhook). migration_messaging_api_v3 only handled a
-- `notify_token` source column, so on this DB the rename never happened and LINE group reads/writes
-- silently failed. This aligns the schema with the code.
--
-- Idempotent:
--   Case A: token exists, line_target_id does not -> rename
--   Case B: line_target_id already exists -> no-op

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'line_groups' AND column_name = 'token'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'line_groups' AND column_name = 'line_target_id'
  ) THEN
    ALTER TABLE line_groups RENAME COLUMN token TO line_target_id;
    RAISE NOTICE 'line_groups.token renamed to line_target_id';
  ELSE
    RAISE NOTICE 'line_groups.line_target_id already present — no-op';
  END IF;
END $$;
