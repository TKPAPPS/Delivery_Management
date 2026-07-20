import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { logActivity, ACTIONS } from '@/lib/activity';
import { parseBody } from '@/lib/parse-body';
import { discardCardIfEmpty, followOrderToCard, releaseOrderToPool, resolveDestinationCard } from '@/lib/customer-moves';

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
    const { action, target_card_id, new_destination, notes, reason } = body as {
      action?: string;
      target_card_id?: string;
      new_destination?: string;
      notes?: string;
      reason?: string;
    };

    // Planning Queue is unified with draft cards: unloading a customer spins off a fresh
    // DRAFT card (move/create pick an existing/new card instead). The customer's sale orders
    // and extra items follow via FK. Destination resolution is shared with the single-SO move.
    const dest = await resolveDestinationCard(
      admin,
      { action, targetCardId: target_card_id, newDestination: new_destination, reason, fallbackDestination: customer.delivery_location },
      user.id,
    );
    if ('error' in dest) return NextResponse.json({ error: dest.error }, { status: 400 });

    const { error } = await admin
      .from('delivery_customers')
      .update({ delivery_card_id: dest.cardId, notes: notes || customer.notes })
      .eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const isMove = action === 'move' || action === 'create_card';
    await logActivity(customer.delivery_card_id, user.id, isMove ? ACTIONS.CUSTOMER_MOVED : ACTIONS.CUSTOMER_UNLOADED, {
      customer_name: customer.customer_name,
      to_card_id: dest.cardId,
      ...(reason ? { reason } : {}),
    });

    await followOrderToCard(admin, customer, dest.cardId);
    const discarded = await discardCardIfEmpty(admin, customer.delivery_card_id, user.id);
    return NextResponse.json({
      success: true,
      newCardId: dest.createdNew ? dest.cardId : undefined,
      source_card_discarded: discarded,
    });
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
