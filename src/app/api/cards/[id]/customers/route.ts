import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { logActivity, ACTIONS } from '@/lib/activity';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: customers, error } = await ctx.supabase
    .from('delivery_customers')
    .select('*, sale_orders:customer_sale_orders(*), extra_items:extra_delivery_items(*)')
    .eq('delivery_card_id', params.id)
    .order('sort_order');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ customers });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user } = ctx;

  const body = await req.json();
  const { customer_name, delivery_location, notes, sale_orders } = body;

  if (!customer_name) return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });

  const admin = createSupabaseAdminClient();

  const { count } = await admin
    .from('delivery_customers')
    .select('*', { count: 'exact', head: true })
    .eq('delivery_card_id', params.id);

  const { data: customer, error } = await admin
    .from('delivery_customers')
    .insert({
      delivery_card_id: params.id,
      customer_name,
      delivery_location: delivery_location || null,
      notes: notes || null,
      sort_order: count ?? 0,
    })
    .select()
    .single();

  if (error || !customer) return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 500 });

  if (Array.isArray(sale_orders) && sale_orders.length > 0) {
    const sos = sale_orders.filter((so: string) => so?.trim());
    if (sos.length > 0) {
      await admin.from('customer_sale_orders').insert(
        sos.map((so: string) => ({ delivery_customer_id: customer.id, sale_order_number: so }))
      );
    }
  }

  await logActivity(params.id, user.id, ACTIONS.CUSTOMER_ADDED, { customer_name });

  return NextResponse.json({ customer }, { status: 201 });
}
