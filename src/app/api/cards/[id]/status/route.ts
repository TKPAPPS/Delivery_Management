import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { logActivity, ACTIONS } from '@/lib/activity';
import { sendNotification, type NotificationType } from '@/lib/notifications';
import { sendStatusCustomerEmails } from '@/lib/customer-messages';
import { parseBody } from '@/lib/parse-body';
import type { DeliveryStatus } from '@/types';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user } = ctx;

  const parsed = await parseBody<{ status: DeliveryStatus; delivery_notes?: string }>(req);
  if ('error' in parsed) return parsed.error;
  const { status, delivery_notes } = parsed.data;
  const validStatuses: DeliveryStatus[] = ['draft', 'pending_booking', 'booked', 'in_transit', 'delivered'];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from('delivery_cards')
    .select('status, delivery_ref, destination, planned_date')
    .eq('id', params.id)
    .single();

  if (!existing) return NextResponse.json({ error: 'Card not found' }, { status: 404 });

  const updateData: Record<string, unknown> = { status };
  if (status === 'delivered') {
    updateData.delivered_at = new Date().toISOString();
    if (delivery_notes !== undefined) {
      updateData.delivery_notes = delivery_notes || null;
    }
  }

  const { data: card, error } = await admin
    .from('delivery_cards')
    .update(updateData)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(params.id, user.id, ACTIONS.STATUS_CHANGED, { from: existing.status, to: status });

  // On delivery, close out any linked orders so they leave the active Orders Pool.
  // Local DB write only — the Odoo client is read-only and is never called here (no write-back).
  if (status === 'delivered') {
    const { data: linkedOrders } = await admin
      .from('orders')
      .select('id, status')
      .eq('delivery_card_id', params.id)
      .is('deleted_at', null);
    for (const o of linkedOrders ?? []) {
      if (o.status !== 'completed' && o.status !== 'cancelled') {
        await admin.from('orders').update({ status: 'completed' }).eq('id', o.id);
        await logActivity(
          null,
          user.id,
          ACTIONS.ORDER_UPDATED,
          { from: o.status, to: 'completed', reason: 'delivery_completed' },
          { entity_type: 'order', entity_id: o.id }
        );
      }
    }
  }

  const notifMap: Partial<Record<DeliveryStatus, NotificationType>> = {
    pending_booking: 'status_pending_booking',
    booked: 'status_booked',
    in_transit: 'status_in_transit',
    delivered: 'status_delivered',
  };
  const notifType = notifMap[status as DeliveryStatus];
  if (notifType) {
    void sendNotification(notifType, params.id, {
      deliveryRef: existing.delivery_ref,
      destination: existing.destination,
      plannedDate: existing.planned_date ?? undefined,
    });
  }

  // Customer-facing status emails (templates + per-customer opt-in). Fire-and-forget.
  void sendStatusCustomerEmails(params.id, status);

  return NextResponse.json({ card });
}
