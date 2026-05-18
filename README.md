# Delivery Board

An internal logistics and delivery coordination web application for managing delivery cards, tracking driver assignments, and coordinating shipments across your team.

## What is this app?

Delivery Board is a Kanban-style tool for coordinating deliveries. Each delivery is a "card" that moves through four statuses: **Draft → Driver Needed → Driver Booked → Loaded**. Cards contain customers (with sale order references and extra items), driver assignments, comments, attachments, and a full activity log.

## Tech Stack

- **Framework**: Next.js 14 (App Router) + TypeScript
- **Styling**: Tailwind CSS + lucide-react icons
- **Database**: Supabase Postgres + Row Level Security
- **Storage**: Supabase Storage (for attachments)
- **Auth**: Supabase Auth with Google OAuth
- **Drag-and-drop**: @hello-pangea/dnd
- **UI State**: Zustand (toasts, modals)
- **Deployment**: Vercel (Singapore region)

## Prerequisites

- Node.js 18+
- A Supabase project
- Google OAuth credentials configured in Supabase
- (Optional) LINE Notify token
- (Optional) Resend API key for email notifications

## Local Setup

```bash
# 1. Clone and install
git clone <repo-url>
cd delivery-board
npm install

# 2. Set up environment variables
cp .env.local.example .env.local
# Edit .env.local with your Supabase credentials

# 3. Run the dev server
npm run dev
```

Visit http://localhost:3000

## Supabase Setup

1. **Create a new Supabase project** at https://supabase.com
2. **Run the schema**: In the Supabase SQL Editor, run the contents of `supabase/schema.sql`
3. **Enable Google OAuth**:
   - Go to Authentication → Providers → Google
   - Add your Google OAuth client ID and secret
   - (Get credentials from Google Cloud Console: APIs & Services → Credentials)
4. **Configure redirect URL**: In Supabase Authentication → URL Configuration:
   - Site URL: `http://localhost:3000` (development) or your production URL
   - Redirect URLs: Add `http://localhost:3000/api/auth/callback`
5. **Create storage bucket**:
   - Go to Storage → New bucket
   - Name: `delivery-attachments`
   - Make it public (or configure signed URLs)
6. **Copy your credentials**:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon/public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY`

## First Admin Setup

After your first Google login:

1. You'll be redirected to `/pending` (account not yet active)
2. Go to Supabase SQL Editor and run `supabase/seed.sql` after replacing `YOUR_EMAIL_HERE` with your email
3. Refresh the page or log in again — you'll now have admin access

## LINE Notification Setup (Optional)

1. Go to https://notify-bot.line.me/my/ while logged into LINE
2. Create a new token (choose a group chat or 1-on-1 with LINE Notify)
3. Add the token to `.env.local` as `LINE_NOTIFY_TOKEN`

Notifications are sent for: new cards, urgent cards, and status changes.

## Email Notification Setup (Optional, via Resend)

1. Sign up at https://resend.com
2. Get your API key
3. Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in `.env.local`

## Deployment to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard:
# NEXT_PUBLIC_SUPABASE_URL
# NEXT_PUBLIC_SUPABASE_ANON_KEY
# SUPABASE_SERVICE_ROLE_KEY
# NEXT_PUBLIC_SITE_URL (your Vercel URL)
# LINE_NOTIFY_TOKEN (optional)
# RESEND_API_KEY (optional)
# RESEND_FROM_EMAIL (optional)
```

Add your Vercel URL to Supabase's allowed redirect URLs:
- `https://your-app.vercel.app/api/auth/callback`

The `vercel.json` is configured for the Singapore region (`sin1`).
