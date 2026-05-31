# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is this app?

An internal logistics delivery coordination tool for **The Kosher Place (TKP)** in Thailand (Bangkok, Koh Samui, Koh Phangan, Phuket). Users create delivery cards that track shipments from staging through driver booking to final loading. Cards contain customers (with sale orders), driver assignments, comments, attachments, and a full activity log.

## Product Goals

The app exists to turn sales demand into coordinated, tracked deliveries with one consistent picture for the whole team. Concretely:

1. **Single source of truth per delivery** — one `delivery_cards` row; Planning Queue, Dashboard Draft, and the board's Draft column are all views of the same draft rows. No duplicate/unsynced copies.
2. **Clear lifecycle** — `draft → pending_booking → booked → in_transit → delivered` on a drag-and-drop Kanban board, with an immutable activity log.
3. **Per-delivery logistics** — multiple customers (each with sale orders + extra items), delivery method (car/post/air/other), delivery type (our motorcycle vs delivery-company motorcycle), driver/courier/cargo assignment, attachments, comments.
4. **Real-time sync** — status/driver/type/movement changes propagate live across sections via Supabase Realtime.
5. **Automatic customer emails** — admin-authored, status-based email templates auto-sent to opted-in customers (email only, logged, non-blocking).
6. **Odoo ingestion, read-only** — confirmed Odoo 18 sale orders sync into the Orders Pool. Hard guarantee: no write-back to Odoo (the client rejects all non-read methods).
7. **Reliability over polish** — audited API routes, graceful degradation (emails/notifications log skipped/failed, never crash a workflow).

### Order → Delivery bridge

Orders are turned into deliveries via **`POST /api/deliveries/from-orders`** `{ order_ids: string[] }`: it creates one **draft** `delivery_card`, one `delivery_customer` per order (name/email pulled from the linked Customer Directory entry), maps distinct `sale_order_number`s → `customer_sale_orders` and each order line → `extra_delivery_items`, then marks each order `status='assigned'` and sets `orders.delivery_card_id` (FK, `on delete set null`). UI: "Create Delivery" on the order detail page, and multi-select → "Create Delivery" on the Orders Pool (merges several orders into one card, each as a customer). The Orders Pool defaults to an **"Active (unassigned)"** view that hides assigned/completed/cancelled; assigned rows link to their card. Partial/qty-based fulfillment is out of scope (warehouse Phase 4).

## Commands

```bash
npm run dev        # Start dev server (Next.js)
npm run build      # Production build
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit (no test suite exists)
```

## Stack

- **Next.js 14 App Router** with TypeScript (strict mode)
- **Tailwind CSS** + **lucide-react** for UI
- **Supabase** for Postgres, Storage, and Auth
- **@hello-pangea/dnd** for Kanban drag-and-drop (client component only)
- **Zustand** for toast + modal state (`src/store/`)
- **@supabase/ssr** for server/browser Supabase clients
- **No Resend SDK** — email sent via Resend REST API using native `fetch`
- **No LINE SDK** — LINE Messaging API called via native `fetch`

## Route Structure

```
src/app/
  (protected)/     # Requires auth + active profile; layout wraps AppShell
    board/         # Kanban board (drag-and-drop)
    cards/[id]/    # Card detail + print
    orders/        # Orders pool + detail
    planning-queue/
    archive/
    dashboard/
  (admin)/         # Requires auth + admin (or logistics for some routes)
    admin/users, drivers, customers, cargo-companies,
           courier-companies, communications, odoo-sync, settings
  api/             # Never redirected by middleware; handles auth internally
  login/, pending/ # Public
```

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

Roles are stored in `profiles.role` (enum: `admin`, `sales`, `stock_manager`, `logistics`, `warehouse`).

- **admin**: full access including user management, can delete cards
- **sales**: can create and manage delivery cards
- **stock_manager**: can view and update cards
- **logistics**: can manage cards + drivers + couriers/cargo-companies (but not users admin panel)
- **warehouse**: warehouse workflow role (used in order line status updates, Phase 4)

