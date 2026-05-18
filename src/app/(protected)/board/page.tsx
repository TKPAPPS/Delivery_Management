import { createSupabaseServerClient } from '@/lib/supabase-server';
import BoardClient from './BoardClient';
import type { DeliveryCardWithCustomers } from '@/types';

export const dynamic = 'force-dynamic';

export default async function BoardPage() {
  const supabase = createSupabaseServerClient();

  const { data: cards } = await supabase
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
    .eq('is_archived', false)
    .order('created_at', { ascending: false });

  // Add comment and attachment counts
  const cardIds = (cards ?? []).map((c) => c.id);

  const [{ data: commentCounts }, { data: attachmentCounts }] = await Promise.all([
    supabase
      .from('comments')
      .select('delivery_card_id')
      .in('delivery_card_id', cardIds),
    supabase
      .from('attachments')
      .select('delivery_card_id')
      .in('delivery_card_id', cardIds),
  ]);

  const commentMap = (commentCounts ?? []).reduce<Record<string, number>>((acc, c) => {
    acc[c.delivery_card_id] = (acc[c.delivery_card_id] ?? 0) + 1;
    return acc;
  }, {});

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
  })) as DeliveryCardWithCustomers[];

  return <BoardClient initialCards={enrichedCards} />;
}
