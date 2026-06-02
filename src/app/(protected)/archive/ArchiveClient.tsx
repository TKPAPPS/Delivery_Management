'use client';

import { useState } from 'react';
import { formatDate, statusColor, statusLabel } from '@/lib/utils';
import Link from 'next/link';
import { History, Search, Trash2, RotateCcw } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useToastStore } from '@/store/toastStore';
import { useRouter } from 'next/navigation';

interface ArchiveCard {
  id: string;
  delivery_ref: string;
  destination: string;
  status: string;
  planned_date: string | null;
  archived_at: string | null;
  created_at: string;
  delivered_at: string | null;
  deleted_at: string | null;
  customers: Array<{ customer_name: string; sale_orders: Array<{ sale_order_number: string }> }>;
}

interface ArchiveClientProps {
  cards: ArchiveCard[];
  deletedCards: ArchiveCard[];
  isAdmin: boolean;
}

export default function ArchiveClient({ cards, deletedCards, isAdmin }: ArchiveClientProps) {
  const addToast = useToastStore((s) => s.addToast);
  const router = useRouter();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'history' | 'deleted'>('history');
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [localDeleted, setLocalDeleted] = useState(deletedCards);

  const source = tab === 'deleted' ? localDeleted : cards;
  const filtered = q.trim()
    ? source.filter((card) => {
        const qLower = q.toLowerCase();
        return (
          card.destination?.toLowerCase().includes(qLower) ||
          card.delivery_ref?.toLowerCase().includes(qLower) ||
          card.customers.some((c) => c.customer_name?.toLowerCase().includes(qLower)) ||
          card.customers.some((c) =>
            c.sale_orders.some((so) => so.sale_order_number?.toLowerCase().includes(qLower))
          )
        );
      })
    : source;

  const deliveredCount = cards.filter((c) => c.status === 'delivered').length;
  const archivedCount = cards.filter((c) => c.status !== 'delivered').length;

  const restore = async (id: string) => {
    setRestoringId(id);
    try {
      const res = await fetch(`/api/cards/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleted_at: null }),
      });
      if (!res.ok) throw new Error();
      setLocalDeleted((prev) => prev.filter((c) => c.id !== id));
      addToast('Card restored', 'success');
      router.refresh();
    } catch {
      addToast('Failed to restore card', 'error');
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <History className="w-5 h-5 text-slate-700" />
        <h1 className="text-xl font-bold text-black">History</h1>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        {deliveredCount} delivered · {archivedCount} archived
      </p>

      {/* Tabs (Deleted is admin-only) */}
      {isAdmin && (
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab('history')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${tab === 'history' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            History
          </button>
          <button
            onClick={() => setTab('deleted')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${tab === 'deleted' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            <Trash2 className="w-3 h-3" /> Deleted ({localDeleted.length})
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search destination, ref, customer, SO number..."
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-crimson-500 bg-white"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <History className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">
            {q ? 'No cards matching your search' : tab === 'deleted' ? 'No deleted cards' : 'No history yet'}
          </p>
          {!q && tab === 'history' && <p className="text-xs mt-1">Completed deliveries will appear here</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((card) => {
            const customerNames = card.customers.map((c) => c.customer_name);
            const allSOs = card.customers.flatMap((c) => c.sale_orders.map((so) => so.sale_order_number));
            const isDelivered = card.status === 'delivered';
            const inner = (
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-mono text-xs text-crimson-700">{card.delivery_ref}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(card.status as never)}`}>
                      {statusLabel(card.status as never)}
                    </span>
                  </div>
                  <p className="font-semibold text-slate-900">{card.destination}</p>
                  {customerNames.length > 0 && (
                    <p className="text-xs text-slate-500 mt-1">{customerNames.join(', ')}</p>
                  )}
                  {allSOs.length > 0 && (
                    <p className="text-xs text-slate-400 font-mono">
                      {allSOs.slice(0, 5).join(', ')}{allSOs.length > 5 ? ` +${allSOs.length - 5}` : ''}
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0 text-xs text-slate-400">
                  {tab === 'deleted' ? (
                    <Button size="sm" variant="outline" onClick={() => restore(card.id)} loading={restoringId === card.id}>
                      <RotateCcw className="w-3.5 h-3.5" /> Restore
                    </Button>
                  ) : (
                    <>
                      {card.planned_date && <p className="text-slate-500">{formatDate(card.planned_date)}</p>}
                      {isDelivered ? (
                        <p>Delivered {card.delivered_at ? formatDate(card.delivered_at) : formatDate(card.created_at)}</p>
                      ) : card.archived_at ? (
                        <p>Archived {formatDate(card.archived_at)}</p>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            );
            // Deleted rows aren't links (restore is the action); history rows open the card.
            return tab === 'deleted' ? (
              <div key={card.id} className="block bg-white border border-slate-200 rounded-xl p-4">{inner}</div>
            ) : (
              <Link
                key={card.id}
                href={`/cards/${card.id}`}
                className="block bg-white border border-slate-200 rounded-xl p-4 hover:border-crimson-300 transition-colors"
              >
                {inner}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
