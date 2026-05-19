import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase-server';
import { sendNotification, type NotificationType } from '@/lib/notifications';

export async function POST(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { type, deliveryCardId, payload } = await req.json();

  await sendNotification(type as NotificationType, deliveryCardId, payload);

  return NextResponse.json({ success: true });
}
