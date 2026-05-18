-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Enums
create type user_role as enum ('admin', 'sales', 'stock_manager', 'logistics');
create type delivery_status as enum ('draft', 'driver_needed', 'driver_booked', 'loaded');
create type delivery_priority as enum ('normal', 'urgent');
create type notification_status as enum ('pending', 'sent', 'failed', 'skipped');

-- Delivery ref sequence for human-readable IDs like DLV-20260518-0012
create sequence if not exists delivery_ref_seq;

-- Function to generate delivery_ref
create or replace function generate_delivery_ref()
returns text as $$
declare
  today text := to_char(current_date, 'YYYYMMDD');
  seq_val int;
begin
  seq_val := nextval('delivery_ref_seq');
  return 'DLV-' || today || '-' || lpad(seq_val::text, 4, '0');
end;
$$ language plpgsql;

-- profiles: extends auth.users
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  role user_role not null default 'sales',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger: create profile on auth.users insert
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email, name, active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- updated_at trigger function
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at before update on profiles
  for each row execute procedure set_updated_at();

-- drivers
create table drivers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  phone text,
  vehicle_type text,
  license_plate text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger drivers_updated_at before update on drivers
  for each row execute procedure set_updated_at();

-- delivery_cards
create table delivery_cards (
  id uuid primary key default uuid_generate_v4(),
  delivery_ref text unique not null default generate_delivery_ref(),
  destination text not null,
  planned_date date,
  status delivery_status not null default 'draft',
  status_changed_at timestamptz not null default now(),
  priority delivery_priority not null default 'normal',
  internal_notes text,
  driver_id uuid references drivers(id) on delete set null,
  driver_name_manual text,
  driver_phone_manual text,
  vehicle_type_manual text,
  license_plate_manual text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_archived boolean not null default false,
  archived_at timestamptz
);

create trigger delivery_cards_updated_at before update on delivery_cards
  for each row execute procedure set_updated_at();

-- Function to update status_changed_at on status change
create or replace function update_status_changed_at()
returns trigger as $$
begin
  if new.status != old.status then
    new.status_changed_at = now();
  end if;
  return new;
end;
$$ language plpgsql;

create trigger delivery_cards_status_changed before update on delivery_cards
  for each row execute procedure update_status_changed_at();

