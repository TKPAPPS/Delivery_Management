import { createSupabaseServerClient } from '@/lib/supabase-server';
import type { DeliveryCardWithCustomers } from '@/types';
import ExportClient from './ExportClient';

export const dynamic = 'force-dynamic';

export default async function ExportPage() {
  const supabase = createSupabaseServerClient();

  // Every non-deleted card across all statuses (active, delivered, archived) so the
  // operator can pick any of them to export. Volume is small (tens–hundreds), so a
  // single fetch is fine.
  const { data: cards } = await supabase
    .from('delivery_cards')
    .select(`
      *,
      driver:drivers(*),
      creator:profiles!delivery_cards_created_by_fkey(id, name, email),
      customers:delivery_customers!delivery_card_id(
        *,
        sale_orders:customer_sale_orders(*),
        extra_items:extra_delivery_items(*)
      )
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  return <ExportClient cards={(cards ?? []) as unknown as DeliveryCardWithCustomers[]} />;
}
