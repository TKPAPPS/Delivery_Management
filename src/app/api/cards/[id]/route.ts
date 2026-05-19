import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { logActivity, ACTIONS } from '@/lib/activity';
import { sendNotification } from '@/lib/notifications';
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
      customers:delivery_customers(
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

  const { data: card, error } = await admin
    .from('delivery_cards')
    .update(body)
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
    }
  } else {
    await logActivity(params.id, user.id, ACTIONS.CARD_UPDATED, { changes: Object.keys(body) });
  }

  return NextResponse.json({ card });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx || ctx.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('delivery_cards').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
