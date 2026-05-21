-- ============================================================
-- Migration: Operations Platform v1
--
-- Adds new tables for the Operations Platform:
--   vehicles, odoo_sync_logs, orders, order_lines,
--   trips, trip_orders, trip_order_lines,
--   tasks, notifications, pinned_items
--
-- Extends existing tables with additive nullable columns:
--   activity_log   — entity_type, entity_id
--   attachments    — entity_type, entity_id
--   comments       — entity_type, entity_id
--   customer_directory — line_user_id
--
-- Extends user_role enum:
--   Adds 'warehouse' value (stock_manager remains valid during transition)
--
-- Idempotent — safe to re-run without data loss.
--
-- Prerequisites:
--   schema.sql
--   migration_logistics_v2.sql
--   migration_messaging_api_v3.sql
--
-- Run in Supabase SQL Editor.
-- ============================================================


-- ============================================================
-- Section 1 — Extend user_role enum
-- ============================================================

-- 'warehouse' is added alongside 'stock_manager'.
-- stock_manager remains valid during the role transition period.
-- No existing rows are changed. No code changes required.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'warehouse';


-- ============================================================
-- Section 2 — Sequences and ref generator functions
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS order_ref_seq;
CREATE SEQUENCE IF NOT EXISTS trip_ref_seq;

CREATE OR REPLACE FUNCTION generate_order_ref()
RETURNS text AS $$
DECLARE
  today   text := to_char(current_date, 'YYYYMMDD');
  seq_val int;
BEGIN
  seq_val := nextval('order_ref_seq');
  RETURN 'ORD-' || today || '-' || lpad(seq_val::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_trip_ref()
RETURNS text AS $$
DECLARE
  today   text := to_char(current_date, 'YYYYMMDD');
  seq_val int;
BEGIN
  seq_val := nextval('trip_ref_seq');
  RETURN 'TRP-' || today || '-' || lpad(seq_val::text, 4, '0');
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- Section 3 — vehicles
-- ============================================================

CREATE TABLE IF NOT EXISTS vehicles (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          text        NOT NULL,
  make          text,
  model         text,
  license_plate text,
  vehicle_type  text,
  notes         text,
  active        boolean     NOT NULL DEFAULT true,
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS vehicles_updated_at ON vehicles;
CREATE TRIGGER vehicles_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE INDEX IF NOT EXISTS idx_vehicles_active
  ON vehicles(active) WHERE deleted_at IS NULL;

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "active users can read vehicles" ON vehicles;
CREATE POLICY "active users can read vehicles" ON vehicles
  FOR SELECT USING (auth_user_is_active());

DROP POLICY IF EXISTS "logistics and admins can manage vehicles" ON vehicles;
CREATE POLICY "logistics and admins can manage vehicles" ON vehicles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND active = true
        AND role IN ('admin', 'logistics')
    )
  );


-- ============================================================
-- Section 4 — odoo_sync_logs
-- (must precede orders — orders has a FK to this table)
-- ============================================================

CREATE TABLE IF NOT EXISTS odoo_sync_logs (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  status           text        NOT NULL DEFAULT 'running'
                               CHECK (status IN ('running', 'completed', 'failed')),
  records_imported integer,
  records_skipped  integer,
  error            text,
  triggered_by     uuid        REFERENCES profiles(id) ON DELETE SET NULL
  -- no updated_at: sync logs are append-only; finished_at marks completion
);

CREATE INDEX IF NOT EXISTS idx_odoo_sync_logs_status
  ON odoo_sync_logs(status);

CREATE INDEX IF NOT EXISTS idx_odoo_sync_logs_started_at
  ON odoo_sync_logs(started_at DESC);

ALTER TABLE odoo_sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins can read sync logs" ON odoo_sync_logs;
CREATE POLICY "admins can read sync logs" ON odoo_sync_logs
  FOR SELECT USING (auth_user_is_admin());

-- Inserts happen via service role (Odoo sync API route).
-- No browser-client insert policy needed.


-- ============================================================
-- Section 5 — orders
-- ============================================================

