import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { parseBody } from '@/lib/parse-body';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx || ctx.profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const parsed = await parseBody(req);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;
  const allowedFields = ['active', 'role', 'name'];
  const updateData: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) updateData[field] = body[field];
  }

  const admin = createSupabaseAdminClient();
  const { data: updated, error } = await admin
    .from('profiles')
    .update(updateData)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ user: updated });
}
