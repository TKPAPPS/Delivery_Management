import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { parseBody } from '@/lib/parse-body';

export async function GET() {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await ctx.supabase
    .from('courier_companies')
    .select('*')
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ companies: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['admin', 'logistics'].includes(ctx.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = await parseBody<{ name: string }>(req);
  if ('error' in parsed) return parsed.error;
  const { name } = parsed.data;
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('courier_companies')
    .insert({ name: name.trim() })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ company: data }, { status: 201 });
}
