-- Migration: security hardening (Supabase advisor WARNs)
--
-- 1) Pin search_path on flagged no-arg functions (clears function_search_path_mutable).
-- 2) Revoke RPC EXECUTE on the two trigger-only SECURITY DEFINER functions. Triggers fire
--    regardless of EXECUTE grants, so this is safe and stops them being callable via /rest/v1/rpc.
--
-- IMPORTANT: auth_user_is_active() / auth_user_is_admin() are NOT revoked. They are used inside RLS
-- policies on nearly every table, so the `authenticated` role MUST keep EXECUTE or all RLS checks
-- fail. Their "executable by authenticated" advisor warning is expected for RLS helper functions.
--
-- Manual follow-up (not SQL): enable Leaked Password Protection in Supabase -> Authentication.

alter function public.update_status_changed_at() set search_path = public;
alter function public.set_updated_at() set search_path = public;
alter function public.update_destinations_updated_at() set search_path = public;
alter function public.update_customer_directory_updated_at() set search_path = public;
alter function public.generate_order_ref() set search_path = public;
alter function public.generate_trip_ref() set search_path = public;
alter function public.generate_delivery_ref() set search_path = public;
alter function public.auth_user_is_active() set search_path = public;
alter function public.auth_user_is_admin() set search_path = public;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.update_customer_directory_updated_at() from public, anon, authenticated;
