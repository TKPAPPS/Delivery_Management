import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { parseBody } from '@/lib/parse-body';

export async function GET(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const all = new URL(req.url).searchParams.get('all') === 'true';
  let query = ctx.supabase.from('customer_directory').select('*').order('name');
  if (!all) query = query.eq('active', true);

  const { data: customers, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ customers });
}

export async function POST(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = await parseBody(req);
  if ('error' in parsed) return parsed.error;
  const { name, email, contact_number, full_address, default_delivery_location, notes } = parsed.data as {
    name: string; email?: string; contact_number?: string; full_address?: string;
    default_delivery_location?: string; notes?: string;
  };
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: customer, error } = await admin
    .from('customer_directory')
    .insert({
      name: name.trim(),
      email: email?.trim() || null,
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
