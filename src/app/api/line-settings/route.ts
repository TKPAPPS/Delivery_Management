import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { parseBody } from '@/lib/parse-body';
import { getLineMasterEnabled, setLineMasterEnabled } from '@/lib/settings';

// GET: read the LINE master switch (any authed user). PUT: update it (admin only).

export async function GET() {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const master_enabled = await getLineMasterEnabled(admin);
  const line_configured = !!(
    (process.env.LINE_CHANNEL_ID && process.env.LINE_CHANNEL_SECRET) ||
    process.env.LINE_CHANNEL_ACCESS_TOKEN
  );
  const email_configured = !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
  const default_target_set = !!process.env.LINE_DEFAULT_TARGET_ID;
  return NextResponse.json({ master_enabled, line_configured, email_configured, default_target_set });
}

export async function PUT(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (ctx.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = await parseBody<{ master_enabled: boolean }>(req);
  if ('error' in parsed) return parsed.error;
  if (typeof parsed.data.master_enabled !== 'boolean') {
    return NextResponse.json({ error: 'master_enabled must be a boolean' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  await setLineMasterEnabled(admin, parsed.data.master_enabled, ctx.user.id);
  return NextResponse.json({ master_enabled: parsed.data.master_enabled });
}
