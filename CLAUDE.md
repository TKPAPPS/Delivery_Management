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

## Notifications

`src/lib/notifications.ts` handles LINE Notify and Resend email.
- Always inserts a `notification_events` row first
- Tries LINE Notify (primary) if `LINE_NOTIFY_TOKEN` is set
- Falls back to Resend email if LINE failed/absent AND `RESEND_API_KEY` + `NOTIFICATION_EMAIL` are set
- Logs a `console.warn` if neither channel is configured
- Updates the event with final status ('sent', 'failed', 'skipped')
- Never throws — all errors are caught
- No Resend SDK — uses native `fetch` to `https://api.resend.com/emails`

## Delivery Methods

Cards support four delivery methods (`delivery_method` column, enum `delivery_method_type`):
- **car** — driver from roster or manual entry; fields: `driver_id`, `driver_name_manual`, etc.
- **post** — courier company + tracking number; fields: `courier_name`, `tracking_number`
- **air** — cargo company + air waybills; fields: `cargo_company_name`, `mawb`, `hawb`, `flight_number`, `etd`, `eta`
- **other** — free-form; fields: `other_method_name`, `other_reference`

The card detail page uses `src/components/cards/LogisticsSection.tsx` (replaced the deleted `DriverSection.tsx`).

## Database Tables

| Table | Purpose |
|-------|---------|
| `profiles` | Extended auth.users with role + active flag |
| `drivers` | Driver roster (name, phone, vehicle, plate) |
| `courier_companies` | Courier/post company roster |
| `cargo_companies` | Air cargo company roster |
| `line_groups` | LINE Notify groups with per-group tokens and auto-trigger config |
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

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key (safe for client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — server-only, bypasses RLS |
| `NEXT_PUBLIC_SITE_URL` | App base URL for OAuth redirect |
| `LINE_NOTIFY_TOKEN` | LINE Notify token — system notifications primary channel (optional) |
| `RESEND_API_KEY` | Resend email API key — system notification fallback (optional) |
| `RESEND_FROM_EMAIL` | From address for system notification emails (optional) |
| `NOTIFICATION_EMAIL` | Recipient address for system notification emails (optional) |

## Supabase Storage

Bucket name: `delivery-attachments`
Upload path format: `{card_id}/{timestamp}-{filename}`
The bucket should be public or use signed URLs.

## Deployment

`vercel.json` sets region to `sin1` (Singapore).
Run `vercel --prod` after setting all env vars in Vercel dashboard.
Add the Vercel URL to Supabase Authentication → URL Configuration.

## Key Files

- `src/middleware.ts` — auth guard for all routes; early-returns for `/api/*` routes to prevent redirect swallowing
- `src/lib/supabase-server.ts` — server Supabase clients + `getSessionUser()` (server-only)
- `src/lib/supabase-browser.ts` — browser Supabase client
- `src/lib/activity.ts` — activity log helper
- `src/lib/notifications.ts` — LINE Notify (primary) + Resend email (fallback) for system notifications
- `src/lib/parse-body.ts` — safe JSON body parser; use instead of bare `req.json()`
- `src/app/(protected)/board/BoardClient.tsx` — drag-and-drop Kanban
- `src/app/(protected)/cards/[id]/CardDetailClient.tsx` — card detail page
- `src/components/cards/LogisticsSection.tsx` — delivery method selector + per-method sub-form
- `src/components/cards/CommunicationPanel.tsx` — manual LINE/email sends from card detail
- `supabase/schema.sql` — full DB migration
- `supabase/migration_logistics_v2.sql` — adds delivery method columns, courier/cargo/line_groups/communication_events tables
- `supabase/seed.sql` — first admin setup
