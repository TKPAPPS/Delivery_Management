-- ============================================================
-- Resources v1 Migration
-- Shared team directory of external links (apps, sheets, docs).
-- Run this in the Supabase SQL Editor (or via MCP apply_migration).
-- ============================================================

CREATE TABLE IF NOT EXISTS resources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  url         text NOT NULL,
  description text,
  category    text NOT NULL DEFAULT 'Other',
  sort_order  int  NOT NULL DEFAULT 0,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

-- Mirror the destinations table: any active user can read and manage.
DO $$ BEGIN
  CREATE POLICY "Active users can read resources" ON resources
    FOR SELECT USING (auth_user_is_active());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Active users can manage resources" ON resources
    FOR ALL USING (auth_user_is_active());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
