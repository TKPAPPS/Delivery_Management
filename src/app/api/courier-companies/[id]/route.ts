import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { parseBody } from '@/lib/parse-body';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['admin', 'logistics'].includes(ctx.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = await parseBody(req);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('courier_companies')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ company: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (ctx.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('courier_companies').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
