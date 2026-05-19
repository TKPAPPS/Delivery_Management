import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { logActivity, ACTIONS } from '@/lib/activity';
import { sendNotification } from '@/lib/notifications';
import type { DeliveryCardWithCustomers } from '@/types';

export async function GET(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const includeCustomers = searchParams.get('include_customers') === 'true';
  const isArchived = searchParams.get('archived') === 'true';

  // Use admin client — auth already verified above, bypasses RLS to ensure all cards are visible
  const admin = createSupabaseAdminClient();

  if (!includeCustomers) {
    const { data: cards, error } = await admin
      .from('delivery_cards')
      .select('*')
      .eq('is_archived', isArchived)
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ cards: cards ?? [] });
  }

  // Full query with relations
  const { data: rawCards, error } = await admin
    .from('delivery_cards')
    .select(`
      *,
      driver:drivers(*),
      creator:profiles!delivery_cards_created_by_fkey(id, name, email),
      customers:delivery_customers(
        *,
        sale_orders:customer_sale_orders(*),
        extra_items:extra_delivery_items(*)
      )
    `)
    .eq('is_archived', isArchived)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const cards = (rawCards ?? []) as unknown as DeliveryCardWithCustomers[];

  if (!cards.length) return NextResponse.json({ cards: [] });

  // Enrich with comment + attachment counts (mirrors the SSR board page)
  const cardIds = cards.map((c) => c.id);
  const [{ data: commentRows }, { data: attachmentRows }] = await Promise.all([
    admin.from('comments').select('delivery_card_id').in('delivery_card_id', cardIds),
    admin.from('attachments').select('delivery_card_id').in('delivery_card_id', cardIds),
  ]);

  const commentMap = (commentRows ?? []).reduce<Record<string, number>>((acc, c) => {
    acc[c.delivery_card_id] = (acc[c.delivery_card_id] ?? 0) + 1;
    return acc;
  }, {});
  const attachmentMap = (attachmentRows ?? []).reduce<Record<string, number>>((acc, a) => {
    acc[a.delivery_card_id] = (acc[a.delivery_card_id] ?? 0) + 1;
    return acc;
  }, {});

  const enrichedCards = cards.map((card) => ({
    ...card,
    _count: {
      comments: commentMap[card.id] ?? 0,
      attachments: attachmentMap[card.id] ?? 0,
    },
  }));

  return NextResponse.json({ cards: enrichedCards });
}

export async function POST(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user } = ctx;

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

  await logActivity(card.id, user.id, ACTIONS.CARD_CREATED, { destination, status: card.status });

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
