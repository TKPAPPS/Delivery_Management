import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { logActivity, ACTIONS } from '@/lib/activity';

// Shared helpers for moving/unloading delivery customers between cards. Used by the
// single-customer route (PATCH /api/customers/[id]) and the bulk-move route.

type Admin = ReturnType<typeof createSupabaseAdminClient>;

// A delivery_customer can represent several orders (same-customer orders are combined), so
// move/release operate on the whole set via orders.delivery_customer_id. Legacy rows whose
// orders were never linked fall back to the single order_id. No-op for hand-added customers.
export type CustomerRef = { id: string; order_id: string | null };

/**
 * Soft-delete a card once its last customer has left (consolidation). Recoverable from
 * History -> Deleted. Only active-pipeline cards are discarded; delivered/archived/already-deleted
 * are left alone. Returns true if it discarded the card.
 */
export async function discardCardIfEmpty(admin: Admin, cardId: string | null, userId: string): Promise<boolean> {
  if (!cardId) return false;
  const { count } = await admin
    .from('delivery_customers')
    .select('id', { count: 'exact', head: true })
    .eq('delivery_card_id', cardId);
  if ((count ?? 0) > 0) return false;

  const { data: card } = await admin
    .from('delivery_cards')
    .select('status, is_archived, deleted_at')
    .eq('id', cardId)
    .single();
  if (!card || card.deleted_at || card.is_archived || card.status === 'delivered') return false;

  const { error } = await admin
    .from('delivery_cards')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', cardId);
  if (error) return false;

  // Any orders still pointing at this card go back to the pool (normally none: each customer's
  // order already followed/released as it left, but this covers stragglers).
  await admin
    .from('orders')
    .update({ delivery_card_id: null, status: 'pending' })
    .eq('delivery_card_id', cardId)
    .not('status', 'in', '("completed","cancelled")');

  await logActivity(cardId, userId, ACTIONS.CARD_DELETED, { reason: 'auto_discarded_empty' });
  return true;
}

/** All of this customer's orders follow it to a new card (they stay assigned). */
export async function followOrderToCard(admin: Admin, customer: CustomerRef, cardId: string): Promise<void> {
  const { data } = await admin
    .from('orders')
    .update({ delivery_card_id: cardId })
    .eq('delivery_customer_id', customer.id)
    .select('id');
  if ((!data || data.length === 0) && customer.order_id) {
    await admin.from('orders').update({ delivery_card_id: cardId }).eq('id', customer.order_id);
  }
}

/** Release this customer's orders back to the Orders Pool (unassigned) so they can be dispatched again. */
export async function releaseOrderToPool(admin: Admin, customer: CustomerRef): Promise<void> {
  const { data } = await admin
    .from('orders')
    .update({ delivery_card_id: null, status: 'pending' })
    .eq('delivery_customer_id', customer.id)
    .not('status', 'in', '("completed","cancelled")')
    .select('id');
  if ((!data || data.length === 0) && customer.order_id) {
    await admin
      .from('orders')
      .update({ delivery_card_id: null, status: 'pending' })
      .eq('id', customer.order_id)
      .not('status', 'in', '("completed","cancelled")');
  }
}

/**
 * Resolve the destination card for an unload/move action. Shared by the whole-customer
 * unload route and the single-SO move, so both behave identically:
 *  - `move`        -> an existing card (targetCardId)
 *  - `create_card` -> a new draft card (newDestination)
 *  - anything else -> a new draft card in the Planning Queue (fallbackDestination),
 *                     optionally stamped with a delayed `reason`.
 * Returns `{ error }` for a bad request (caller maps to a 400).
 */
export async function resolveDestinationCard(
  admin: Admin,
  opts: {
    action?: string;
    targetCardId?: string | null;
    newDestination?: string | null;
    reason?: string | null;
    fallbackDestination?: string | null;
  },
  userId: string,
): Promise<{ cardId: string; createdNew: boolean } | { error: string }> {
  const { action, targetCardId, newDestination, reason, fallbackDestination } = opts;

  if (action === 'move') {
    if (!targetCardId) return { error: 'Please select a target card' };
    return { cardId: targetCardId, createdNew: false };
  }

  if (action === 'create_card') {
    if (!newDestination) return { error: 'Please enter a destination' };
    const { data, error } = await admin
      .from('delivery_cards')
      .insert({ destination: newDestination, status: 'draft', priority: 'normal', created_by: userId })
      .select('id')
      .single();
    if (error || !data) return { error: 'Failed to create card' };
    return { cardId: data.id, createdNew: true };
  }

  // Planning queue / delayed: spin off a fresh draft card.
  const { data, error } = await admin
    .from('delivery_cards')
    .insert({
      destination: fallbackDestination || 'Unassigned',
      status: 'draft',
      priority: 'normal',
      internal_notes: reason ? `Unloaded: ${reason}` : null,
      created_by: userId,
    })
    .select('id')
    .single();
  if (error || !data) return { error: 'Failed to unload' };
  return { cardId: data.id, createdNew: true };
}

