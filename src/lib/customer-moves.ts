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
