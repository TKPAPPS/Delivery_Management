# Changelog

## 2026-05-19 — Multi-method logistics, communications, and correctness fixes

### New features

**Multi-method delivery support**
- Cards now carry a `delivery_method` field: `car`, `post`, `air`, or `other`
- `LogisticsSection` component replaces the old `DriverSection` with a method selector and per-method sub-form
  - Car: driver roster dropdown or manual name/phone
  - Post: courier company dropdown (admin-managed) + tracking number
  - Air: cargo company dropdown + MAWB/HAWB/flight number/ETD/ETA
  - Other: free-text method name + reference number
- New admin pages: `/admin/courier-companies`, `/admin/cargo-companies`
- New DB tables: `courier_companies`, `cargo_companies`
- New DB columns on `delivery_cards`: `delivery_method`, `courier_name`, `tracking_number`, `cargo_company_name`, `mawb`, `hawb`, `flight_number`, `etd`, `eta`, `other_method_name`, `other_reference`

**Communications panel**
- New `CommunicationPanel` component on card detail: send LINE or email directly from a card
- LINE: pick a group (from admin-configured `line_groups` table), write a message, send
- Email: enter recipient, subject, body — sent via Resend REST API
- All sends logged to `communication_events` table with status (sent/failed/skipped)
- New admin page: `/admin/communications` — manage LINE groups and auto-trigger config

**Notifications**
- `notifications.ts` now has a Resend email fallback: if LINE Notify fails or is not configured, falls back to email via `RESEND_API_KEY` + `NOTIFICATION_EMAIL`
- Logs a console warning if neither channel is configured
- No new npm dependencies — Resend used via native `fetch`

### Status / delivery flow changes

Status names updated throughout (old → new):
- `driver_needed` → `pending_booking`
- `driver_booked` → `booked`
- `loaded` → `in_transit`

Board Kanban columns, dashboard stats, history page, and all API filters updated.

### Bug fixes

**Drag-and-drop not persisting** — two separate bugs:
1. Middleware was redirecting `/api/*` PATCH requests to `/login` when the session needed refreshing; `fetch()` silently followed the redirect and returned 200 HTML, so the board thought the save succeeded. Fixed by adding an early return in `middleware.ts` for `/api/*` routes.
2. Next.js 30-second router cache caused the board to visually revert to a stale snapshot on soft navigation. Fixed with `staleTimes: { dynamic: 0 }` in `next.config.mjs` + a `loading.tsx` skeleton for the board route.

**Auth security** — `getSessionUser()` switched from `getSession()` (reads JWT from cookie, no server verification) to `getUser()` (verifies with Supabase auth server, handles token refresh).

### Correctness / reliability

**Safe JSON parsing** — new `src/lib/parse-body.ts` helper; all 26 API routes updated to return HTTP 400 for malformed JSON instead of an unhandled exception.

**Dead code removal** — `src/components/cards/DriverSection.tsx` deleted (replaced by `LogisticsSection`, had zero imports).

**Active user guard** — confirmed centralized in `getSessionUser()`; all routes check `if (!ctx)` which covers both unauthenticated and inactive users. No per-route patching needed.

### Infrastructure

- `loading.tsx` skeleton added for the board route (shown during SSR re-fetch on navigation)
- New migration: `supabase/migration_logistics_v2.sql`
- `CLAUDE.md` updated to reflect current architecture
