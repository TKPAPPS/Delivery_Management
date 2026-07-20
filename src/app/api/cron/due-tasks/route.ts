import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { sendTaskNotification } from '@/lib/task-notifications';
import type { Task } from '@/types';

export const dynamic = 'force-dynamic';

// Daily sweep: notify assignees of tasks due today (Bangkok). Runs via Vercel Cron
// (which sends `Authorization: Bearer <CRON_SECRET>`). Deduped by due_notified_at so a
// second run the same day sends nothing.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Today's date in Bangkok as YYYY-MM-DD (due_date is a DATE column).
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

  const admin = createSupabaseAdminClient();
  const { data: tasks, error } = await admin
    .from('tasks')
    .select('*')
    .eq('due_date', today)
    .is('completed_at', null)
    .is('deleted_at', null)
    .is('due_notified_at', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let notified = 0;
  for (const task of (tasks ?? []) as Task[]) {
    await sendTaskNotification(admin, task, 'due');
    await admin.from('tasks').update({ due_notified_at: new Date().toISOString() }).eq('id', task.id);
    notified++;
  }

  return NextResponse.json({ ok: true, date: today, notified });
}
