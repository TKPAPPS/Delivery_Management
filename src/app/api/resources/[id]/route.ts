import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { parseBody } from '@/lib/parse-body';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = await parseBody(req);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  // Whitelist editable fields.
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === 'string') update.name = body.name.trim();
  if (typeof body.url === 'string') update.url = body.url.trim();
  if ('description' in body) update.description = typeof body.description === 'string' ? body.description.trim() || null : null;
  if (typeof body.category === 'string') update.category = body.category.trim() || 'Other';
  if (typeof body.sort_order === 'number') update.sort_order = body.sort_order;

  const admin = createSupabaseAdminClient();
  const { data: resource, error } = await admin
    .from('resources')
    .update(update)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ resource });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('resources').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