New users are created as `sales` with `active=false`. Admins activate them via `/admin/users`.

Middleware also allows `logistics` role on `/admin/drivers`, `/admin/customers`, `/admin/settings`, `/admin/courier-companies`, `/admin/cargo-companies`.

## Supabase Client Selection

Three clients — use the right one:

| Client | Where to use | How |
|--------|-------------|-----|
| `createSupabaseServerClient()` | Server components, API routes (read with RLS) | `src/lib/supabase-server.ts` |
| `createSupabaseAdminClient()` | API route mutations (bypasses RLS) | `src/lib/supabase-server.ts` — server-only |
| `createSupabaseBrowserClient()` | Client components | `src/lib/supabase-browser.ts` |

**NEVER** use `createSupabaseAdminClient()` in client components or files bundled client-side.

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

Common action constants are exported from `ACTIONS` in `src/lib/activity.ts`. For orders (no card), pass `null` as first arg and add `{ entity_type: 'order', entity_id: order.id }` options.

## TypeScript Types

All app types live in `src/types/index.ts`. The `Database` type is manually maintained (not Supabase-generated) — update it when schema changes. Composite types like `DeliveryCardFull`, `DeliveryCardWithCustomers`, `OrderWithLines`, `OrderListItem` are defined there too.

> **Schema drift warning:** `supabase/schema.sql` is the original base and is **stale** — it predates the status enum rename (`draft/pending_booking/booked/in_transit/delivered`), the `delivery_method` column, and later migrations. The live DB is the source of truth. **Query the live database before writing any migration** (project ref `jcfxuilzylsfxfsbinak`, "Delivery Management Tkp"). Some live column names also differ from `src/types/index.ts` (e.g. live `courier_company_name`/`mawb_number`/`cargo_etd` vs the type's `courier_name`/`mawb`/`etd`) — `LogisticsSection` post/air/other saves are affected by this latent mismatch; don't assume the types match the DB for those fields.

## Cross-Section Sync (single source of truth)

There is **one** record per delivery: a row in `delivery_cards`. The Planning Queue, the Dashboard "Draft" panel, and the board's Draft column are all **views of the same `status='draft'` rows** — there is no separate planning-queue store anymore.

- **Planning Queue** (`/planning-queue`) lists `delivery_cards` where `status='draft'`, ordered by `sort_order` then `created_at`. "Add to Queue" creates a draft card via `POST /api/cards` (destination defaults to `'Unassigned'`). "To Board" promotes it (`PATCH /api/cards/[id]/status` → `pending_booking`). Reorder persists `sort_order` via `PATCH /api/cards/[id]`.
- **Dashboard Draft panel** (`dashboard/page.tsx`) filters the same draft cards.
- **Unload a customer** (`PATCH /api/customers/[id]` with `unload`) spins off a **new draft card** and reassigns the customer (sale orders + extra items follow via FK) — it no longer writes to the legacy `planning_queue` table.
- **Deleting drafts:** `DELETE /api/cards/[id]` allows any active user to delete a `status='draft'` card (Planning Queue removal); deleting non-draft cards stays admin-only.

The legacy `planning_queue` table and its `/api/planning-queue` routes still exist but are **unused** (empty after the unification migration). Do not write new code against them.

## Delivery Type

`delivery_cards.delivery_type` (`'our_motorcycle' | 'company_motorcycle' | null`) is a **separate field** from `delivery_method` (`car/post/air/other`). Selectable in `CreateCardModal` and `LogisticsSection`; shown as a chip in the logistics header. Validated server-side in `POST /api/cards`; passes through the `PATCH /api/cards/[id]` body.

## Customer Status Emails (template-driven, email only)

On every status change, `sendStatusCustomerEmails()` in `src/lib/customer-messages.ts` (fire-and-forget from the status route) emails customers — **no LINE**, distinct from the internal `notifications.ts` system.

- **Templates:** `message_templates` table, **one active row per `delivery_status`**, managed at `/admin/message-templates` (admin only; `GET` + `PUT` upsert at `/api/message-templates`). Body/subject support `{{customer_name}}`, `{{driver_name}}`, `{{driver_phone}}`, `{{destination}}`, `{{delivery_ref}}`, `{{planned_date}}` placeholders.
- **Recipients:** every customer on the card with a non-empty `customer_email` **and** `receive_auto_emails = true`. Both conditions required.
- **Customer email source:** `delivery_customers.customer_email` (+ `customer_directory_id` link). Captured when picking from the directory (`CustomerPicker.onSelectEntry`), editable in `CreateCardModal`, `AddCustomerForm`, `CustomerSection`, and the `/admin/customers` directory page.
- **Sending:** Resend REST API via `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (recipient is the customer's email; `NOTIFICATION_EMAIL` is NOT used here). Each attempt logged to `communication_events` with `triggered_by='auto_status:<status>'`. Never throws — missing config / bad address logs `skipped`/`failed`.

## Realtime

Supabase Realtime is enabled on `delivery_cards` and `delivery_customers` (publication `supabase_realtime`).

- **Client board / planning queue** subscribe directly and refetch on change.
- **Server-rendered pages** (e.g. dashboard) embed `<RealtimeRefresh />` (`src/components/RealtimeRefresh.tsx`), which calls `router.refresh()` on any change — no need to convert them to client components.

## UI Patterns

**Toasts:** `useToastStore` from `src/store/toastStore.ts` — call `addToast(message, type)`. Auto-dismiss in 4s.

**Modals:** `src/store/modalStore.ts` for shared modal state.

**Utilities** (`src/lib/utils.ts`): `cn()` (clsx + tailwind-merge), `formatDate()`, `formatDateTime()`, `statusLabel()`, `statusColor()`, `orderPriorityLabel()`, `orderPriorityColor()`, `orderStatusLabel()`, `orderStatusColor()`, `timeAgo()`.

**UI components** (`src/components/ui/`): `Button`, `Input`, `Select`, `Textarea`, `Modal`, `Badge`, `Toast`, `ConfirmDialog`, `DatePicker`, `EmptyState`, `LoadingSpinner`, `DestinationInput`.

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

## Database Tables

| Table | Purpose |
|-------|---------|
| `profiles` | Extended auth.users with role + active flag |
| `drivers` | Driver roster (name, phone, vehicle, plate) |
| `courier_companies` | Courier/post company roster |
| `cargo_companies` | Air cargo company roster |
| `line_groups` | LINE groups with `line_target_id` and auto-trigger config |
| `delivery_cards` | Main delivery records — status, `delivery_method`, `delivery_type`, `sort_order`, logistics fields. `status='draft'` rows are the Planning Queue. |
| `delivery_customers` | Customers on each delivery (1:many per card). Includes `customer_directory_id` (FK), `customer_email`, `receive_auto_emails`. |
| `customer_directory` | Reusable customer records (name, `email`, contact, address). |
| `customer_sale_orders` | SO numbers per customer |
| `extra_delivery_items` | Non-SO items per customer |
| `message_templates` | One customer-email template per `delivery_status` (admin-managed) |
| `attachments` | Files uploaded to Supabase Storage |
| `comments` | Comment threads per card |
| `activity_log` | Immutable audit log per card |
| `notification_events` | Log of all internal system notification attempts |
| `communication_events` | Log of manual + automatic customer email/LINE sends |
| `planning_queue` | **Legacy/unused** — superseded by draft `delivery_cards` |

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

### Order API routes
- `GET/POST /api/orders` — list (with line count enrichment) + create
- `GET/PATCH/DELETE /api/orders/[id]` — detail + update (whitelisted fields) + soft delete (admin)
- `GET/POST /api/orders/[id]/lines` — list non-deleted lines + add line
- `PATCH/DELETE /api/order-lines/[id]` — update line (whitelisted) + soft delete

## Odoo Sync (Phase 3)

Read-only import of confirmed Odoo 18 sale orders. No writeback. Manual trigger only.

### Connection
- Protocol: XML-RPC over HTTPS (`xmlrpc` npm package, `export const runtime = 'nodejs'` required)
- Auth: `authenticate(db, username, api_key, {})` on `/xmlrpc/2/common` → uid
- Data: `execute_kw(...)` on `/xmlrpc/2/object`
- Timeout: 30 seconds per request

### Required environment variables
`ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_API_KEY` — all must be set or sync returns 503.

### Sync state filter
Defined in `src/lib/odoo.ts` as `ODOO_SYNC_STATES = ['sale', 'done']`. Edit here to change.

### Dedup key
`odoo_order_ref` (Odoo `sale.order.name`, e.g. `S00001`). `order_ref` is always DB-generated — never set from Odoo.

### Line identity
`order_lines.odoo_line_id` (Odoo line id) + partial unique index `(order_id, odoo_line_id) WHERE odoo_line_id IS NOT NULL AND deleted_at IS NULL`. Lines with `qty_sent > 0` are never overwritten; logged as warnings in `error_details`.

### Product resolution
Two-pass: read `sale.order.line` fields, then batch read `product.product` for unique product IDs to get `default_code` + `display_name`.

### Sync route design
- `POST /api/sync/odoo` — admin only; optional body `{ since?: string }`; 409 if already running; 503 if unconfigured
- `GET /api/sync/odoo/logs` — admin only; last 20 `odoo_sync_logs` rows

## Deployment

`vercel.json` sets region to `sin1` (Singapore). The repo (`TKPAPPS/Delivery_Management`) **auto-deploys to Vercel on push to `main`** (Vercel project `delivery-management`, TKPAPPS team). Set env vars in the Vercel dashboard; env var changes need a redeploy to take effect. Add the Vercel URL to Supabase Authentication → URL Configuration.

> The local `.vercel/project.json` is stale (points to a non-existent `delivery-board` project ID). The live project is `delivery-management`.

## Key Files

- `src/middleware.ts` — auth guard for all routes; early-returns for `/api/*` routes to prevent redirect swallowing
- `src/lib/supabase-server.ts` — server Supabase clients + `getSessionUser()` (server-only)
- `src/lib/supabase-browser.ts` — browser Supabase client
- `src/lib/activity.ts` — activity log helper + `ACTIONS` constants
- `src/lib/notifications.ts` — LINE Messaging API (primary) + Resend email (fallback) for INTERNAL system notifications
- `src/lib/customer-messages.ts` — template-driven CUSTOMER status emails (Resend, email only); called from the status route
- `src/components/RealtimeRefresh.tsx` — drop-in client component for live refresh of server-rendered pages
- `src/app/api/message-templates/route.ts` — GET list + PUT upsert (admin) for customer email templates
- `src/app/(admin)/admin/message-templates/page.tsx` — admin editor for per-status templates
- `src/lib/parse-body.ts` — safe JSON body parser; use instead of bare `req.json()`
- `src/lib/utils.ts` — `cn()`, `formatDate/DateTime()`, status/priority label+color helpers
- `src/types/index.ts` — all TypeScript types (manually maintained, not generated)
- `src/store/toastStore.ts` — Zustand toast state
- `src/store/modalStore.ts` — Zustand modal state
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
- `supabase/migration_odoo_sync_v1.sql` — Phase 3 Odoo sync schema (odoo_sync_logs columns, order_lines odoo_line_id/odoo_product_id, partial unique index)
- `supabase/seed.sql` — first admin setup
- `src/lib/odoo.ts` — Odoo XML-RPC client (authenticate, executeKw, 30s timeout)
- `src/app/(protected)/orders/page.tsx` — Orders Pool (client page)
- `src/app/(protected)/orders/[id]/OrderDetailClient.tsx` — order detail (edit, lines, activity)
- `src/components/orders/CreateOrderModal.tsx` — manual order creation form
- `src/app/api/sync/odoo/route.ts` — POST sync trigger (admin only)
- `src/app/api/sync/odoo/logs/route.ts` — GET sync log history (admin only)
- `src/app/(admin)/admin/odoo-sync/page.tsx` — Odoo sync admin page
- `src/components/sync/SyncTrigger.tsx` — sync UI client component
