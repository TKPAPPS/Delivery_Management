-- Allow a task to link to MULTIPLE entities (e.g. several orders). Run in Supabase SQL Editor.
-- Supersedes the single tasks.entity_type/entity_id link (those columns are left in place
-- but no longer written; task_links is the source of truth).

CREATE TABLE IF NOT EXISTS task_links (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('customer','order','delivery_card')),
  entity_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_task_links_task ON task_links(task_id);

ALTER TABLE task_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "active users read task_links" ON task_links;
CREATE POLICY "active users read task_links" ON task_links FOR SELECT USING (auth_user_is_active());

-- Backfill any pre-existing single link into the join table (idempotent).
INSERT INTO task_links (task_id, entity_type, entity_id)
SELECT id, entity_type, entity_id FROM tasks
WHERE entity_type IS NOT NULL AND entity_id IS NOT NULL
ON CONFLICT DO NOTHING;
