'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

/**
 * Drop-in client component that re-runs the current server component whenever
 * delivery data changes anywhere, giving server-rendered pages (dashboard, etc.)
 * live cross-section sync without converting them to client components.
 */
export default function RealtimeRefresh() {
  const router = useRouter();
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel('realtime-refresh')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_cards' }, () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_customers' }, () => router.refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [router]);
  return null;
}
