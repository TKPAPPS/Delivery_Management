# Changelog

All notable changes to this project are documented here. Dates are YYYY-MM-DD.

## 2026-06-02

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
