import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { logActivity, ACTIONS } from '@/lib/activity';
import { sendNotification, type NotificationType } from '@/lib/notifications';
import type { DeliveryStatus } from '@/types';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user } = ctx;

  const { status, delivery_notes } = await req.json();
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

  return NextResponse.json({ card });
}
