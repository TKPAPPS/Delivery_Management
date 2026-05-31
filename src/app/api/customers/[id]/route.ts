import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { logActivity, ACTIONS } from '@/lib/activity';
import { parseBody } from '@/lib/parse-body';

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

      return NextResponse.json({ success: true });
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

      return NextResponse.json({ success: true, newCardId: newCard.id });
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

    return NextResponse.json({ success: true, newCardId: queueCard.id });
  }

  const updateData: Record<string, unknown> = {};
  const allowedFields = ['customer_name', 'customer_directory_id', 'customer_email', 'receive_auto_emails', 'delivery_location', 'notes', 'partial_shipment', 'partial_shipment_note', 'sort_order'];
  for (const field of allowedFields) {
    if (body[field] !== undefined) updateData[field] = body[field];
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

  return NextResponse.json({ success: true });
}
