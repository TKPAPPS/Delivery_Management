import { createSupabaseServerClient } from '@/lib/supabase-server';
import { formatDate, statusColor, statusLabel } from '@/lib/utils';
import Link from 'next/link';
import { Archive, Search } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { q?: string };
}

export default async function ArchivePage({ searchParams }: PageProps) {
  const supabase = createSupabaseServerClient();
  const q = searchParams.q ?? '';

  // Fetch ALL archived with customers for JS-side filtering
  const { data: cards } = await supabase
    .from('delivery_cards')
    .select(`
      *,
      customers:delivery_customers(
        customer_name,
        sale_orders:customer_sale_orders(sale_order_number)
      )
    `)
    .eq('is_archived', true)
    .order('archived_at', { ascending: false })
    .limit(200);

  // Filter in JS to support customer name + SO number search
  const filtered = q
    ? (cards ?? []).filter((card) => {
        const qLower = q.toLowerCase();
        const matchCard =
          card.destination?.toLowerCase().includes(qLower) ||
          card.delivery_ref?.toLowerCase().includes(qLower);
        const customers = card.customers as Array<{ customer_name: string; sale_orders: Array<{ sale_order_number: string }> }>;
        const matchCustomer = customers.some((c) =>
          c.customer_name?.toLowerCase().includes(qLower)
        );
        const matchSO = customers.some((c) =>
          c.sale_orders.some((so) => so.sale_order_number?.toLowerCase().includes(qLower))
        );
        return matchCard || matchCustomer || matchSO;
      })
    : (cards ?? []);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Archive className="w-5 h-5 text-slate-500" />
        <h1 className="text-xl font-bold text-slate-900">Archive</h1>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <form>
          <input
            name="q"
            defaultValue={q}
            placeholder="Search destination, ref, customer, SO number..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-crimson-500 bg-white"
          />
        </form>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Archive className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">{q ? 'No archived cards matching your search' : 'No archived cards yet'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((card) => {
            const customerNames = (card.customers as Array<{ customer_name: string; sale_orders: Array<{ sale_order_number: string }> }>).map((c) => c.customer_name);
            const allSOs = (card.customers as Array<{ customer_name: string; sale_orders: Array<{ sale_order_number: string }> }>).flatMap((c) => c.sale_orders.map((so) => so.sale_order_number));
            return (
              <Link
                key={card.id}
                href={`/cards/${card.id}`}
                className="block bg-white border border-slate-200 rounded-xl p-4 hover:border-crimson-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-crimson-700">{card.delivery_ref}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(card.status)}`}>
                        {statusLabel(card.status)}
                      </span>
                    </div>
                    <p className="font-semibold text-slate-900">{card.destination}</p>
                    {customerNames.length > 0 && (
                      <p className="text-xs text-slate-500 mt-1">{customerNames.join(', ')}</p>
                    )}
                    {allSOs.length > 0 && (
                      <p className="text-xs text-slate-400 font-mono">{allSOs.slice(0, 5).join(', ')}{allSOs.length > 5 ? ` +${allSOs.length - 5}` : ''}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    {card.planned_date && (
                      <p className="text-xs text-slate-500">{formatDate(card.planned_date)}</p>
                    )}
                    {card.archived_at && (
                      <p className="text-xs text-slate-400">Archived {formatDate(card.archived_at)}</p>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
