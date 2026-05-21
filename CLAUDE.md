# Delivery Board — Developer Guide

## What is this app?

An internal logistics delivery coordination tool. Users create delivery cards that track shipments from staging through driver booking to final loading. Cards contain customers (with sale orders), driver assignments, comments, attachments, and a full activity log.

## Stack

- **Next.js 14 App Router** with TypeScript (strict mode)
- **Tailwind CSS** + **lucide-react** for UI
- **Supabase** for Postgres, Storage, and Auth
- **@hello-pangea/dnd** for Kanban drag-and-drop (client component only)
- **Zustand** for toast + modal state (`src/store/`)
- **@supabase/ssr** for server/browser Supabase clients
- **No Resend SDK** — email sent via Resend REST API using native `fetch`
- **No LINE SDK** — LINE Messaging API called via native `fetch`

## Auth Flow

1. User clicks "Sign in with Google" on `/login`
2. `createSupabaseBrowserClient().signInWithOAuth()` redirects to Google
3. Google redirects to `/api/auth/callback?code=...`
4. Callback exchanges code for session, redirects to `/dashboard`
5. Middleware checks auth on every request (except `/login`, `/pending`, `/api/auth`)
6. If not authenticated → redirect to `/login`
7. If authenticated but profile inactive → redirect to `/pending`
8. First user must run `supabase/seed.sql` to activate their admin account

## Role System

Roles are stored in `profiles.role` (enum: `admin`, `sales`, `stock_manager`, `logistics`).

- **admin**: full access including user management, can delete cards
- **sales**: can create and manage delivery cards
- **stock_manager**: can view and update cards
- **logistics**: can manage cards + drivers + couriers/cargo-companies (but not users admin panel)

New users are created as `sales` with `active=false`. Admins activate them via `/admin/users`.

## API Route Patterns

All API routes follow this pattern:
```typescript
const ctx = await getSessionUser();
if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
const { user, profile, supabase } = ctx;

// For mutations — use admin client to bypass RLS:
const admin = createSupabaseAdminClient();
```

`getSessionUser()` in `src/lib/supabase-server.ts` centralizes all auth and active-profile checks. It returns `null` for unauthenticated users AND for users with `active=false`. Every route checks `if (!ctx)` — no per-route active-check is needed.

NEVER use `createSupabaseAdminClient()` in client components or files bundled client-side.

### Safe JSON body parsing

Use `parseBody` from `src/lib/parse-body.ts` instead of bare `req.json()`. This returns 400 for malformed JSON instead of an unhandled exception:
```typescript
import { parseBody } from '@/lib/parse-body';

const parsed = await parseBody<{ name: string }>(req);
if ('error' in parsed) return parsed.error;
const { name } = parsed.data;
```

## Activity Log

All mutations should call `logActivity()` from `src/lib/activity.ts`:
```typescript
await logActivity(deliveryCardId, userId, ACTIONS.CARD_CREATED, { extra: 'data' });
```

Common action constants are exported from `ACTIONS` in `src/lib/activity.ts`.

## Notifications (system-triggered)

`src/lib/notifications.ts` sends automatic notifications on status changes and card creation.

**Primary: LINE Messaging API**
- Requires `LINE_CHANNEL_ACCESS_TOKEN` (bot channel token) and `LINE_DEFAULT_TARGET_ID` (LINE group or user ID)
- Sends via `POST https://api.line.me/v2/bot/message/push`
- If token is set but target ID is missing → `console.warn`, skip LINE

**Fallback: Resend email**
- Runs when LINE did not succeed (failed or not configured)
- Requires `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (must be a verified sender domain), and `NOTIFICATION_EMAIL`
- Missing any of these → `console.warn`, skip email
- Uses native `fetch` to `https://api.resend.com/emails`

**Both missing:** `console.warn`, status written as `'skipped'` in DB. App does not crash.

Always inserts a `notification_events` row first and updates it with final status (`sent`, `failed`, `skipped`). Never throws.

### LINE Messaging API setup

