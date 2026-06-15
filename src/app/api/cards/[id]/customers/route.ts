import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { logActivity, ACTIONS } from '@/lib/activity';
import { parseBody } from '@/lib/parse-body';

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

  const parsed = await parseBody(req);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;
  const { customer_name, customer_directory_id, customer_email, receive_auto_emails, delivery_location, notes, sale_orders, loading_priority } = body;

  if (!customer_name) return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });

  if (loading_priority != null &&
      (!Number.isInteger(loading_priority) || (loading_priority as number) < 1 || (loading_priority as number) > 10)) {
    return NextResponse.json({ error: 'Loading priority must be an integer between 1 and 10' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { count } = await admin
    .from('delivery_customers')
    .select('*', { count: 'exact', head: true })
    .eq('delivery_card_id', params.id);

  // Enforce the single-customer lock: once one customer is present, no more may be added.
  const { data: lockCard } = await admin
    .from('delivery_cards')
    .select('single_customer_lock')
    .eq('id', params.id)
    .single();
  if (lockCard?.single_customer_lock && (count ?? 0) >= 1) {
    return NextResponse.json({ error: 'This vehicle is locked to a single customer' }, { status: 409 });
  }

  const { data: customer, error } = await admin
    .from('delivery_customers')
    .insert({
      delivery_card_id: params.id,
      customer_name,
      customer_directory_id: (customer_directory_id as string | null) || null,
      customer_email: (customer_email as string | undefined)?.trim() || null,
      receive_auto_emails: receive_auto_emails !== false,
      delivery_location: delivery_location || null,
      notes: notes || null,
      loading_priority: (loading_priority as number | null) ?? null,
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
