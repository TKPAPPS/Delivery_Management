import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { parseBody } from '@/lib/parse-body';

export async function GET(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const all = new URL(req.url).searchParams.get('all') === 'true';
  let query = ctx.supabase.from('destinations').select('*').order('name');
  if (!all) query = query.eq('active', true);

  const { data: destinations, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ destinations });
}

export async function POST(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = await parseBody<{ name: string }>(req);
  if ('error' in parsed) return parsed.error;
  const { name } = parsed.data;
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: destination, error } = await admin
    .from('destinations')
    .insert({ name: name.trim() })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ destination }, { status: 201 });
}
