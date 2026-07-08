import { getSessionUser, createSupabaseServerClient } from '@/lib/supabase-server';
import ArchiveClient from './ArchiveClient';

export const dynamic = 'force-dynamic';

const COLS = `
  id, delivery_ref, destination, status, planned_date, archived_at, created_at, delivered_at, deleted_at,
  customers:delivery_customers!delivery_card_id(
    customer_name,
    sale_orders:customer_sale_orders(sale_order_number)
  )
`;

export default async function HistoryPage() {
  const ctx = await getSessionUser();
  const isAdmin = ctx?.profile.role === 'admin';
  const supabase = createSupabaseServerClient();

  // Fetch delivered + manually archived (both exclude soft-deleted). Deleted cards are
  // fetched separately for the admin-only "Deleted" view (restore path).
  const [{ data: delivered }, { data: archived }, { data: deleted }] = await Promise.all([
    supabase
      .from('delivery_cards')
      .select(COLS)
      .is('deleted_at', null)
      .eq('status', 'delivered')
      .eq('is_archived', false)
      .order('delivered_at', { ascending: false, nullsFirst: false })
      .limit(500),
    supabase
      .from('delivery_cards')
      .select(COLS)
      .is('deleted_at', null)
      .eq('is_archived', true)
      .order('archived_at', { ascending: false })
      .limit(500),
    isAdmin
      ? supabase
          .from('delivery_cards')
          .select(COLS)
          .not('deleted_at', 'is', null)
          .order('deleted_at', { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  // Merge delivered + archived, dedupe by id
  const seen = new Set<string>();
  const cards: typeof delivered = [];
  for (const card of [...(delivered ?? []), ...(archived ?? [])]) {
    if (!seen.has(card.id)) {
      seen.add(card.id);
      cards.push(card);
    }
  }

  return <ArchiveClient cards={cards as never} deletedCards={(deleted ?? []) as never} isAdmin={isAdmin} />;
}
