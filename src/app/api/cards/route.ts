import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server';
import { logActivity, ACTIONS } from '@/lib/activity';
import { sendNotification } from '@/lib/notifications';

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role, active').eq('id', user.id).single();
  if (!profile?.active) return NextResponse.json({ error: 'Account not active' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const includeCustomers = searchParams.get('include_customers') === 'true';
  const isArchived = searchParams.get('archived') === 'true';

  const query = supabase
    .from('delivery_cards')
    .select(includeCustomers ? `
      *,
      driver:drivers(*),
      creator:profiles!delivery_cards_created_by_fkey(id, name, email),
      customers:delivery_customers(
        *,
        sale_orders:customer_sale_orders(*),
        extra_items:extra_delivery_items(*)
      )
    ` : '*')
    .eq('is_archived', isArchived)
    .order('created_at', { ascending: false });

  const { data: cards, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ cards });
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role, active').eq('id', user.id).single();
  if (!profile?.active) return NextResponse.json({ error: 'Account not active' }, { status: 403 });

  const body = await req.json();
  const { destination, status, planned_date, priority, internal_notes, customers } = body;

  if (!destination) return NextResponse.json({ error: 'Destination is required' }, { status: 400 });

  const admin = createSupabaseAdminClient();

  const { data: card, error } = await admin
    .from('delivery_cards')
    .insert({
      destination,
      status: status ?? 'draft',
      planned_date: planned_date || null,
      priority: priority ?? 'normal',
      internal_notes: internal_notes || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error || !card) return NextResponse.json({ error: error?.message ?? 'Failed to create card' }, { status: 500 });

  // Add inline customers
  if (Array.isArray(customers) && customers.length > 0) {
    for (let i = 0; i < customers.length; i++) {
      const c = customers[i];
      if (!c.customer_name?.trim()) continue;
      const { data: cust } = await admin
        .from('delivery_customers')
        .insert({
          delivery_card_id: card.id,
          customer_name: c.customer_name,
          delivery_location: c.delivery_location || null,
          notes: c.notes || null,
          sort_order: i,
        })
        .select()
        .single();

      if (cust && Array.isArray(c.sale_orders)) {
        const sos = c.sale_orders.filter((so: string) => so?.trim());
        if (sos.length > 0) {
          await admin.from('customer_sale_orders').insert(
            sos.map((so: string) => ({ delivery_customer_id: cust.id, sale_order_number: so }))
          );
        }
      }

      if (cust && Array.isArray(c.extra_items)) {
        const items = c.extra_items.filter((ei: { item_name: string }) => ei.item_name?.trim());
        if (items.length > 0) {
          await admin.from('extra_delivery_items').insert(
            items.map((ei: { item_name: string; quantity?: string }) => ({
              delivery_customer_id: cust.id,
              item_name: ei.item_name,
              quantity: ei.quantity || null,
            }))
          );
        }
      }
    }
  }

  await logActivity(card.id, user.id, ACTIONS.CARD_CREATED, {
    destination,
    status: card.status,
  });

  // Send notifications
  try {
    const notifType = priority === 'urgent' ? 'urgent_card_created' : 'card_created';
    void sendNotification(notifType, card.id, {
      deliveryRef: card.delivery_ref,
      destination: card.destination,
      plannedDate: card.planned_date ?? undefined,
    });
  } catch { /* non-critical */ }

  return NextResponse.json({ card }, { status: 201 });
}
