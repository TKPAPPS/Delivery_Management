-- Migration: enable RLS on app_settings
--
-- app_settings was created (v5) without row-level security, leaving it reachable via the public
-- anon key through PostgREST — anyone could read/write settings (e.g. flip the LINE master switch),
-- bypassing the admin-only PUT /api/line-settings guard. The app only ever touches this table via
-- the service-role admin client, which bypasses RLS, so enabling RLS with no policies locks out
-- anon/authenticated while leaving the app fully functional.

alter table app_settings enable row level security;
