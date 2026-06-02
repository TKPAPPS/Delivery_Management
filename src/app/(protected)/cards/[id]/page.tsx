import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import CardDetailClient from './CardDetailClient';
import type { DeliveryCardFull, Driver, DeliveryCard } from '@/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

export default async function CardDetailPage({ params }: PageProps) {
  const supabase = createSupabaseServerClient();

  const [{ data: card }, { data: drivers }, { data: activeCards }] = await Promise.all([
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
        ),
        comments(
          *,
          profile:profiles(id, name, email)
        ),
        attachments(
          *,
          uploader:profiles!attachments_uploaded_by_fkey(id, name, email)
        ),
        activity_log(
          *,
          profile:profiles(id, name, email)
        )
      `)
      .eq('id', params.id)
      .single(),
    supabase.from('drivers').select('*').eq('active', true).order('name'),
    supabase
      .from('delivery_cards')
      .select('id, delivery_ref, destination')
      .is('deleted_at', null)
      .eq('is_archived', false)
      .neq('id', params.id)
      .order('created_at', { ascending: false }),
  ]);

  if (!card) notFound();

  return (
    <CardDetailClient
      card={card as DeliveryCardFull}
      drivers={(drivers ?? []) as Driver[]}
      activeCards={(activeCards ?? []) as Array<Pick<DeliveryCard, 'id' | 'delivery_ref' | 'destination'>>}
    />
  );
}