CREATE TABLE IF NOT EXISTS orders (
  id                   uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_ref            text        UNIQUE NOT NULL DEFAULT generate_order_ref(),
  source               text        NOT NULL
                                   CHECK (source IN ('odoo', 'manual')),
  odoo_order_ref       text        UNIQUE,
  odoo_sync_log_id     uuid        REFERENCES odoo_sync_logs(id) ON DELETE SET NULL,
  customer_id          uuid        REFERENCES customer_directory(id) ON DELETE SET NULL,
  customer_name_manual text,
  destination_id       uuid        REFERENCES destinations(id) ON DELETE SET NULL,
  destination_manual   text,
  priority             integer     NOT NULL DEFAULT 3
                                   CHECK (priority >= 1 AND priority <= 5),
  status               text        NOT NULL DEFAULT 'pending'
                                   CHECK (status IN (
                                     'pending', 'assigned', 'partial',
                                     'completed', 'cancelled'
                                   )),
  notes                text,
  -- nullable: Odoo-imported orders have no user actor (source='odoo')
  -- manual orders always have created_by set at API level
  created_by           uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  deleted_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE INDEX IF NOT EXISTS idx_orders_status
  ON orders(status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_priority
  ON orders(priority DESC, created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_customer_id
  ON orders(customer_id);

CREATE INDEX IF NOT EXISTS idx_orders_destination_id
  ON orders(destination_id);

CREATE INDEX IF NOT EXISTS idx_orders_odoo_order_ref
  ON orders(odoo_order_ref) WHERE odoo_order_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_created_by
  ON orders(created_by);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "active users can read orders" ON orders;
CREATE POLICY "active users can read orders" ON orders
  FOR SELECT USING (auth_user_is_active());

DROP POLICY IF EXISTS "active users can insert orders" ON orders;
CREATE POLICY "active users can insert orders" ON orders
  FOR INSERT WITH CHECK (auth_user_is_active());

DROP POLICY IF EXISTS "active users can update orders" ON orders;
CREATE POLICY "active users can update orders" ON orders
  FOR UPDATE USING (auth_user_is_active());


-- ============================================================
-- Section 6 — order_lines
-- ============================================================

CREATE TABLE IF NOT EXISTS order_lines (
  id                uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id          uuid        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_name      text        NOT NULL,
  product_code      text,
  sale_order_number text,
  qty_ordered       integer     NOT NULL CHECK (qty_ordered > 0),
  qty_sent          integer     NOT NULL DEFAULT 0 CHECK (qty_sent >= 0),
  status            text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'partial', 'sent')),
  notes             text,
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_lines_qty_sent_check CHECK (qty_sent <= qty_ordered)
);

DROP TRIGGER IF EXISTS order_lines_updated_at ON order_lines;
CREATE TRIGGER order_lines_updated_at
  BEFORE UPDATE ON order_lines
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE INDEX IF NOT EXISTS idx_order_lines_order_id
  ON order_lines(order_id);

CREATE INDEX IF NOT EXISTS idx_order_lines_status
  ON order_lines(status);

ALTER TABLE order_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "active users can read order lines" ON order_lines;
CREATE POLICY "active users can read order lines" ON order_lines
  FOR SELECT USING (auth_user_is_active());

DROP POLICY IF EXISTS "active users can insert order lines" ON order_lines;
CREATE POLICY "active users can insert order lines" ON order_lines
  FOR INSERT WITH CHECK (auth_user_is_active());

DROP POLICY IF EXISTS "active users can update order lines" ON order_lines;
CREATE POLICY "active users can update order lines" ON order_lines
  FOR UPDATE USING (auth_user_is_active());


-- ============================================================
-- Section 7 — trips
-- ============================================================

CREATE TABLE IF NOT EXISTS trips (
  id                 uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_ref           text        UNIQUE NOT NULL DEFAULT generate_trip_ref(),
  trip_date          date,
  status             text        NOT NULL DEFAULT 'planning'
                                 CHECK (status IN (
                                   'planning', 'ready', 'loading',
                                   'departed', 'completed', 'cancelled'
                                 )),
  driver_id          uuid        REFERENCES drivers(id) ON DELETE SET NULL,
  vehicle_id         uuid        REFERENCES vehicles(id) ON DELETE SET NULL,
  delivery_method    text        NOT NULL DEFAULT 'car'
                                 CHECK (delivery_method IN ('car', 'post', 'air', 'other')),
  -- Post / Courier
  courier_name       text,
  tracking_number    text,
  -- Air Freight
  cargo_company_name text,
  mawb               text,
  hawb               text,
  flight_number      text,
  etd                date,
  eta                date,
  -- Other
  other_method_name  text,
  other_reference    text,
  notes              text,
  -- NOT NULL: trips are always created by a user (logistics/admin)
  created_by         uuid        NOT NULL REFERENCES profiles(id),
  deleted_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trips_updated_at ON trips;
CREATE TRIGGER trips_updated_at
  BEFORE UPDATE ON trips
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE INDEX IF NOT EXISTS idx_trips_trip_date
  ON trips(trip_date) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_trips_status
  ON trips(status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_trips_driver_id
  ON trips(driver_id);

CREATE INDEX IF NOT EXISTS idx_trips_created_by
  ON trips(created_by);

ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "active users can read trips" ON trips;
CREATE POLICY "active users can read trips" ON trips
  FOR SELECT USING (auth_user_is_active());

DROP POLICY IF EXISTS "logistics and admins can insert trips" ON trips;
CREATE POLICY "logistics and admins can insert trips" ON trips
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND active = true
        AND role IN ('admin', 'logistics')
    )
  );

DROP POLICY IF EXISTS "logistics and admins can update trips" ON trips;
CREATE POLICY "logistics and admins can update trips" ON trips
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND active = true
        AND role IN ('admin', 'logistics')
    )
  );


