import { createSupabaseServerClient } from '@/lib/supabase-server';
import ArchiveClient from './ArchiveClient';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const supabase = createSupabaseServerClient();

  // Fetch delivered cards + manually archived cards
  const [{ data: delivered }, { data: archived }] = await Promise.all([
    supabase
      .from('delivery_cards')
      .select(`
        id, delivery_ref, destination, status, planned_date, archived_at, created_at,
        customers:delivery_customers(
          customer_name,
          sale_orders:customer_sale_orders(sale_order_number)
        )
      `)
      .eq('status', 'delivered')
      .eq('is_archived', false)
      .order('updated_at', { ascending: false })
      .limit(500),
    supabase
      .from('delivery_cards')
      .select(`
        id, delivery_ref, destination, status, planned_date, archived_at, created_at,
        customers:delivery_customers(
          customer_name,
          sale_orders:customer_sale_orders(sale_order_number)
        )
      `)
      .eq('is_archived', true)
      .order('archived_at', { ascending: false })
      .limit(500),
  ]);

  // Merge: delivered first, then archived, deduplicate by id
  const seen = new Set<string>();
  const cards: typeof delivered = [];
  for (const card of [...(delivered ?? []), ...(archived ?? [])]) {
    if (!seen.has(card.id)) {
      seen.add(card.id);
      cards.push(card);
    }
  }

  return <ArchiveClient cards={cards as never} />;
}
