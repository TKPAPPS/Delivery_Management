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
  customer_email: string | null;
  customer_address: string | null;
  customer_phone: string | null;
  destination_manual: string | null;
  amount_total: number | null;
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
  if (!['admin', 'sales', 'logistics'].includes(ctx.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
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
      id, order_ref, status, delivery_card_id, customer_id, customer_name_manual, customer_email, customer_address, customer_phone, destination_manual, amount_total,
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

  const resolveDest = (o: OrderRow) => o.destination?.name ?? o.destination_manual ?? '';
  const resolveCustomer = (o: OrderRow) => o.customer?.name ?? o.customer_name_manual ?? 'Unknown';

  // Skip (don't reject the whole batch) orders that are already assigned or closed.
  const skipped: string[] = orders
    .filter((o) => o.delivery_card_id || o.status === 'completed' || o.status === 'cancelled')
    .map((o) => o.order_ref);
  const candidates = orders.filter((o) => !o.delivery_card_id && o.status !== 'completed' && o.status !== 'cancelled');

  if (candidates.length === 0) {
    return NextResponse.json(
      { error: `No eligible orders (already assigned or closed): ${skipped.join(', ')}` },
      { status: 409 },
    );
  }

  // Card destination: first candidate's destination (orders are usually merged by destination).
  const destination = resolveDest(candidates[0]) || 'Unassigned';

  const { data: card, error: cardErr } = await admin
    .from('delivery_cards')
    .insert({ destination, status: 'draft', priority: 'normal', created_by: user.id })
    .select('id, delivery_ref')
    .single();

  if (cardErr || !card) {
    return NextResponse.json({ error: cardErr?.message ?? 'Failed to create delivery card' }, { status: 500 });
  }

  const assigned: string[] = [];

  // Phase 1: atomically claim each order and resolve its Directory company, then group the
  // claimed orders by customer name so several orders for the same customer become ONE customer.
  type LiveLine = NonNullable<OrderRow['lines']>[number];
  interface ClaimedOrder {
    o: OrderRow;
    directoryId: string | null;
    companyEmail: string | null;
    companyLocation: string | null;
    liveLines: LiveLine[];
  }
  const groups = new Map<string, ClaimedOrder[]>();

  for (const o of candidates) {
    // Atomically claim the order: only succeeds if it's still unassigned. This closes
    // the read-then-write race (two requests can't both claim the same order).
    const { data: claimed } = await admin
      .from('orders')
      .update({ status: 'assigned', delivery_card_id: card.id })
      .eq('id', o.id)
      .is('delivery_card_id', null)
      .select('id')
      .maybeSingle();

    if (!claimed) { skipped.push(o.order_ref); continue; }

    // Resolve the Directory company. Manual orders already have customer_id; Odoo orders carry
    // only a name (+ snapshotted email/address): match the company by name, creating it if new
    // and seeding email/address only when empty (never overwriting a team-edited value).
    let directoryId: string | null = o.customer_id ?? null;
    let companyEmail: string | null = o.customer?.email ?? null;
    // Delivery location for this customer: prefer the company's saved default, else the order's
    // (Odoo) shipping destination.
    let companyLocation: string | null = o.destination_manual ?? null;
    const companyName = (o.customer?.name ?? o.customer_name_manual ?? '').trim();
    if (!directoryId && companyName) {
      // Escape ILIKE wildcards so a name containing % or _ can't match the wrong company,
      // then confirm an exact case-insensitive name match in JS (ILIKE could still over-match).
      const escaped = companyName.replace(/[%_\\]/g, '\\$&');
      const { data: matches } = await admin
        .from('customer_directory')
        .select('id, name, email, full_address, contact_number, default_delivery_location')
        .ilike('name', escaped)
        .eq('active', true);
      const match = (matches ?? []).find(
        (m) => (m.name ?? '').trim().toLowerCase() === companyName.toLowerCase(),
      ) ?? null;
      if (match) {
        directoryId = match.id;
        companyEmail = match.email ?? null;
        if (match.default_delivery_location) companyLocation = match.default_delivery_location;
        // Seed any empty company fields from the order snapshots (never overwrite team-edited values).
        const patch: Record<string, unknown> = {};
        if (!match.email && o.customer_email) { patch.email = o.customer_email; companyEmail = o.customer_email; }
        if (!match.full_address && o.customer_address) patch.full_address = o.customer_address;
        if (!match.contact_number && o.customer_phone) patch.contact_number = o.customer_phone;
        if (!match.default_delivery_location && o.destination_manual) { patch.default_delivery_location = o.destination_manual; companyLocation = o.destination_manual; }
        if (Object.keys(patch).length > 0) await admin.from('customer_directory').update(patch).eq('id', match.id);
      } else {
        const { data: created } = await admin
          .from('customer_directory')
          .insert({
            name: companyName,
            email: o.customer_email ?? null,
            full_address: o.customer_address ?? null,
            contact_number: o.customer_phone ?? null,
            default_delivery_location: o.destination_manual ?? null,
          })
          .select('id, email, default_delivery_location')
          .single();
        if (created) { directoryId = created.id; companyEmail = created.email ?? null; companyLocation = created.default_delivery_location ?? companyLocation; }
      }
      if (directoryId) await admin.from('orders').update({ customer_id: directoryId }).eq('id', o.id);
    }

    const liveLines = (o.lines ?? []).filter((l) => !l.deleted_at);
    const key = resolveCustomer(o).trim().toLowerCase();
    const entry: ClaimedOrder = { o, directoryId, companyEmail, companyLocation, liveLines };
    const bucket = groups.get(key);
    if (bucket) bucket.push(entry); else groups.set(key, [entry]);
    assigned.push(o.order_ref);
  }

  // Phase 2: one delivery_customer per customer group. Order values are summed, and the group's
  // sale orders / line items are combined onto the single customer row.
  let sortIdx = 0;
  for (const members of Array.from(groups.values())) {
    const first = members[0];
    const amounts = members.map((m) => m.o.amount_total).filter((v): v is number => typeof v === 'number');
    const orderValue = amounts.length ? amounts.reduce((a, b) => a + b, 0) : null;
    const refs = members.map((m) => m.o.order_ref);

    const { data: cust, error: custErr } = await admin
      .from('delivery_customers')
      .insert({
        delivery_card_id: card.id,
        order_id: first.o.id,
        customer_name: resolveCustomer(first.o),
        customer_directory_id: first.directoryId,
        customer_email: first.companyEmail,
        delivery_location: first.companyLocation,
        receive_auto_emails: true,
        notes: refs.length > 1 ? `From orders ${refs.join(', ')}` : `From order ${refs[0]}`,
        sort_order: sortIdx,
        order_value: orderValue,
      })
      .select('id')
      .single();

    // If building the customer failed, release every claimed order in the group so none is
    // silently marked assigned with nothing on the card.
    if (custErr || !cust) {
      for (const m of members) {
        await admin.from('orders').update({ status: m.o.status, delivery_card_id: null }).eq('id', m.o.id);
        const idx = assigned.indexOf(m.o.order_ref);
        if (idx >= 0) assigned.splice(idx, 1);
        skipped.push(m.o.order_ref);
      }
      continue;
    }
    sortIdx++;

    // Link every order of this customer to the delivery_customer (used by unload/release).
    await admin.from('orders').update({ delivery_customer_id: cust.id }).in('id', members.map((m) => m.o.id));

    const soNumbers = Array.from(new Set(
      members.flatMap((m: ClaimedOrder) => m.liveLines.map((l: LiveLine) => l.sale_order_number?.trim())).filter((s): s is string => !!s),
    ));
    if (soNumbers.length > 0) {
      await admin.from('customer_sale_orders').insert(
        soNumbers.map((so) => ({ delivery_customer_id: cust.id, sale_order_number: so })),
      );
    }
    const items = members.flatMap((m: ClaimedOrder) => m.liveLines.map((l: LiveLine) => ({
      delivery_customer_id: cust.id,
      item_name: l.product_code ? `${l.product_code} - ${l.product_name}` : l.product_name,
      quantity: String(l.qty_ordered),
    })));
    if (items.length > 0) await admin.from('extra_delivery_items').insert(items);

    for (const m of members) {
      await logActivity(null, user.id, ACTIONS.ORDER_ASSIGNED, { order_ref: m.o.order_ref, delivery_card_id: card.id }, { entity_type: 'order', entity_id: m.o.id });
    }
  }

  // Every candidate lost its claim (raced) or failed — clean up the empty card.
  if (assigned.length === 0) {
    await admin.from('delivery_cards').delete().eq('id', card.id);
    return NextResponse.json(
      { error: `Could not assign any orders (already taken): ${skipped.join(', ')}` },
      { status: 409 },
    );
  }

  await logActivity(card.id, user.id, ACTIONS.DELIVERY_CREATED_FROM_ORDERS, { order_refs: assigned });

  return NextResponse.json({ card_id: card.id, delivery_ref: card.delivery_ref, assigned, skipped }, { status: 201 });
}
