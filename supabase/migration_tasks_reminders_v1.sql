-- Tasks & Reminders (in-app) — run in Supabase SQL Editor. Idempotent.
-- Builds on the pre-existing (empty) `tasks` and `notifications` tables from
-- migration_ops_platform_v1.sql, which nothing used before this feature.
--
-- Notes on the existing schema this relies on:
--   tasks.type has CHECK (type IN ('follow_up','internal','other')) -> default must be 'other'.
--   tasks.entity_type / notifications.entity_type CHECK allow 'customer','order','delivery_card','task', ...
--   RLS already present: tasks (insert/select active users, update assigned-or-admin);
--   notifications (users read/update own rows). API mutations use the service-role client.

ALTER TABLE tasks ALTER COLUMN type SET DEFAULT 'other';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_all boolean NOT NULL DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_notified_at timestamptz;

-- updated_at trigger (shared set_updated_at())
DROP TRIGGER IF EXISTS tasks_updated_at ON tasks;
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- indexes for calendar/backlog + assignee filtering
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date)
  WHERE deleted_at IS NULL AND completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_active ON tasks(created_at) WHERE deleted_at IS NULL;

-- live updates for calendar + notification bell (guard against re-adding)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
