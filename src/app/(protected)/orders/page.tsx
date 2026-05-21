import { redirect } from 'next/navigation';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import OrdersPoolClient from './OrdersPoolClient';
import type { OrderListItem } from '@/types';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const ctx = await getSessionUser();
  if (!ctx) redirect('/login');

  const admin = createSupabaseAdminClient();

  const { data: orders } = await admin
    .from('orders')
    .select(`
      *,
      customer:customer_directory!orders_customer_id_fkey(id, name),
      destination:destinations!orders_destination_id_fkey(id, name),
      creator:profiles!orders_created_by_fkey(id, name, email)
    `)
    .is('deleted_at', null)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });

  // Enrich with line counts
  const orderIds = (orders ?? []).map((o) => o.id);
  const { data: lineRows } = await admin
    .from('order_lines')
    .select('order_id')
    .in('order_id', orderIds.length ? orderIds : ['00000000-0000-0000-0000-000000000000'])
    .is('deleted_at', null);

  const lineCountMap = (lineRows ?? []).reduce<Record<string, number>>((acc, l) => {
    acc[l.order_id] = (acc[l.order_id] ?? 0) + 1;
    return acc;
  }, {});

  const enriched = (orders ?? []).map((o) => ({
    ...o,
    _count: { lines: lineCountMap[o.id] ?? 0 },
  })) as unknown as OrderListItem[];

  return <OrdersPoolClient initialOrders={enriched} role={ctx.profile.role} />;
}
