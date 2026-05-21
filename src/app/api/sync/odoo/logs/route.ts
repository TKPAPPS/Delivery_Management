export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';

export async function GET() {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (ctx.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const { data: logs, error } = await admin
    .from('odoo_sync_logs')
    .select(
      'id, started_at, finished_at, status, fetched_count, created_count, updated_count, skipped_count, error_count, error, error_details, triggered_by',
    )
    .order('started_at', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ logs: logs ?? [] });
}