1. Create a LINE Official Account and enable the Messaging API channel in [LINE Developers Console](https://developers.line.biz/)
2. Issue a long-lived channel access token
3. Set `LINE_CHANNEL_ACCESS_TOKEN` env var
4. Invite the bot to each internal group chat
5. Implement a webhook endpoint to receive the `join` event and capture the `groupId`
6. Store group IDs in the `line_groups.line_target_id` column (see `/admin/communications`)
7. Set `LINE_DEFAULT_TARGET_ID` to the default group ID for system notifications

The `line_groups` table holds per-group target IDs and auto-trigger configuration. The channel access token is global (env var), not per-group.

**Note:** LINE Notify (notify-api.line.me) was shut down March 31, 2025. Do not use it.

## Communications (manual sends from card detail)

`src/app/api/communications/route.ts` handles manual LINE and email sends from `CommunicationPanel`.

- LINE: uses `LINE_CHANNEL_ACCESS_TOKEN` + per-group `line_target_id` from DB (or `LINE_DEFAULT_TARGET_ID`)
- Email: uses `RESEND_API_KEY` + `RESEND_FROM_EMAIL`; recipient is entered by the user
- Email Summary: `POST /api/cards/[id]/send-summary` — fetches full card data, generates 24-hour signed attachment links, sends via Resend
- All sends logged to `communication_events` table with sent/failed/skipped status
- Missing config returns `status: 'skipped'` with clear error message — never fake success

## Delivery Methods

Cards support four delivery methods (`delivery_method` column, enum `delivery_method_type`):
- **car** — driver from roster or manual entry; fields: `driver_id`, `driver_name_manual`, etc.
- **post** — courier company + tracking number; fields: `courier_name`, `tracking_number`
- **air** — cargo company + air waybills; fields: `cargo_company_name`, `mawb`, `hawb`, `flight_number`, `etd`, `eta`
- **other** — free-form; fields: `other_method_name`, `other_reference`

The card detail page uses `src/components/cards/LogisticsSection.tsx` (replaced the deleted `DriverSection.tsx`).

## Attachments

Files are uploaded to Supabase Storage bucket `delivery-attachments`. Path format: `{card_id}/{timestamp}-{sanitized_filename}`.

- **Size limit:** 20 MB per file (enforced server-side and client-side)
- **Allowed types:** JPEG, PNG, GIF, WebP, SVG, PDF, TXT, CSV, XLS, XLSX, DOC, DOCX
- **Filenames:** sanitized server-side (non-alphanumeric chars replaced with `_`, max 200 chars)
- **Access:** `GET /api/cards/[id]/attachments` returns 24-hour signed URLs in `signed_url` field
- `AttachmentSection` uses `signed_url` for downloads; falls back to `file_url` if absent
- **Orphan prevention:** DB record deleted first; storage removal is best-effort with error logging
- **Card delete:** cleans up all attachment storage files before returning success
- To fully privatize files: change the Supabase Storage bucket policy to private in the dashboard

## Database Tables

| Table | Purpose |
|-------|---------|
| `profiles` | Extended auth.users with role + active flag |
| `drivers` | Driver roster (name, phone, vehicle, plate) |
| `courier_companies` | Courier/post company roster |
| `cargo_companies` | Air cargo company roster |
| `line_groups` | LINE groups with `line_target_id` and auto-trigger config |
| `delivery_cards` | Main delivery records with status, method, and logistics fields |
| `delivery_customers` | Customers on each delivery (1:many per card) |
| `customer_sale_orders` | SO numbers per customer |
| `extra_delivery_items` | Non-SO items per customer |
| `attachments` | Files uploaded to Supabase Storage |
| `comments` | Comment threads per card |
| `activity_log` | Immutable audit log per card |
| `notification_events` | Log of all system notification attempts |
| `communication_events` | Log of manual LINE/email sends from the card detail panel |
| `planning_queue` | Holding area for unloaded/deferred customers |

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key (safe for client) | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — server-only, bypasses RLS | Yes |
| `NEXT_PUBLIC_SITE_URL` | App base URL for OAuth redirect | Yes |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API channel access token | Optional |
| `LINE_DEFAULT_TARGET_ID` | Default LINE group/user ID for system notifications | Optional |
| `RESEND_API_KEY` | Resend email API key | Optional |
| `RESEND_FROM_EMAIL` | Verified sender address for emails — **must be a domain verified in Resend** | Optional |
| `NOTIFICATION_EMAIL` | Recipient for system notification emails | Optional |

## Supabase Storage

Bucket name: `delivery-attachments`
Upload path: `{card_id}/{timestamp}-{sanitized_filename}`
Signed URL expiry: 24 hours (generated on read, not stored)

To switch to private storage: change the bucket policy to private in the Supabase dashboard. The code already uses signed URLs for reads and stores only `storage_path` in `file_url`.

## Deployment

`vercel.json` sets region to `sin1` (Singapore).
Run `vercel --prod` after setting all env vars in Vercel dashboard.
Add the Vercel URL to Supabase Authentication → URL Configuration.

## Orders (Phase 2)

The `orders` table is the new order-based workflow alongside the old delivery card system.

### Order sources
- `manual` — created by users via UI; `created_by` is always set
- `odoo` — imported via sync (Phase 3, not yet built); `created_by` may be null

### Priority
Integer 1–5. Default 3 (Medium). Labels: 1=Lowest, 2=Low, 3=Medium, 4=High, 5=Critical.

### Order status flow
`pending` → `assigned` → `partial` → `completed` (or `cancelled` at any point)

### Order line status
`pending` → `partial` → `sent` (updated by warehouse workflow, Phase 4)

### Soft delete
Orders and order lines use `deleted_at timestamptz`. Never set `deleted_at` from the client. DELETE endpoints set it server-side.

### API conventions
- `source`, `order_ref`, `created_by`, `qty_sent`, `deleted_at` are never accepted from client
- Priority and qty_ordered are validated server-side (400 if invalid)
- Lines on completed/cancelled orders return 409

### Activity log for orders
```typescript
await logActivity(null, user.id, ACTIONS.ORDER_CREATED, { order_ref }, { entity_type: 'order', entity_id: order.id });
```
The first param is `null` (no delivery_card_id). Existing card calls pass a string — no change needed.

### Order API routes
- `GET/POST /api/orders` — list (with line count enrichment) + create
- `GET/PATCH/DELETE /api/orders/[id]` — detail + update (whitelisted fields) + soft delete (admin)
- `GET/POST /api/orders/[id]/lines` — list non-deleted lines + add line
- `PATCH/DELETE /api/order-lines/[id]` — update line (whitelisted) + soft delete

### Order pages
- `/orders` — Orders Pool client page with filters (status/priority/source/search)
- `/orders/[id]` — server page → OrderDetailClient (edit, lines management, activity log)

## Key Files

- `src/middleware.ts` — auth guard for all routes; early-returns for `/api/*` routes to prevent redirect swallowing
- `src/lib/supabase-server.ts` — server Supabase clients + `getSessionUser()` (server-only)
- `src/lib/supabase-browser.ts` — browser Supabase client
- `src/lib/activity.ts` — activity log helper
- `src/lib/notifications.ts` — LINE Messaging API (primary) + Resend email (fallback) for system notifications
- `src/lib/parse-body.ts` — safe JSON body parser; use instead of bare `req.json()`
- `src/app/(protected)/board/BoardClient.tsx` — drag-and-drop Kanban
- `src/app/(protected)/cards/[id]/CardDetailClient.tsx` — card detail page
- `src/components/cards/LogisticsSection.tsx` — delivery method selector + per-method sub-form
- `src/components/cards/CommunicationPanel.tsx` — manual LINE/email sends + email summary from card detail
- `src/components/cards/AttachmentSection.tsx` — file upload/view/delete with signed URLs
- `src/app/api/cards/[id]/send-summary/route.ts` — email summary with 24-hour attachment links
- `supabase/schema.sql` — full DB schema (base)
- `supabase/migration_logistics_v2.sql` — delivery method columns, courier/cargo/line_groups/communication_events tables
- `supabase/migration_messaging_api_v3.sql` — idempotent; renames line_groups.notify_token → line_target_id (no-op if already renamed)
- `supabase/migration_ops_platform_v1.sql` — Phase 1 ops platform schema (vehicles, orders, order_lines, trips, trip_orders, trip_order_lines, tasks, notifications, pinned_items)
- `supabase/seed.sql` — first admin setup
- `src/app/(protected)/orders/page.tsx` — Orders Pool (client page)
- `src/app/(protected)/orders/[id]/OrderDetailClient.tsx` — order detail (edit, lines, activity)
- `src/components/orders/CreateOrderModal.tsx` — manual order creation form
