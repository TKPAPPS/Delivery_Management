import { createSupabaseServerClient } from '@/lib/supabase-server';
import ArchiveClient from './ArchiveClient';

export const dynamic = 'force-dynamic';

export default async function ArchivePage() {
  const supabase = createSupabaseServerClient();

  const { data: cards } = await supabase
    .from('delivery_cards')
    .select(`
      id, delivery_ref, destination, status, planned_date, archived_at,
      customers:delivery_customers(
        customer_name,
        sale_orders:customer_sale_orders(sale_order_number)
      )
    `)
    .eq('is_archived', true)
    .order('archived_at', { ascending: false })
    .limit(500);

  return <ArchiveClient cards={(cards ?? []) as never} />;
}
