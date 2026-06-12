import { createSupabaseServerClient } from '@/lib/supabase-server';
import BoardClient from './BoardClient';
import type { DeliveryCardWithCustomers } from '@/types';

export const dynamic = 'force-dynamic';

export default async function BoardPage() {
  const supabase = createSupabaseServerClient();

  // Run all three queries in parallel
  const [{ data: cards }, { data: commentCounts }, { data: attachmentCounts }] = await Promise.all([
    supabase
      .from('delivery_cards')
      .select(`
        *,
        driver:drivers(*),
        creator:profiles!delivery_cards_created_by_fkey(id, name, email),
        customers:delivery_customers(
          *,
          sale_orders:customer_sale_orders(*),
          extra_items:extra_delivery_items(*)
        )
      `)
      .is('deleted_at', null)
      .eq('is_archived', false)
      .in('status', ['draft', 'pending_booking', 'booked', 'in_transit'])
      .order('created_at', { ascending: false }),
    supabase.from('comments').select('delivery_card_id, body, created_at').order('created_at', { ascending: false }),
    supabase.from('attachments').select('delivery_card_id'),
  ]);

  // commentCounts is ordered newest-first, so the first row seen per card is its latest comment.
  const commentMap: Record<string, number> = {};
  const latestCommentMap: Record<string, { body: string; created_at: string }> = {};
  for (const c of commentCounts ?? []) {
    commentMap[c.delivery_card_id] = (commentMap[c.delivery_card_id] ?? 0) + 1;
    if (!latestCommentMap[c.delivery_card_id]) {
      latestCommentMap[c.delivery_card_id] = { body: c.body, created_at: c.created_at };
    }
  }

  const attachmentMap = (attachmentCounts ?? []).reduce<Record<string, number>>((acc, a) => {
    acc[a.delivery_card_id] = (acc[a.delivery_card_id] ?? 0) + 1;
    return acc;
  }, {});

  const enrichedCards = (cards ?? []).map((card) => ({
    ...card,
    _count: {
      comments: commentMap[card.id] ?? 0,
      attachments: attachmentMap[card.id] ?? 0,
    },
    _latest_comment: latestCommentMap[card.id] ?? null,
  })) as DeliveryCardWithCustomers[];

  return <BoardClient initialCards={enrichedCards} />;
}
