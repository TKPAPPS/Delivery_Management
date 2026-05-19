import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase-server';
import { sendNotification, type NotificationType } from '@/lib/notifications';
import { parseBody } from '@/lib/parse-body';

export async function POST(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = await parseBody<{ type: string; deliveryCardId: string | null; payload: Record<string, unknown> }>(req);
  if ('error' in parsed) return parsed.error;
  const { type, deliveryCardId, payload } = parsed.data;

  await sendNotification(type as NotificationType, deliveryCardId, payload);

  return NextResponse.json({ success: true });
}