-- delivery_customers
create table delivery_customers (
  id uuid primary key default uuid_generate_v4(),
  delivery_card_id uuid not null references delivery_cards(id) on delete cascade,
  customer_name text not null,
  delivery_location text,
  notes text,
  partial_shipment boolean not null default false,
  partial_shipment_note text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger delivery_customers_updated_at before update on delivery_customers
  for each row execute procedure set_updated_at();

-- customer_sale_orders
create table customer_sale_orders (
  id uuid primary key default uuid_generate_v4(),
  delivery_customer_id uuid not null references delivery_customers(id) on delete cascade,
  sale_order_number text not null,
  notes text,
  created_at timestamptz not null default now()
);

-- extra_delivery_items
create table extra_delivery_items (
  id uuid primary key default uuid_generate_v4(),
  delivery_customer_id uuid not null references delivery_customers(id) on delete cascade,
  item_name text not null,
  quantity text,
  notes text,
  created_at timestamptz not null default now()
);

-- attachments
create table attachments (
  id uuid primary key default uuid_generate_v4(),
  delivery_card_id uuid not null references delivery_cards(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  file_type text,
  storage_path text not null,
  uploaded_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

-- comments
create table comments (
  id uuid primary key default uuid_generate_v4(),
  delivery_card_id uuid not null references delivery_cards(id) on delete cascade,
  user_id uuid not null references profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

-- activity_log
create table activity_log (
  id uuid primary key default uuid_generate_v4(),
  delivery_card_id uuid references delivery_cards(id) on delete cascade,
  user_id uuid references profiles(id),
  action text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- notification_events
create table notification_events (
  id uuid primary key default uuid_generate_v4(),
  type text not null,
  delivery_card_id uuid references delivery_cards(id) on delete set null,
  payload jsonb,
  status notification_status not null default 'pending',
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

-- planning_queue
create table planning_queue (
  id uuid primary key default uuid_generate_v4(),
  customer_name text not null,
  destination text,
  delivery_location text,
  sale_order_refs jsonb default '[]'::jsonb,
  extra_items jsonb default '[]'::jsonb,
  notes text,
  reason text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- Indexes for board/dashboard performance
create index idx_delivery_cards_status on delivery_cards(status) where not is_archived;
create index idx_delivery_cards_planned_date on delivery_cards(planned_date) where not is_archived;
create index idx_delivery_cards_created_by on delivery_cards(created_by);
create index idx_delivery_customers_card on delivery_customers(delivery_card_id);
create index idx_comments_card on comments(delivery_card_id);
create index idx_activity_log_card on activity_log(delivery_card_id);
create index idx_notification_events_status on notification_events(status);

-- RLS Policies
alter table profiles enable row level security;
alter table delivery_cards enable row level security;
alter table delivery_customers enable row level security;
alter table customer_sale_orders enable row level security;
alter table extra_delivery_items enable row level security;
alter table drivers enable row level security;
alter table attachments enable row level security;
alter table comments enable row level security;
alter table activity_log enable row level security;
alter table notification_events enable row level security;
alter table planning_queue enable row level security;

-- Helper: is current user active
create or replace function auth_user_is_active()
returns boolean as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and active = true
  );
$$ language sql security definer stable;

-- Helper: is current user admin
create or replace function auth_user_is_admin()
returns boolean as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and active = true and role = 'admin'
  );
$$ language sql security definer stable;

-- Profiles: users can read their own; admins can read all
create policy "users can read own profile" on profiles
  for select using (id = auth.uid());

create policy "admins can read all profiles" on profiles
  for select using (auth_user_is_admin());

create policy "admins can update all profiles" on profiles
  for update using (auth_user_is_admin());

create policy "users can update own profile name" on profiles
  for update using (id = auth.uid());

-- Delivery cards: all active users can read non-archived; service role manages writes via API
create policy "active users can read cards" on delivery_cards
  for select using (auth_user_is_active());

create policy "active users can insert cards" on delivery_cards
  for insert with check (auth_user_is_active());

create policy "active users can update cards" on delivery_cards
  for update using (auth_user_is_active());

-- Delivery customers, sale orders, extra items: readable by active users
create policy "active users can read customers" on delivery_customers
  for select using (auth_user_is_active());

create policy "active users can insert customers" on delivery_customers
  for insert with check (auth_user_is_active());

create policy "active users can update customers" on delivery_customers
  for update using (auth_user_is_active());

create policy "active users can delete customers" on delivery_customers
  for delete using (auth_user_is_active());

create policy "active users can read sale orders" on customer_sale_orders
  for select using (auth_user_is_active());

create policy "active users can insert sale orders" on customer_sale_orders
  for insert with check (auth_user_is_active());

create policy "active users can delete sale orders" on customer_sale_orders
  for delete using (auth_user_is_active());

create policy "active users can read extra items" on extra_delivery_items
  for select using (auth_user_is_active());

create policy "active users can insert extra items" on extra_delivery_items
  for insert with check (auth_user_is_active());

create policy "active users can delete extra items" on extra_delivery_items
  for delete using (auth_user_is_active());

-- Drivers: all active users can read; logistics/admin can write
create policy "active users can read drivers" on drivers
  for select using (auth_user_is_active());

create policy "logistics and admins can manage drivers" on drivers
  for all using (
    exists (
      select 1 from profiles
      where id = auth.uid() and active = true
      and role in ('admin', 'logistics')
    )
  );

-- Attachments: active users can read/insert; uploader or admin can delete
create policy "active users can read attachments" on attachments
  for select using (auth_user_is_active());

create policy "active users can upload attachments" on attachments
  for insert with check (auth_user_is_active());

create policy "uploader or admin can delete attachment" on attachments
  for delete using (
    uploaded_by = auth.uid() or auth_user_is_admin()
  );

-- Comments: active users can read/insert; owner or admin can delete
create policy "active users can read comments" on comments
  for select using (auth_user_is_active());

create policy "active users can insert comments" on comments
  for insert with check (auth_user_is_active() and user_id = auth.uid());

create policy "comment owner or admin can delete" on comments
  for delete using (user_id = auth.uid() or auth_user_is_admin());

-- Activity log: active users can read; system inserts via service role
create policy "active users can read activity" on activity_log
  for select using (auth_user_is_active());

create policy "active users can insert activity" on activity_log
  for insert with check (auth_user_is_active());

-- Notification events: service role only for writes; admins can read
create policy "admins can read notification events" on notification_events
  for select using (auth_user_is_admin());

create policy "active users can insert notification events" on notification_events
  for insert with check (auth_user_is_active());

-- Planning queue: active users can read/write
create policy "active users can read planning queue" on planning_queue
  for select using (auth_user_is_active());

create policy "active users can insert planning queue" on planning_queue
  for insert with check (auth_user_is_active());

create policy "active users can update planning queue" on planning_queue
  for update using (auth_user_is_active());

create policy "active users can delete planning queue" on planning_queue
  for delete using (auth_user_is_active());
