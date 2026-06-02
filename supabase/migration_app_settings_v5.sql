-- Migration: generic app_settings key/value store
--
-- Backs admin-controlled global settings. First use: LINE notifications master ON/OFF
-- (key='line_master_enabled', value={"enabled":true}). A missing key reads as enabled in code,
-- so no seed row is required and existing behaviour is preserved.

create table if not exists app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);
