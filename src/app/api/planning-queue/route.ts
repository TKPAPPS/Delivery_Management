import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { parseBody } from '@/lib/parse-body';

export async function GET() {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: items, error } = await ctx.supabase
    .from('planning_queue')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = await parseBody(req);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;
  if (!body.customer_name) return NextResponse.json({ error: 'Customer name required' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: item, error } = await admin
    .from('planning_queue')
    .insert({ ...body, created_by: ctx.user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item }, { status: 201 });
}
