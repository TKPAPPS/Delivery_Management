-- ============================================================
-- Logistics v2 Migration
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1. Delivery method enum + columns on delivery_cards
DO $$ BEGIN
  CREATE TYPE delivery_method_type AS ENUM ('car', 'post', 'air', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE delivery_cards
  ADD COLUMN IF NOT EXISTS delivery_method delivery_method_type NOT NULL DEFAULT 'car',
  -- Post / Courier
  ADD COLUMN IF NOT EXISTS courier_name     text,
  ADD COLUMN IF NOT EXISTS tracking_number  text,
  -- Air Freight
  ADD COLUMN IF NOT EXISTS cargo_company_name text,
  ADD COLUMN IF NOT EXISTS mawb             text,
  ADD COLUMN IF NOT EXISTS hawb             text,
  ADD COLUMN IF NOT EXISTS flight_number    text,
  ADD COLUMN IF NOT EXISTS etd              date,
  ADD COLUMN IF NOT EXISTS eta              date,
  -- Other
  ADD COLUMN IF NOT EXISTS other_method_name text,
  ADD COLUMN IF NOT EXISTS other_reference   text;

-- 2. Email field on customer_directory
ALTER TABLE customer_directory
  ADD COLUMN IF NOT EXISTS email text;

-- 3. Courier companies (Post dropdown)
CREATE TABLE IF NOT EXISTS courier_companies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 4. Cargo companies (Air dropdown)
CREATE TABLE IF NOT EXISTS cargo_companies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 5. LINE groups config
CREATE TABLE IF NOT EXISTS line_groups (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  notify_token   text,
  auto_triggers  text[] NOT NULL DEFAULT '{}',
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- 6. Communication events log
DO $$ BEGIN
  CREATE TYPE comm_channel AS ENUM ('line', 'email');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE comm_status AS ENUM ('sent', 'failed', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS communication_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_card_id uuid REFERENCES delivery_cards(id) ON DELETE CASCADE,
  channel          comm_channel NOT NULL,
  recipient        text,
  subject          text,
  body             text,
  status           comm_status NOT NULL DEFAULT 'skipped',
  error            text,
  sent_by          uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 7. RLS — allow authenticated users to read/write new tables
ALTER TABLE courier_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE cargo_companies   ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "auth_read_courier_companies"  ON courier_companies    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "auth_read_cargo_companies"    ON cargo_companies      FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "auth_read_line_groups"        ON line_groups          FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "auth_read_comm_events"        ON communication_events FOR SELECT USING (auth.role() = 'authenticated');

-- Seed some common courier / cargo companies (skip if already exist)
INSERT INTO courier_companies (name) VALUES
  ('Thailand Post'),
  ('Kerry Express'),
  ('Flash Express'),
  ('J&T Express'),
  ('DHL'),
  ('FedEx'),
  ('UPS')
ON CONFLICT DO NOTHING;

INSERT INTO cargo_companies (name) VALUES
  ('Thai Airways Cargo'),
  ('Bangkok Airways Cargo'),
  ('Air Asia Cargo'),
  ('DHL Express'),
  ('FedEx International'),
  ('UPS Supply Chain')
ON CONFLICT DO NOTHING;
