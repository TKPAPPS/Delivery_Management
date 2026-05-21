import { notFound } from 'next/navigation';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { getSessionUser } from '@/lib/supabase-server';
import OrderDetailClient from './OrderDetailClient';
import type { OrderWithLines } from '@/types';

export const dynamic = 'force-dynamic';

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) notFound();

  const admin = createSupabaseAdminClient();

  const { data: order, error } = await admin
    .from('orders')
    .select(`
      *,
      customer:customer_directory!orders_customer_id_fkey(id, name),
      destination:destinations!orders_destination_id_fkey(id, name),
      creator:profiles!orders_created_by_fkey(id, name, email)
    `)
    .eq('id', params.id)
    .is('deleted_at', null)
    .single();

  if (error || !order) notFound();

  const [{ data: lines }, { data: activityLog }] = await Promise.all([
    admin.from('order_lines').select('*').eq('order_id', params.id).is('deleted_at', null).order('created_at'),
    admin
      .from('activity_log')
      .select('*, profile:profiles(id, name, email)')
      .eq('entity_type', 'order')
      .eq('entity_id', params.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const fullOrder: OrderWithLines = {
    ...(order as unknown as OrderWithLines),
    lines: (lines ?? []) as OrderWithLines['lines'],
    activity_log: (activityLog ?? []) as OrderWithLines['activity_log'],
  };

  return <OrderDetailClient initialOrder={fullOrder} role={ctx.profile.role} />;
}