-- ============================================================
-- Section 8 — trip_orders
-- (junction: which orders are assigned to which trip)
-- ============================================================

CREATE TABLE IF NOT EXISTS trip_orders (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id    uuid        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  order_id   uuid        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trip_orders_unique UNIQUE (trip_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_orders_trip_id
  ON trip_orders(trip_id);

CREATE INDEX IF NOT EXISTS idx_trip_orders_order_id
  ON trip_orders(order_id);

ALTER TABLE trip_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "active users can read trip orders" ON trip_orders;
CREATE POLICY "active users can read trip orders" ON trip_orders
  FOR SELECT USING (auth_user_is_active());

DROP POLICY IF EXISTS "logistics and admins can manage trip orders" ON trip_orders;
CREATE POLICY "logistics and admins can manage trip orders" ON trip_orders
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND active = true
        AND role IN ('admin', 'logistics')
    )
  );


-- ============================================================
-- Section 9 — trip_order_lines
-- (which order lines ship on this trip, at what quantity)
--
-- Integrity: trip_order_id FK → trip_orders guarantees the parent
-- order is assigned to this trip at the DB level.
-- API enforces: order_line.order_id = trip_order.order_id,
--   and qty_on_this_trip <= (qty_ordered - qty_sent).
-- ============================================================

CREATE TABLE IF NOT EXISTS trip_order_lines (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_order_id    uuid        NOT NULL REFERENCES trip_orders(id) ON DELETE CASCADE,
  order_line_id    uuid        NOT NULL REFERENCES order_lines(id) ON DELETE CASCADE,
  qty_on_this_trip integer     NOT NULL CHECK (qty_on_this_trip > 0),
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN (
                                 'pending', 'picking', 'packed',
                                 'ready', 'loaded', 'sent'
                               )),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trip_order_lines_unique UNIQUE (trip_order_id, order_line_id)
);

DROP TRIGGER IF EXISTS trip_order_lines_updated_at ON trip_order_lines;
CREATE TRIGGER trip_order_lines_updated_at
  BEFORE UPDATE ON trip_order_lines
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE INDEX IF NOT EXISTS idx_trip_order_lines_trip_order_id
  ON trip_order_lines(trip_order_id);

CREATE INDEX IF NOT EXISTS idx_trip_order_lines_order_line_id
  ON trip_order_lines(order_line_id);

CREATE INDEX IF NOT EXISTS idx_trip_order_lines_status
  ON trip_order_lines(status);

ALTER TABLE trip_order_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "active users can read trip order lines" ON trip_order_lines;
CREATE POLICY "active users can read trip order lines" ON trip_order_lines
  FOR SELECT USING (auth_user_is_active());

DROP POLICY IF EXISTS "logistics and admins can insert trip order lines" ON trip_order_lines;
CREATE POLICY "logistics and admins can insert trip order lines" ON trip_order_lines
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND active = true
        AND role IN ('admin', 'logistics')
    )
  );

-- Warehouse users update status (picking → packed → ready → loaded → sent)
DROP POLICY IF EXISTS "logistics warehouse and admins can update trip order lines" ON trip_order_lines;
CREATE POLICY "logistics warehouse and admins can update trip order lines" ON trip_order_lines
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND active = true
        AND role IN ('admin', 'logistics', 'warehouse')
    )
  );


-- ============================================================
-- Section 10 — tasks
-- ============================================================

