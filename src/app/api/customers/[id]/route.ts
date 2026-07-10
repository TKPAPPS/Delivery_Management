import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { logActivity, ACTIONS } from '@/lib/activity';
import { parseBody } from '@/lib/parse-body';

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Soft-delete a card once its last customer has left (consolidation). Recoverable from
 * History → Deleted. Only active-pipeline cards are discarded; delivered/archived/already-deleted
 * are left alone. Returns true if it discarded the card.
 */
async function discardCardIfEmpty(admin: Admin, cardId: string | null, userId: string): Promise<boolean> {
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

  // Any orders still pointing at this card go back to the pool (normally none — each customer's
  // order already followed/released as it left — but this covers stragglers).
  await admin
    .from('orders')
    .update({ delivery_card_id: null, status: 'pending' })
    .eq('delivery_card_id', cardId)
    .not('status', 'in', '("completed","cancelled")');

  await logActivity(cardId, userId, ACTIONS.CARD_DELETED, { reason: 'auto_discarded_empty' });
  return true;
}

// A delivery_customer can represent several orders (same-customer orders are combined), so
// unload/release operate on the whole set via orders.delivery_customer_id. Legacy rows whose
// orders were never linked fall back to the single order_id. No-op for hand-added customers.
type CustomerRef = { id: string; order_id: string | null };

/** All of this customer's orders follow it to a new card (they stay assigned). */
async function followOrderToCard(admin: Admin, customer: CustomerRef, cardId: string): Promise<void> {
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
async function releaseOrderToPool(admin: Admin, customer: CustomerRef): Promise<void> {
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

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user } = ctx;

  const parsed = await parseBody(req);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;
  const admin = createSupabaseAdminClient();

  const { data: customer } = await admin
    .from('delivery_customers')
    .select('*, sale_orders:customer_sale_orders(*), extra_items:extra_delivery_items(*)')
    .eq('id', params.id)
    .single();

  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

  if (body.unload) {
    const { action, target_card_id, new_destination, notes, reason } = body;

    if (action === 'move' && target_card_id) {
      const { error } = await admin
        .from('delivery_customers')
        .update({ delivery_card_id: target_card_id, notes: notes || customer.notes })
        .eq('id', params.id);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      await logActivity(customer.delivery_card_id, user.id, ACTIONS.CUSTOMER_MOVED, {
        customer_name: customer.customer_name,
        target_card_id,
      });

      await followOrderToCard(admin, customer, target_card_id as string);
      const discarded = await discardCardIfEmpty(admin, customer.delivery_card_id, user.id);
      return NextResponse.json({ success: true, source_card_discarded: discarded });
    }

    if (action === 'create_card' && new_destination) {
      const { data: newCard, error: cardError } = await admin
        .from('delivery_cards')
        .insert({ destination: new_destination, status: 'draft', priority: 'normal', created_by: user.id })
        .select()
        .single();

      if (cardError || !newCard) return NextResponse.json({ error: 'Failed to create card' }, { status: 500 });

      await admin.from('delivery_customers').update({ delivery_card_id: newCard.id }).eq('id', params.id);

      await logActivity(customer.delivery_card_id, user.id, ACTIONS.CUSTOMER_MOVED, {
        customer_name: customer.customer_name,
        new_card_id: newCard.id,
      });

      await followOrderToCard(admin, customer, newCard.id);
      const discarded = await discardCardIfEmpty(admin, customer.delivery_card_id, user.id);
      return NextResponse.json({ success: true, newCardId: newCard.id, source_card_discarded: discarded });
    }

    // Planning Queue is unified with draft cards: unloading a customer now spins off
    // a fresh DRAFT card and moves the customer (and its sale orders / extra items,
    // which follow via FK) onto it. The draft card shows up in Planning Queue + Dashboard Draft.
    const { data: queueCard, error: queueErr } = await admin
      .from('delivery_cards')
      .insert({
        destination: customer.delivery_location || 'Unassigned',
        status: 'draft',
        priority: 'normal',
        internal_notes: reason ? `Unloaded: ${reason}` : null,
        created_by: user.id,
      })
      .select()
      .single();

    if (queueErr || !queueCard) return NextResponse.json({ error: 'Failed to unload customer' }, { status: 500 });

    await admin
      .from('delivery_customers')
      .update({ delivery_card_id: queueCard.id, notes: notes || customer.notes })
      .eq('id', params.id);

    await logActivity(customer.delivery_card_id, user.id, ACTIONS.CUSTOMER_UNLOADED, {
      customer_name: customer.customer_name,
      reason,
      new_card_id: queueCard.id,
    });

    await followOrderToCard(admin, customer, queueCard.id);
    const discarded = await discardCardIfEmpty(admin, customer.delivery_card_id, user.id);
    return NextResponse.json({ success: true, newCardId: queueCard.id, source_card_discarded: discarded });
  }

  const updateData: Record<string, unknown> = {};
  const allowedFields = ['customer_name', 'customer_directory_id', 'customer_email', 'receive_auto_emails', 'delivery_location', 'notes', 'partial_shipment', 'partial_shipment_note', 'loading_priority', 'sort_order', 'order_value'];
  for (const field of allowedFields) {
    if (body[field] !== undefined) updateData[field] = body[field];
  }

  const lp = updateData.loading_priority;
  if (lp != null && (!Number.isInteger(lp) || (lp as number) < 1 || (lp as number) > 10)) {
    return NextResponse.json({ error: 'Loading priority must be an integer between 1 and 10' }, { status: 400 });
  }

  const ov = updateData.order_value;
  if (ov != null && (typeof ov !== 'number' || !Number.isFinite(ov) || ov < 0)) {
    return NextResponse.json({ error: 'Order value must be a non-negative number' }, { status: 400 });
  }

  const { data: updated, error } = await admin
    .from('delivery_customers')
    .update(updateData)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.partial_shipment) {
    await logActivity(customer.delivery_card_id, user.id, ACTIONS.PARTIAL_SHIPMENT_MARKED, {
      customer_name: customer.customer_name,
    });
  }

  return NextResponse.json({ customer: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user } = ctx;

  const admin = createSupabaseAdminClient();

  const { data: customer } = await admin.from('delivery_customers').select('*').eq('id', params.id).single();
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error } = await admin.from('delivery_customers').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(customer.delivery_card_id, user.id, ACTIONS.CUSTOMER_REMOVED, {
    customer_name: customer.customer_name,
  });

  await releaseOrderToPool(admin, customer);
  const discarded = await discardCardIfEmpty(admin, customer.delivery_card_id, user.id);
  return NextResponse.json({ success: true, source_card_discarded: discarded });
}
