import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server';

async function getActiveUser(req?: NextRequest) {
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
  let query = ctx.supabase.from('customer_directory').select('*').order('name');
  if (!all) query = query.eq('active', true);

  const { data: customers, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ customers });
}

export async function POST(req: NextRequest) {
  const ctx = await getActiveUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, contact_number, full_address, default_delivery_location, notes } = body;
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: customer, error } = await admin
    .from('customer_directory')
    .insert({
      name: name.trim(),
      contact_number: contact_number || null,
      full_address: full_address || null,
      default_delivery_location: default_delivery_location || null,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ customer }, { status: 201 });
}
