import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server';

async function getActiveUser() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('role, active').eq('id', user.id).single();
  if (!profile?.active) return null;
  return { user, profile, supabase };
}

export async function GET(req: NextRequest) {
  const ctx = await getActiveUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const all = new URL(req.url).searchParams.get('all') === 'true';
  let query = ctx.supabase.from('destinations').select('*').order('name');
  if (!all) query = query.eq('active', true);

  const { data: destinations, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ destinations });
}

export async function POST(req: NextRequest) {
  const ctx = await getActiveUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name } = body;
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
