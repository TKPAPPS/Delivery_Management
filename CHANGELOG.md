# Changelog

All notable changes to this project are documented here. Dates are YYYY-MM-DD.

## 2026-06-02 (audit follow-up — should-fix + polish)

- **Security hardening:** pinned `search_path` on all flagged DB functions and revoked RPC EXECUTE on
  the two trigger-only SECURITY DEFINER functions (cleared 9 + 2 Supabase advisor warnings). The
  `auth_user_is_active`/`auth_user_is_admin` warnings are kept intentionally — they're RLS helpers
  that must stay executable. (Manual follow-up: enable Leaked Password Protection in Supabase Auth.)
- **Notification observability:** admin `GET /api/notifications` + a "Recent notifications" panel,
  a connection-status indicator, and a "Send test" button on Communications.
- **No duplicate LINE groups:** unique index on `line_groups.line_target_id`; the webhook now upserts.
- **Cleanup:** removed the legacy `planning_queue` table + API routes and dead `PlanningQueueItem`
  type; stripped env-var names from user-facing copy; fixed `.env.local.example`; verified the manual
  DB types match the live schema (the old courier/cargo drift note no longer applies).
- **Polish:** self-service `/account` (edit own name) via the navbar; admin "Settings" renamed to
  "Destinations"; loading skeletons for dashboard/orders/planning-queue/archive; first-run CTA on an
  empty dashboard; horizontally-scrollable admin tables on mobile; Communications <-> Msg Templates
  cross-links.

## 2026-06-02 (whole-app must-fix round)

- **Error/not-found pages:** added app-level `not-found.tsx`, `error.tsx`, and `global-error.tsx` so
  bad URLs or server errors show a styled page with a recovery link instead of the bare Next default.
- **Card soft-delete + restore:** deleting a delivery card now sets `deleted_at` (reversible) instead
  of hard-deleting; attachments are kept. All card list views filter out deleted cards; admins get a
  "Deleted" tab in History with one-click Restore. Replaces irreversible hard delete.
- **Simplified roles:** the user role picker now offers only admin / logistics / Staff (the enforced
  roles). `stock_manager` and `warehouse` (which gated nothing) are no longer assignable; existing
  such users were migrated to Staff.
- **Pending-signup alert:** when a new account lands in "pending", a one-time LINE message is sent to
  the team group so admins activate it promptly (`profiles.pending_notified` guards against repeats).

## 2026-06-02

### Security & copy fixes (post-audit must-fix)

- **Enabled RLS on `pre_approved_emails`** (privilege-escalation fix). The table was reachable via
  the public anon key with RLS off, and the `handle_new_user()` signup trigger reads it to
  auto-activate signups and assign their role - so an attacker could insert their own email with
  `role='admin'`, sign up, and be auto-promoted. Verified pre-fix anon could read 2 admin rows;
  post-fix anon read returns empty and insert is rejected (403). App/admin access (service role) and
  the SECURITY DEFINER trigger are unaffected.
- **Enabled RLS on `app_settings`** (it was the only public table without it). The table is reachable
  via the public anon key through PostgREST, so without RLS anyone could read/write settings and flip
  the LINE master switch, bypassing the admin-only API. RLS is now on with no policies — the
  service-role client (only writer) still works; anon/authenticated are denied (verified: anon read
  empty, update 0 rows, insert 403).
- Clarified the master-switch help copy: it covers automatic **team** notifications (LINE + fallback
  email) only — not customer emails (Msg Templates) and not manual sends from a card.

### LINE notifications: master switch, per-group routing, token + webhook

- Added a **master ON/OFF switch** (top of `/admin/communications`) that mutes all automatic
  notifications when off (no LINE, no fallback email). Stored in the new `app_settings` table,
  read by `sendNotification`, edited via `GET/PUT /api/line-settings` (PUT admin-only).
- Automatic notifications now route **only to active groups** whose `auto_triggers` include the
  event. An event no active group subscribes to is silent; removed the hidden
  `LINE_DEFAULT_TARGET_ID` catch-all from automatic routing.
- `Deactivate` now actually pauses a group's messages (routing respects the `active` flag), and
  groups can be **deleted** from the UI (styled confirm dialog).
- `driver_assigned` is now a routable per-group event.
- LINE auth reworked into `src/lib/line.ts`: mints short-lived **stateless tokens** from
  `LINE_CHANNEL_ID` + `LINE_CHANNEL_SECRET` (cached ~14 min), falling back to a long-lived
  `LINE_CHANNEL_ACCESS_TOKEN`.
- New signed webhook `POST /api/line/webhook` auto-captures group/room IDs into `line_groups`.
- Schema: renamed `line_groups.token` to `line_target_id` (fixes silently-failing group
  reads/writes); added `app_settings` key/value table.

### Deliveries

- Delivery Type (motorcycle) is selectable only when the delivery method is "Other"; cleared for
  car/post/air.
- Assigning a driver auto-advances a draft / pending-booking card to **Booked** (never downgrades).
- Marking a card **Delivered** now also completes its linked order locally (no Odoo write-back) and
  moves the card to History.
