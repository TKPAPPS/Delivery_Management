import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { logActivity, ACTIONS } from '@/lib/activity';
import { sendNotification } from '@/lib/notifications';
import { sendStatusCustomerEmails } from '@/lib/customer-messages';
import { parseBody } from '@/lib/parse-body';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: card, error } = await ctx.supabase
    .from('delivery_cards')
    .select(`
      *,
      driver:drivers(*),
      creator:profiles!delivery_cards_created_by_fkey(id, name, email),
      customers:delivery_customers!delivery_card_id(
        *,
        sale_orders:customer_sale_orders(*),
        extra_items:extra_delivery_items(*)
      ),
      comments(
        *,
        profile:profiles(id, name, email)
      ),
      attachments(
        *,
        uploader:profiles!attachments_uploaded_by_fkey(id, name, email)
      ),
      activity_log(
        *,
        profile:profiles(id, name, email)
      )
    `)
    .eq('id', params.id)
    .single();

  if (error || !card) return NextResponse.json({ error: 'Card not found' }, { status: 404 });

  return NextResponse.json({ card });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user } = ctx;

  const parsed = await parseBody(req);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;
  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin.from('delivery_cards').select('*').eq('id', params.id).single();
  if (!existing) return NextResponse.json({ error: 'Card not found' }, { status: 404 });

  // Whitelist updatable columns. Identity/lifecycle fields (id, delivery_ref,
  // created_by, created_at, delivered_at) and `status` are intentionally NOT here:
  // status must go through /api/cards/[id]/status so notifications + customer emails fire.
  const ALLOWED_FIELDS = [
    'destination', 'planned_date', 'priority', 'loading_priority', 'single_customer_lock',
    'internal_notes', 'delivery_notes',
    'delivery_method', 'delivery_type', 'sort_order', 'is_archived', 'archived_at',
    'driver_id', 'driver_name_manual', 'driver_phone_manual', 'vehicle_type_manual', 'license_plate_manual',
    'planned_time', 'shipping_type',
    'courier_company_id', 'courier_company_name', 'tracking_number',
    'cargo_company_id', 'cargo_company_name', 'mawb_number', 'hawb_number', 'flight_number', 'cargo_etd', 'cargo_eta',
    'other_method_name', 'other_tracking_ref',
    'car_cost', 'original_booker_id',
  ] as const;
  const updateData: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (body[field] !== undefined) updateData[field] = body[field];
  }

  const lp = updateData.loading_priority;
  if (lp !== undefined && lp !== null && (!Number.isInteger(lp) || (lp as number) < 1 || (lp as number) > 10)) {
    return NextResponse.json({ error: 'Loading priority must be an integer between 1 and 10' }, { status: 400 });
  }

  const cc = updateData.car_cost;
  if (cc !== undefined && cc !== null && (typeof cc !== 'number' || !Number.isFinite(cc) || cc < 0)) {
    return NextResponse.json({ error: 'Car cost must be a non-negative number' }, { status: 400 });
  }

  // The original booker must be a customer on THIS card. The DB FK only guarantees the id points
  // at some delivery_customers row, so without this a booker from another card could be stored,
  // leaving the card with nobody exempt (every customer wrongly surcharged).
  if (updateData.original_booker_id !== undefined && updateData.original_booker_id !== null) {
    const { data: booker } = await admin
      .from('delivery_customers')
      .select('id')
      .eq('id', updateData.original_booker_id)
      .eq('delivery_card_id', params.id)
      .maybeSingle();
    if (!booker) {
      return NextResponse.json({ error: 'Original booker must be a customer on this card' }, { status: 400 });
    }
  }

  // Restore (admin only): clearing deleted_at brings a soft-deleted card back. Soft-deleting
  // is not allowed via PATCH — it goes through DELETE — so only `null` is accepted here.
  const isRestore = body.deleted_at === null;
  if (isRestore) {
    if (ctx.profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    updateData.deleted_at = null;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
  }

  const { data: card, error } = await admin
    .from('delivery_cards')
    .update(updateData)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.is_archived) {
    await logActivity(params.id, user.id, ACTIONS.CARD_ARCHIVED);
  } else if (body.driver_id !== undefined || body.driver_name_manual !== undefined) {
    await logActivity(params.id, user.id, ACTIONS.DRIVER_UPDATED);
    // Fire notification when a driver is newly assigned (wasn't set before)
    const wasUnassigned = !existing.driver_id && !existing.driver_name_manual;
    const isNowAssigned = body.driver_id || body.driver_name_manual;
    if (wasUnassigned && isNowAssigned) {
      let driverName = (body.driver_name_manual as string | undefined) ?? null;
      if (body.driver_id && !driverName) {
        const { data: driver } = await admin.from('drivers').select('name').eq('id', body.driver_id).single();
        driverName = driver?.name ?? null;
      }
      void sendNotification('driver_assigned', params.id, {
        deliveryRef: existing.delivery_ref,
        destination: existing.destination,
        driverName: driverName ?? 'Unknown',
      });

      // Auto-advance to "booked" once a driver is assigned, but only from the
      // pre-booking stages — never downgrade a card already booked/in transit/delivered.
      if (existing.status === 'draft' || existing.status === 'pending_booking') {
        const { error: statusErr } = await admin
          .from('delivery_cards')
          .update({ status: 'booked' })
          .eq('id', params.id);
        if (!statusErr) {
          card.status = 'booked';
          await logActivity(params.id, user.id, ACTIONS.STATUS_CHANGED, {
            from: existing.status, to: 'booked', reason: 'driver_assigned',
          });
          void sendNotification('status_booked', params.id, {
            deliveryRef: existing.delivery_ref,
            destination: existing.destination,
            plannedDate: existing.planned_date ?? undefined,
          });
          void sendStatusCustomerEmails(params.id, 'booked');
        }
      }
    }
  } else if (isRestore) {
    await logActivity(params.id, user.id, ACTIONS.CARD_RESTORED);
  } else {
    await logActivity(params.id, user.id, ACTIONS.CARD_UPDATED, { changes: Object.keys(updateData) });
  }

  return NextResponse.json({ card });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();

  // Admins can delete any card. Non-admins may delete only draft cards
  // (the Planning Queue surface — disposable, not yet in the active pipeline).
  if (ctx.profile.role !== 'admin') {
    const { data: target } = await admin
      .from('delivery_cards')
      .select('status, is_archived')
      .eq('id', params.id)
      .single();
    if (!target || target.status !== 'draft' || target.is_archived) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // Soft-delete: hide the card but keep it (and its attachments) recoverable by an admin.
  const { error } = await admin
    .from('delivery_cards')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Release this card's orders back to the Orders Pool (unassigned) so they're not stuck
  // pointing at a deleted card; they can be dispatched again.
  await admin
    .from('orders')
    .update({ delivery_card_id: null, status: 'pending' })
    .eq('delivery_card_id', params.id)
    .not('status', 'in', '("completed","cancelled")');

  await logActivity(params.id, ctx.user.id, ACTIONS.CARD_DELETED);

  return NextResponse.json({ success: true });
}
