-- Migration: enable RLS on pre_approved_emails (privilege-escalation fix)
--
-- pre_approved_emails was reachable via the public anon key through PostgREST with RLS disabled.
-- handle_new_user() (SECURITY DEFINER signup trigger) reads this table to auto-activate a new
-- signup and assign its role — so with the table world-writable, an attacker could insert their own
-- email with role='admin', sign up, and be auto-promoted to admin. App access is service-role only
-- (the /api/admin/users routes), and the trigger is SECURITY DEFINER; both bypass RLS, so enabling
-- RLS with no policies closes the hole without breaking signup or admin management.

alter table pre_approved_emails enable row level security;