export type MoveSaleOrderResult =
  | { ok: true; split: boolean; newCardId?: string; targetCardId?: string; source_card_discarded?: boolean }
  | { ok: false; status: number; error: string };

/**
 * Move a single sale order (one SO chip) off a shared delivery customer to another card.
 *
 * A delivery_customer can carry several combined orders (SO chips). This peels ONE off:
 * it repoints the SO chip, its order row, and its extra items to a (new or existing)
 * customer on the destination card, leaving the rest of the source customer intact.
 *
 * If the source customer has only this one SO, it degrades to a normal whole-customer move
 * (reassign the row, follow its orders, discard the source card if it empties).
 *
 * Item attribution: extra_delivery_items carry no order link, so the moved order's items are
 * matched back from its order_lines by (item_name, quantity), one-per-line — this correctly
 * splits duplicate rows (e.g. two "Delivery Service (1)") by consuming one per line.
 */
export async function moveSaleOrder(
  admin: Admin,
  opts: {
    saleOrderChipId: string;
    action?: string;
    targetCardId?: string | null;
    newDestination?: string | null;
    reason?: string | null;
    notes?: string | null;
    userId: string;
  },
): Promise<MoveSaleOrderResult> {
  const { saleOrderChipId, action, targetCardId, newDestination, reason, notes, userId } = opts;

  // 1. Load the SO chip.
  const { data: chip } = await admin
    .from('customer_sale_orders')
    .select('id, delivery_customer_id, sale_order_number')
    .eq('id', saleOrderChipId)
    .single();
  if (!chip) return { ok: false, status: 404, error: 'Sale order not found' };
  const soNum = (chip.sale_order_number ?? '').trim();

  // 2. Load the source customer (+ its SO chips, to count).
  const { data: srcCust } = await admin
    .from('delivery_customers')
    .select('*, sale_orders:customer_sale_orders(id)')
    .eq('id', chip.delivery_customer_id)
    .single();
  if (!srcCust) return { ok: false, status: 404, error: 'Customer not found' };

  const srcCardId = srcCust.delivery_card_id as string | null;
  const chipCount = (srcCust.sale_orders as Array<{ id: string }> | null)?.length ?? 0;

  // 3. Only one SO on this customer -> this is really a whole-customer move.
  if (chipCount <= 1) {
    const dest = await resolveDestinationCard(
      admin,
      { action, targetCardId, newDestination, reason, fallbackDestination: srcCust.delivery_location },
      userId,
    );
    if ('error' in dest) return { ok: false, status: 400, error: dest.error };
    if (dest.cardId === srcCardId) return { ok: false, status: 400, error: 'Already on this card' };

    await admin
      .from('delivery_customers')
      .update({ delivery_card_id: dest.cardId, notes: notes || srcCust.notes })
      .eq('id', srcCust.id);

    const isMove = action === 'move' || action === 'create_card';
    await logActivity(srcCardId, userId, isMove ? ACTIONS.CUSTOMER_MOVED : ACTIONS.CUSTOMER_UNLOADED, {
      customer_name: srcCust.customer_name,
      to_card_id: dest.cardId,
      ...(reason ? { reason } : {}),
    });

    await followOrderToCard(admin, { id: srcCust.id, order_id: srcCust.order_id }, dest.cardId);
    const discarded = await discardCardIfEmpty(admin, srcCardId, userId);
    return {
      ok: true,
      split: false,
      newCardId: dest.createdNew ? dest.cardId : undefined,
      targetCardId: action === 'move' ? dest.cardId : undefined,
      source_card_discarded: discarded,
    };
  }

  // 4. Split one SO off the customer.
  // a. Resolve the underlying order (by value; may be null for a hand-added chip).
  const { data: orderRows } = await admin
    .from('orders')
    .select('id, amount_total, order_ref')
    .eq('delivery_customer_id', srcCust.id)
    .eq('odoo_order_ref', soNum)
    .is('deleted_at', null)
    .limit(1);
  const movedOrder = orderRows?.[0] ?? null;

  // b. Destination card.
  const dest = await resolveDestinationCard(
    admin,
    { action, targetCardId, newDestination, reason, fallbackDestination: srcCust.delivery_location },
    userId,
  );
  if ('error' in dest) return { ok: false, status: 400, error: dest.error };
  if (dest.cardId === srcCardId) return { ok: false, status: 400, error: 'Already on this card' };

  // c. Find-or-create the matching customer on the destination card.
  type DestCust = { id: string; order_value: number | null };
  let destCust: DestCust | null = null;
  if (srcCust.customer_directory_id) {
    const { data } = await admin
      .from('delivery_customers')
      .select('id, order_value')
      .eq('delivery_card_id', dest.cardId)
      .eq('customer_directory_id', srcCust.customer_directory_id)
      .limit(1);
    destCust = data?.[0] ?? null;
  }
  if (!destCust) {
    const { data } = await admin
      .from('delivery_customers')
      .select('id, order_value, customer_name')
      .eq('delivery_card_id', dest.cardId);
    const want = (srcCust.customer_name ?? '').trim().toLowerCase();
    const found = (data ?? []).find((c) => (c.customer_name ?? '').trim().toLowerCase() === want);
    destCust = found ? { id: found.id, order_value: found.order_value } : null;
  }
  if (!destCust) {
    const { data, error } = await admin
      .from('delivery_customers')
      .insert({
        delivery_card_id: dest.cardId,
        customer_name: srcCust.customer_name,
        customer_directory_id: srcCust.customer_directory_id,
        customer_email: srcCust.customer_email,
        receive_auto_emails: srcCust.receive_auto_emails,
        delivery_location: srcCust.delivery_location,
        order_value: 0,
        order_id: movedOrder?.id ?? null,
        notes: `From order ${soNum}`,
      })
      .select('id, order_value')
      .single();
    if (error || !data) return { ok: false, status: 500, error: 'Failed to create destination customer' };
    destCust = data;
  }

  // d. Move the SO chip (dedupe if the destination already has this SO number).
  const { data: dupChip } = await admin
    .from('customer_sale_orders')
    .select('id')
    .eq('delivery_customer_id', destCust.id)
    .eq('sale_order_number', soNum)
    .limit(1);
  if (dupChip && dupChip.length > 0) {
    await admin.from('customer_sale_orders').delete().eq('id', chip.id);
  } else {
    await admin.from('customer_sale_orders').update({ delivery_customer_id: destCust.id }).eq('id', chip.id);
  }

  // e. Move the moved order's extra items (match one-per-line by name + quantity).
  if (movedOrder) {
    const { data: lines } = await admin
      .from('order_lines')
      .select('product_code, product_name, qty_ordered')
      .eq('order_id', movedOrder.id)
      .is('deleted_at', null);
    const { data: srcItems } = await admin
      .from('extra_delivery_items')
      .select('id, item_name, quantity')
      .eq('delivery_customer_id', srcCust.id);
    const claimed = new Set<string>();
    const toMove: string[] = [];
    for (const line of lines ?? []) {
      const name = line.product_code ? `${line.product_code} - ${line.product_name}` : line.product_name;
      const qty = String(line.qty_ordered);
      const match = (srcItems ?? []).find(
        (it) => !claimed.has(it.id) && it.item_name === name && (it.quantity ?? '') === qty,
      );
      if (match) {
        claimed.add(match.id);
        toMove.push(match.id);
      }
    }
    if (toMove.length > 0) {
      await admin.from('extra_delivery_items').update({ delivery_customer_id: destCust.id }).in('id', toMove);
    }
  }

  // f. Repoint the order to the destination card + customer (stays assigned).
  if (movedOrder) {
    await admin
      .from('orders')
      .update({ delivery_customer_id: destCust.id, delivery_card_id: dest.cardId })
      .eq('id', movedOrder.id);
  }

  // g. Recompute per-customer order_value (drives Cost Split).
  const movedValue = movedOrder?.amount_total ?? 0;
  if (srcCust.order_value != null) {
    await admin
      .from('delivery_customers')
      .update({ order_value: Math.max(0, Number(srcCust.order_value) - movedValue) })
      .eq('id', srcCust.id);
  }
  if (movedValue !== 0) {
    await admin
      .from('delivery_customers')
      .update({ order_value: Number(destCust.order_value ?? 0) + movedValue })
      .eq('id', destCust.id);
  }

  // h. Fix the legacy single-order pointer on the source if it pointed at the moved order.
  if (movedOrder && srcCust.order_id === movedOrder.id) {
    const { data: remain } = await admin
      .from('orders')
      .select('id')
      .eq('delivery_customer_id', srcCust.id)
      .is('deleted_at', null)
      .neq('id', movedOrder.id)
      .limit(1);
    await admin.from('delivery_customers').update({ order_id: remain?.[0]?.id ?? null }).eq('id', srcCust.id);
  }

  // i. Log on the source card.
  await logActivity(srcCardId, userId, ACTIONS.SALE_ORDER_MOVED, {
    sale_order_number: soNum,
    customer_name: srcCust.customer_name,
    to_card_id: dest.cardId,
    ...(movedOrder ? { order_ref: movedOrder.order_ref } : {}),
  });

  // j. Source card keeps its other SOs -> never discarded here.
  return {
    ok: true,
    split: true,
    newCardId: dest.createdNew ? dest.cardId : undefined,
    targetCardId: action === 'move' ? dest.cardId : undefined,
  };
}
