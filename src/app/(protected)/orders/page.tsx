import { redirect } from 'next/navigation';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import OrdersPoolClient from './OrdersPoolClient';
import { queryOrdersPage, ORDERS_PAGE_SIZE } from '@/lib/orders-query';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const ctx = await getSessionUser();
  if (!ctx) redirect('/login');

  const admin = createSupabaseAdminClient();

  // First paint: page 1 of the default "Active (unassigned)" view. Further pages,
  // filters and search are fetched on demand from /api/orders (server-paginated).
  const { orders, total } = await queryOrdersPage(admin, { status: 'active', page: 1 });

  return (
    <OrdersPoolClient
      initialOrders={orders}
      initialTotal={total}
      pageSize={ORDERS_PAGE_SIZE}
      role={ctx.profile.role}
    />
  );
}
