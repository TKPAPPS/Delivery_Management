import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { sendNotification, type NotificationType } from '@/lib/notifications';
import { parseBody } from '@/lib/parse-body';

// GET: recent automatic notification attempts (admin) — observability for LINE/email sends.
export async function GET() {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (ctx.profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('notification_events')
    .select('id, type, status, error, created_at, delivery_card_id')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = await parseBody<{ type: string; deliveryCardId: string | null; payload: Record<string, unknown> }>(req);
  if ('error' in parsed) return parsed.error;
  const { type, deliveryCardId, payload } = parsed.data;

  await sendNotification(type as NotificationType, deliveryCardId, payload);

  return NextResponse.json({ success: true });
}
