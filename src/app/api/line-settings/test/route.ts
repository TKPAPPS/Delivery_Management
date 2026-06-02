import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase-server';
import { pushLineMessage } from '@/lib/line';

// POST: send a one-off test message to the default LINE target (admin only) to verify the
// connection. Independent of the master switch and per-group routing.
export async function POST() {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (ctx.profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const target = process.env.LINE_DEFAULT_TARGET_ID;
  if (!target) {
    return NextResponse.json({ ok: false, error: 'No default LINE target configured' }, { status: 400 });
  }

  const result = await pushLineMessage(target, [
    { type: 'text', text: '[test] delivery-board LINE connection OK' },
  ]);
  return NextResponse.json(result);
}
