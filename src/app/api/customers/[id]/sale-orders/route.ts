import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { logActivity, ACTIONS } from '@/lib/activity';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user } = ctx;

  const { sale_order_number, notes } = await req.json();
  if (!sale_order_number) return NextResponse.json({ error: 'Sale order number required' }, { status: 400 });

  const admin = createSupabaseAdminClient();

  const { data: customer } = await admin.from('delivery_customers').select('delivery_card_id').eq('id', params.id).single();

  const { data: so, error } = await admin
    .from('customer_sale_orders')
    .insert({ delivery_customer_id: params.id, sale_order_number, notes: notes || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (customer) {
    await logActivity(customer.delivery_card_id, user.id, ACTIONS.SALE_ORDER_ADDED, { sale_order_number });
  }

  return NextResponse.json({ sale_order: so }, { status: 201 });
}
