import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { logActivity, ACTIONS } from '@/lib/activity';
import { parseBody } from '@/lib/parse-body';

/**
 * Order → Delivery bridge.
 *
 * POST /api/deliveries/from-orders  { order_ids: string[] }
 *
 * Creates ONE draft delivery_card from one or more orders. Each order becomes a
 * delivery_customer on the card; its distinct sale_order_numbers become the
 * customer's sale orders, and each order line becomes an extra delivery item.
 * The orders are then marked `assigned` and linked back via orders.delivery_card_id.
 */

interface OrderRow {
  id: string;
  order_ref: string;
  status: string;
  delivery_card_id: string | null;
  customer_id: string | null;
  customer_name_manual: string | null;
  destination_manual: string | null;
  customer: { id: string; name: string; email: string | null } | null;
  destination: { id: string; name: string } | null;
  lines: Array<{
    product_name: string; product_code: string | null;
    sale_order_number: string | null; qty_ordered: number; deleted_at: string | null;
  }> | null;
}

export async function POST(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user } = ctx;

  const parsed = await parseBody<{ order_ids: string[] }>(req);
  if ('error' in parsed) return parsed.error;
  const orderIds = Array.isArray(parsed.data.order_ids) ? parsed.data.order_ids.filter(Boolean) : [];
  if (orderIds.length === 0) {
    return NextResponse.json({ error: 'No orders provided' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { data: rawOrders, error: fetchErr } = await admin
    .from('orders')
    .select(`
      id, order_ref, status, delivery_card_id, customer_id, customer_name_manual, destination_manual,
      customer:customer_directory!orders_customer_id_fkey(id, name, email),
      destination:destinations!orders_destination_id_fkey(id, name),
      lines:order_lines(product_name, product_code, sale_order_number, qty_ordered, deleted_at)
    `)
    .in('id', orderIds)
    .is('deleted_at', null);

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

  const orders = (rawOrders ?? []) as unknown as OrderRow[];
  if (orders.length === 0) {
    return NextResponse.json({ error: 'Orders not found' }, { status: 404 });
  }

  // Refuse if any order is already assigned to a delivery, or is cancelled/completed.
  const alreadyAssigned = orders.filter((o) => o.delivery_card_id);
  if (alreadyAssigned.length > 0) {
    return NextResponse.json(
      { error: `Already assigned to a delivery: ${alreadyAssigned.map((o) => o.order_ref).join(', ')}` },
      { status: 409 },
    );
  }
  const terminal = orders.filter((o) => o.status === 'cancelled' || o.status === 'completed');
  if (terminal.length > 0) {
    return NextResponse.json(
      { error: `Cannot create a delivery from ${terminal[0].status} orders: ${terminal.map((o) => o.order_ref).join(', ')}` },
      { status: 409 },
    );
  }

  const resolveDest = (o: OrderRow) => o.destination?.name ?? o.destination_manual ?? '';
  const resolveCustomer = (o: OrderRow) => o.customer?.name ?? o.customer_name_manual ?? 'Unknown';

  // Card destination: use the first order's destination (orders are usually merged by destination).
  const destination = resolveDest(orders[0]) || 'Unassigned';

  const { data: card, error: cardErr } = await admin
    .from('delivery_cards')
    .insert({ destination, status: 'draft', priority: 'normal', created_by: user.id })
    .select('id, delivery_ref')
    .single();

  if (cardErr || !card) {
    return NextResponse.json({ error: cardErr?.message ?? 'Failed to create delivery card' }, { status: 500 });
  }

  for (let i = 0; i < orders.length; i++) {
    const o = orders[i];
    const liveLines = (o.lines ?? []).filter((l) => !l.deleted_at);

    const { data: cust } = await admin
      .from('delivery_customers')
      .insert({
        delivery_card_id: card.id,
        customer_name: resolveCustomer(o),
        customer_directory_id: o.customer_id ?? null,
        customer_email: o.customer?.email ?? null,
        receive_auto_emails: true,
        notes: `From order ${o.order_ref}`,
        sort_order: i,
      })
      .select('id')
      .single();

    if (cust) {
      const soNumbers = Array.from(
        new Set(liveLines.map((l) => l.sale_order_number?.trim()).filter((s): s is string => !!s)),
      );
      if (soNumbers.length > 0) {
        await admin.from('customer_sale_orders').insert(
          soNumbers.map((so) => ({ delivery_customer_id: cust.id, sale_order_number: so })),
        );
      }
      if (liveLines.length > 0) {
        await admin.from('extra_delivery_items').insert(
          liveLines.map((l) => ({
            delivery_customer_id: cust.id,
            item_name: l.product_code ? `${l.product_code} — ${l.product_name}` : l.product_name,
            quantity: String(l.qty_ordered),
          })),
        );
      }
    }

    await admin.from('orders').update({ status: 'assigned', delivery_card_id: card.id }).eq('id', o.id);
    await logActivity(null, user.id, ACTIONS.ORDER_ASSIGNED, { order_ref: o.order_ref, delivery_card_id: card.id }, { entity_type: 'order', entity_id: o.id });
  }

  await logActivity(card.id, user.id, ACTIONS.DELIVERY_CREATED_FROM_ORDERS, {
    order_refs: orders.map((o) => o.order_ref),
  });

  return NextResponse.json({ card_id: card.id, delivery_ref: card.delivery_ref }, { status: 201 });
}
