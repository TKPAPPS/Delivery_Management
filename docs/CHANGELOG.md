# Changelog

## 2026-05-19 — LINE Messaging API, attachment hardening, email summary

### Breaking changes

**`line_groups.notify_token` renamed to `line_target_id`**
- Run `supabase/migration_messaging_api_v3.sql` in Supabase SQL Editor before deploying
- The column now stores the LINE group or user ID (the `to` field in Messaging API calls), not a per-group Notify token

**LINE Notify removed**
- `notify-api.line.me` was shut down 2025-03-31 and is no longer a valid endpoint
- All LINE sends now use LINE Messaging API (`api.line.me/v2/bot/message/push`)
- Required env vars: `LINE_CHANNEL_ACCESS_TOKEN` (channel access token from LINE Developers Console), `LINE_DEFAULT_TARGET_ID` (default group/user ID)
- Old per-group `notify_token` values stored in DB are now interpreted as `line_target_id` (group IDs) — update DB values to actual LINE group IDs if migrating from Notify

### New features

**Email summary (`/api/cards/[id]/send-summary`)**
- New `POST` endpoint that assembles a full plain-text card summary and sends it via Resend
- Includes: delivery ref, destination, status, priority, planned date, logistics section (per delivery method), all customers with sale orders and extra items, internal notes, delivery notes, and attachment download links
- Attachment links are 24-hour signed URLs generated at send time — no permanent public URLs exposed
- Logs to `communication_events` table; returns `attachments_linked` count in response
- `CommunicationPanel` has a new "Email Summary" button that opens a modal for recipient + optional subject override
- Toast shows attachment count on success (e.g. "Summary email sent (3 attachment links included)")

**Signed attachment URLs**
- `GET /api/cards/[id]/attachments` now returns `signed_url` (24-hour expiry) alongside the stored `file_url`
- `AttachmentSection` uses `signed_url` for downloads, falls back to `file_url` for older records
- URLs are generated server-side via Supabase Storage `createSignedUrl` — no public bucket policy required
- `Attachment` type extended with `signed_url?: string | null`

### Security / hardening

**Attachment upload validation**
- 20 MB per-file size limit enforced server-side (was unenforced)
- File type allowlist enforced by MIME type: JPEG, PNG, GIF, WebP, SVG, PDF, TXT, CSV, XLS, XLSX, DOC, DOCX
- Filenames sanitized server-side: non-alphanumeric chars (except `.`, `-`, `_`, space) replaced with `_`; spaces collapsed; max 200 chars
- Client-side pre-validation mirrors server limits (size + extension) to give immediate feedback without a round-trip
- `file_url` column now stores `storage_path` (not a public URL) for new uploads — signed URL generated on read

**Attachment orphan prevention**
- If DB insert fails after a successful storage upload, the orphaned file is immediately removed from storage
- Card DELETE now collects all `storage_path` values before deleting the card row, then removes them from storage (best-effort, errors logged but not fatal)

**Notification config warnings**
- `notifications.ts`: if `LINE_CHANNEL_ACCESS_TOKEN` is set but `LINE_DEFAULT_TARGET_ID` is missing, logs `console.warn` and skips LINE instead of silently doing nothing
- If `RESEND_API_KEY` is set but `NOTIFICATION_EMAIL` is missing, logs `console.warn` and skips email
- If neither channel is configured, logs a single `console.warn` and records status as `'skipped'`
- `RESEND_FROM_EMAIL` no longer has a placeholder default — must be set to a domain verified in Resend

**Communications API (`/api/communications`) explicit status**
- LINE path: returns `status: 'skipped'` with clear `error` string when token or target ID is missing
- Email path: returns `status: 'skipped'` with clear `error` string when `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, or recipient is missing
- Never returns a fake `'sent'` status when config is absent

### Admin UI

**`/admin/communications` — LINE group management**
- "LINE Notify Token" field renamed to "LINE Target ID" throughout
- Placeholder updated to reflect Messaging API group ID format (`Ca56f94637c...`)
- Info banner updated: explains LINE Developers Console setup, channel access token, webhook group ID capture

### Infrastructure

- New migration: `supabase/migration_messaging_api_v3.sql` — idempotent DO block; renames `notify_token → line_target_id` if needed, no-ops if already renamed, adds column if neither exists
- `CLAUDE.md` updated: LINE Messaging API setup, env vars table, attachment limits, signed URL behavior, email summary route, known manual setup steps

### Known limitations / manual setup required

- LINE Messaging API requires a LINE Official Account with Messaging API enabled — create at [developers.line.biz](https://developers.line.biz/)
- Bot must be invited to each target group chat before it can send messages
- Group IDs must currently be set manually in `line_groups.line_target_id` (webhook auto-capture is future work)
- `RESEND_FROM_EMAIL` must use a domain verified in the Resend dashboard before emails will deliver
- Browser verification not performed in CLI environment — test attachment upload/download and email sends manually after deploy

---

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
