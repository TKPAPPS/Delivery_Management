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
- **logistics**: can manage cards + drivers (but not users admin panel)

New users are created as `sales` with `active=false`. Admins activate them via `/admin/users`.

## API Route Patterns

All API routes follow this pattern:
```typescript
const supabase = createSupabaseServerClient();  // uses cookies
const { data: { user } } = await supabase.auth.getUser();
if (!user) return 401

const { data: profile } = await supabase.from('profiles').select('role, active').eq('id', user.id).single();
if (!profile?.active) return 403

// For mutations — use admin client to bypass RLS:
const admin = createSupabaseAdminClient();
```

NEVER use `createSupabaseAdminClient()` in client components or files bundled client-side.

## Activity Log

All mutations should call `logActivity()` from `src/lib/activity.ts`:
```typescript
await logActivity(deliveryCardId, userId, ACTIONS.CARD_CREATED, { extra: 'data' });
```

Common action constants are exported from `ACTIONS` in `src/lib/activity.ts`.

## Notifications

`src/lib/notifications.ts` handles LINE Notify and Resend email.
- Always inserts a `notification_events` row first
- Tries LINE Notify if `LINE_NOTIFY_TOKEN` is set
- Falls back to Resend email if `RESEND_API_KEY` is set
- Updates the event with final status ('sent', 'failed', 'skipped')
- Never throws — all errors are caught

## Database Tables

| Table | Purpose |
|-------|---------|
| `profiles` | Extended auth.users with role + active flag |
| `drivers` | Driver roster (name, phone, vehicle, plate) |
| `delivery_cards` | Main delivery records with status, driver ref |
| `delivery_customers` | Customers on each delivery (1:many per card) |
| `customer_sale_orders` | SO numbers per customer |
| `extra_delivery_items` | Non-SO items per customer |
| `attachments` | Files uploaded to Supabase Storage |
| `comments` | Comment threads per card |
| `activity_log` | Immutable audit log per card |
| `notification_events` | Log of all notification attempts |
| `planning_queue` | Holding area for unloaded/deferred customers |

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key (safe for client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — server-only, bypasses RLS |
| `NEXT_PUBLIC_SITE_URL` | App base URL for OAuth redirect |
| `LINE_NOTIFY_TOKEN` | LINE Notify token (optional) |
| `RESEND_API_KEY` | Resend email API key (optional) |
| `RESEND_FROM_EMAIL` | From address for emails (optional) |

## Supabase Storage

Bucket name: `delivery-attachments`
Upload path format: `{card_id}/{timestamp}-{filename}`
The bucket should be public or use signed URLs.

## Deployment

`vercel.json` sets region to `sin1` (Singapore).
Run `vercel --prod` after setting all env vars in Vercel dashboard.
Add the Vercel URL to Supabase Authentication → URL Configuration.

## Key Files

- `src/middleware.ts` — auth guard for all routes
- `src/lib/supabase-server.ts` — server Supabase clients (server-only)
- `src/lib/supabase-browser.ts` — browser Supabase client
- `src/lib/activity.ts` — activity log helper
- `src/lib/notifications.ts` — LINE + email notifications
- `src/app/(protected)/board/BoardClient.tsx` — drag-and-drop Kanban
- `src/app/(protected)/cards/[id]/CardDetailClient.tsx` — card detail page
- `supabase/schema.sql` — full DB migration
- `supabase/seed.sql` — first admin setup
