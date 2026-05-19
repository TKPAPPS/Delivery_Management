import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { parseBody } from '@/lib/parse-body';

export async function GET() {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await ctx.supabase
    .from('line_groups')
    .select('*')
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ groups: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (ctx.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = await parseBody<{ name: string; line_target_id?: string; auto_triggers?: string[] }>(req);
  if ('error' in parsed) return parsed.error;
  const { name, line_target_id, auto_triggers } = parsed.data;
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('line_groups')
    .insert({
      name: name.trim(),
      line_target_id: line_target_id || null,
      auto_triggers: auto_triggers ?? [],
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ group: data }, { status: 201 });
}
