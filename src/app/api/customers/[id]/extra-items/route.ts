import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server';
import { logActivity, ACTIONS } from '@/lib/activity';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('active').eq('id', user.id).single();
  if (!profile?.active) return NextResponse.json({ error: 'Account not active' }, { status: 403 });

  const { item_name, quantity, notes } = await req.json();
  if (!item_name) return NextResponse.json({ error: 'Item name required' }, { status: 400 });

  const admin = createSupabaseAdminClient();

  const { data: customer } = await admin.from('delivery_customers').select('delivery_card_id').eq('id', params.id).single();

  const { data: item, error } = await admin
    .from('extra_delivery_items')
    .insert({ delivery_customer_id: params.id, item_name, quantity: quantity || null, notes: notes || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (customer) {
    await logActivity(customer.delivery_card_id, user.id, ACTIONS.EXTRA_ITEM_ADDED, { item_name });
  }

  return NextResponse.json({ item }, { status: 201 });
}
