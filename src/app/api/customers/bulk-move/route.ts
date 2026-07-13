import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { logActivity, ACTIONS } from '@/lib/activity';
import { parseBody } from '@/lib/parse-body';
import { discardCardIfEmpty, followOrderToCard } from '@/lib/customer-moves';

const ACTIVE_STATUSES = ['draft', 'pending_booking', 'booked', 'in_transit'];

/**
 * Move several customers to an existing card in one action (bulk version of the single
 * PATCH /api/customers/[id] { unload, action: 'move' } flow). Their orders follow, and any
 * source card left empty is auto-discarded.
 *
 * POST { customer_ids: string[], target_card_id: string }
 */
export async function POST(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user } = ctx;

  const parsed = await parseBody<{ customer_ids: string[]; target_card_id: string }>(req);
  if ('error' in parsed) return parsed.error;
  const customerIds = Array.isArray(parsed.data.customer_ids) ? parsed.data.customer_ids.filter(Boolean) : [];
  const targetCardId = typeof parsed.data.target_card_id === 'string' ? parsed.data.target_card_id : '';
  if (customerIds.length === 0) return NextResponse.json({ error: 'No customers provided' }, { status: 400 });
  if (!targetCardId) return NextResponse.json({ error: 'No target card provided' }, { status: 400 });

  const admin = createSupabaseAdminClient();

  const { data: customers } = await admin
    .from('delivery_customers')
    .select('id, delivery_card_id, order_id, customer_name')
    .in('id', customerIds);
  if (!customers || customers.length === 0) {
    return NextResponse.json({ error: 'Customers not found' }, { status: 404 });
  }

  // Validate the target card is a real, active destination.
  const { data: target } = await admin
    .from('delivery_cards')
    .select('id, single_customer_lock, status, is_archived, deleted_at')
    .eq('id', targetCardId)
    .maybeSingle();
  if (!target || target.deleted_at || target.is_archived || !ACTIVE_STATUSES.includes(target.status)) {
    return NextResponse.json({ error: 'Target delivery card not found or not active' }, { status: 404 });
  }

  // Skip any customer already on the target card.
  const moving = customers.filter((c) => c.delivery_card_id !== targetCardId);
  if (moving.length === 0) {
    return NextResponse.json({ error: 'Selected customers are already on that card' }, { status: 409 });
  }

  // single_customer_lock: the target may hold at most one customer.
  if (target.single_customer_lock) {
    const { count } = await admin
      .from('delivery_customers')
      .select('id', { count: 'exact', head: true })
      .eq('delivery_card_id', targetCardId);
    if ((count ?? 0) + moving.length > 1) {
      return NextResponse.json({ error: 'This vehicle is locked to a single customer' }, { status: 409 });
    }
  }

  const movingIds = moving.map((c) => c.id);
  const { error: moveErr } = await admin
    .from('delivery_customers')
    .update({ delivery_card_id: targetCardId })
    .in('id', movingIds);
  if (moveErr) return NextResponse.json({ error: moveErr.message }, { status: 500 });

  // Each moved customer's orders follow it to the target card.
  for (const c of moving) {
    await followOrderToCard(admin, { id: c.id, order_id: c.order_id }, targetCardId);
  }

  // Discard any source card left empty (runs once per distinct source).
  const sourceCardIds = Array.from(new Set(moving.map((c) => c.delivery_card_id).filter((id): id is string => !!id)));
  let sourceCardDiscarded = false;
  for (const src of sourceCardIds) {
    if (src === targetCardId) continue;
    const discarded = await discardCardIfEmpty(admin, src, user.id);
    if (discarded) sourceCardDiscarded = true;
    await logActivity(src, user.id, ACTIONS.CUSTOMER_MOVED, {
      count: moving.filter((c) => c.delivery_card_id === src).length,
      target_card_id: targetCardId,
    });
  }

  return NextResponse.json({
    success: true,
    moved: movingIds.length,
    source_card_discarded: sourceCardDiscarded,
    target_card_id: targetCardId,
  });
}
