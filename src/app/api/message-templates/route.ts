import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { parseBody } from '@/lib/parse-body';
import type { DeliveryStatus } from '@/types';

const VALID_STATUSES: DeliveryStatus[] = ['draft', 'pending_booking', 'booked', 'in_transit', 'delivered'];

export async function GET() {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: templates, error } = await ctx.supabase
    .from('message_templates')
    .select('*')
    .order('status');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: templates ?? [] });
}

// Upsert a template for a status (one template per status). Admin only.
export async function PUT(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (ctx.profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const parsed = await parseBody<{ status: DeliveryStatus; subject?: string; body?: string; active?: boolean }>(req);
  if ('error' in parsed) return parsed.error;
  const { status, subject, body, active } = parsed.data;

  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: template, error } = await admin
    .from('message_templates')
    .upsert(
      {
        status,
        subject: subject ?? '',
        body: body ?? '',
        active: active ?? false,
        updated_by: ctx.user.id,
      },
      { onConflict: 'status' }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template });
}