CREATE TABLE IF NOT EXISTS tasks (
  id           uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  type         text        NOT NULL
                           CHECK (type IN ('follow_up', 'internal', 'other')),
  title        text        NOT NULL,
  body         text,
  entity_type  text        CHECK (entity_type IN (
                             'order', 'trip', 'customer', 'vehicle',
                             'driver', 'destination', 'task', 'delivery_card'
                           )),
  entity_id    uuid,
  assigned_to  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  -- nullable: system auto-creates tasks on partial shipment (no user actor)
  created_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  due_date     date,
  completed_at timestamptz,
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS tasks_updated_at ON tasks;
CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_open
  ON tasks(assigned_to)
  WHERE completed_at IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_entity
  ON tasks(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_tasks_created_by
  ON tasks(created_by);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "active users can read tasks" ON tasks;
CREATE POLICY "active users can read tasks" ON tasks
  FOR SELECT USING (auth_user_is_active());

DROP POLICY IF EXISTS "active users can insert tasks" ON tasks;
CREATE POLICY "active users can insert tasks" ON tasks
  FOR INSERT WITH CHECK (auth_user_is_active());

DROP POLICY IF EXISTS "assigned user or admin can update tasks" ON tasks;
CREATE POLICY "assigned user or admin can update tasks" ON tasks
  FOR UPDATE USING (
    assigned_to = auth.uid() OR auth_user_is_admin()
  );


-- ============================================================
-- Section 11 — notifications
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title       text        NOT NULL,
  body        text,
  entity_type text        CHECK (entity_type IN (
                            'order', 'trip', 'customer', 'vehicle',
                            'driver', 'destination', 'task', 'delivery_card'
                          )),
  entity_id   uuid,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
  -- no updated_at: read_at is the only mutable field
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can read own notifications" ON notifications;
CREATE POLICY "users can read own notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users can update own notifications" ON notifications;
CREATE POLICY "users can update own notifications" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

-- Inserts happen via service role only (system-triggered).


-- ============================================================
-- Section 12 — pinned_items
-- ============================================================

CREATE TABLE IF NOT EXISTS pinned_items (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entity_type text        NOT NULL
                          CHECK (entity_type IN (
                            'order', 'trip', 'customer', 'vehicle',
                            'driver', 'destination', 'task', 'delivery_card'
                          )),
  entity_id   uuid        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pinned_items_unique UNIQUE (user_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_pinned_items_user_id
  ON pinned_items(user_id);

ALTER TABLE pinned_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can read own pinned items" ON pinned_items;
CREATE POLICY "users can read own pinned items" ON pinned_items
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users can manage own pinned items" ON pinned_items;
CREATE POLICY "users can manage own pinned items" ON pinned_items
  FOR ALL USING (user_id = auth.uid());


-- ============================================================
-- Section 13 — Alter existing tables (additive, nullable columns)
--
-- All six columns use IF NOT EXISTS.
-- Existing rows are unaffected: new columns are null for all
-- existing records. No data is rewritten.
-- ============================================================

-- activity_log: add polymorphic entity link
-- Existing rows keep delivery_card_id; new entity rows set these.
ALTER TABLE activity_log
  ADD COLUMN IF NOT EXISTS entity_type text
    CHECK (entity_type IN (
      'order', 'trip', 'customer', 'vehicle',
      'driver', 'destination', 'task', 'delivery_card'
    )),
  ADD COLUMN IF NOT EXISTS entity_id uuid;

-- attachments: add polymorphic entity link
-- Existing rows keep delivery_card_id; new entity rows set these.
ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS entity_type text
    CHECK (entity_type IN (
      'order', 'trip', 'customer', 'vehicle',
      'driver', 'destination', 'task', 'delivery_card'
    )),
  ADD COLUMN IF NOT EXISTS entity_id uuid;

-- comments: add polymorphic entity link
-- Existing rows keep delivery_card_id; new entity rows set these.
ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS entity_type text
    CHECK (entity_type IN (
      'order', 'trip', 'customer', 'vehicle',
      'driver', 'destination', 'task', 'delivery_card'
    )),
  ADD COLUMN IF NOT EXISTS entity_id uuid;

-- customer_directory: add LINE user ID for customer messaging (Phase 7)
-- Nullable; not used until Phase 7. Can be populated manually in the
-- admin UI before Phase 7 is deployed.
ALTER TABLE customer_directory
  ADD COLUMN IF NOT EXISTS line_user_id text;
