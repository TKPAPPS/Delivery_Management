'use client';

import { useState, useCallback, useEffect } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import KanbanColumn from '@/components/board/KanbanColumn';
import CreateCardModal from '@/components/board/CreateCardModal';
import Button from '@/components/ui/Button';
import { Plus, RefreshCw, AlertTriangle, Truck, Search, X } from 'lucide-react';
import type { DeliveryCardWithCustomers, DeliveryStatus } from '@/types';
import { useToastStore } from '@/store/toastStore';
import { statusLabel, statusColor, formatDate } from '@/lib/utils';
import Link from 'next/link';

const STATUSES: DeliveryStatus[] = ['draft', 'pending_booking', 'booked', 'in_transit'];

interface BoardClientProps {
  initialCards: DeliveryCardWithCustomers[];
}

export default function BoardClient({ initialCards }: BoardClientProps) {
  const [cards, setCards] = useState<DeliveryCardWithCustomers[]>(initialCards);
  const [createOpen, setCreateOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [mobileFilter, setMobileFilter] = useState<DeliveryStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const addToast = useToastStore((s) => s.addToast);

  const searchLower = searchQuery.toLowerCase().trim();
  const visibleCards = searchLower
    ? cards.filter((card) =>
        card.destination?.toLowerCase().includes(searchLower) ||
        card.delivery_ref?.toLowerCase().includes(searchLower) ||
        card.driver?.name?.toLowerCase().includes(searchLower) ||
        card.driver_name_manual?.toLowerCase().includes(searchLower) ||
        card.customers.some((c) => c.customer_name.toLowerCase().includes(searchLower)) ||
        card.customers.some((c) =>
          c.sale_orders.some((so) => so.sale_order_number.toLowerCase().includes(searchLower))
        )
      )
    : cards;

  const cardsByStatus = STATUSES.reduce<Record<DeliveryStatus, DeliveryCardWithCustomers[]>>(
    (acc, status) => {
      acc[status] = visibleCards.filter((c) => c.status === status);
      return acc;
    },
    { draft: [], pending_booking: [], booked: [], in_transit: [], delivered: [] }
  );

  const onDragEnd = useCallback(
    async (result: DropResult) => {
      const { destination, source, draggableId } = result;
      if (!destination) return;
      if (destination.droppableId === source.droppableId) return;

      const newStatus = destination.droppableId as DeliveryStatus;
      const oldStatus = source.droppableId as DeliveryStatus;

      setCards((prev) =>
        prev.map((c) => (c.id === draggableId ? { ...c, status: newStatus } : c))
      );

      try {
        const res = await fetch(`/api/cards/${draggableId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
        if (!res.ok) throw new Error('Failed to update status');
        if (newStatus === 'in_transit') {
          addToast('Card in transit — open it to mark as delivered when done', 'success');
        } else {
          addToast(`Card moved to ${statusLabel(newStatus)}`, 'success');
        }
      } catch {
        setCards((prev) =>
          prev.map((c) => (c.id === draggableId ? { ...c, status: oldStatus } : c))
        );
        addToast('Failed to update card status', 'error');
      }
    },
    [addToast]
  );

  const handleMobileStatusChange = async (cardId: string, oldStatus: DeliveryStatus, newStatus: DeliveryStatus) => {
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, status: newStatus } : c)));
    try {
      const res = await fetch(`/api/cards/${cardId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      if (newStatus === 'in_transit') {
        addToast('Card in transit — open it to mark as delivered when done', 'success');
      } else {
        addToast('Status updated', 'success');
      }
    } catch {
      setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, status: oldStatus } : c)));
      addToast('Failed to update status', 'error');
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/cards?include_customers=true');
      const data = await res.json();
      if (data.cards) setCards(data.cards);
    } catch {
      addToast('Failed to refresh board', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  // Live sync: refetch the board whenever cards/customers change anywhere in the app.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const reload = async () => {
      try {
        const res = await fetch('/api/cards?include_customers=true');
        const data = await res.json();
        if (data.cards) setCards(data.cards);
      } catch { /* transient — next event will retry */ }
    };
    const channel = supabase
      .channel('board-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_cards' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_customers' }, reload)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const mobileCards = mobileFilter === 'all' ? visibleCards : visibleCards.filter((c) => c.status === mobileFilter);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-slate-200 bg-white flex-shrink-0 gap-3">
        <h1 className="text-xl font-bold text-black hidden md:block flex-shrink-0">Delivery Board</h1>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search cards…"
            className="w-full pl-9 pr-8 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-crimson-500 bg-white"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={refresh} loading={refreshing}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" /> New Card
          </Button>
        </div>
      </div>

      {/* Mobile list view */}
      <div className="md:hidden flex-1 overflow-y-auto">
        {/* Status filter tabs */}
        <div className="flex overflow-x-auto gap-2 px-4 py-3 border-b border-slate-100 bg-white">
          <button
            onClick={() => setMobileFilter('all')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              mobileFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            All ({cards.length})
          </button>
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setMobileFilter(s)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                mobileFilter === s
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {statusLabel(s)} ({cardsByStatus[s].length})
            </button>
          ))}
        </div>

        {/* Card list */}
        <div className="p-4 space-y-3">
          {mobileCards.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-12">No cards</p>
          ) : (
            mobileCards.map((card) => {
              const customerNames = card.customers.map((c) => c.customer_name);
              const driverName = card.driver?.name ?? card.driver_name_manual ?? null;
              return (
                <div key={card.id} className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <span className="font-mono text-xs text-crimson-700">{card.delivery_ref}</span>
                      {card.priority === 'urgent' && (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs text-crimson-700 font-medium">
                          <AlertTriangle className="w-3 h-3" /> Urgent
                        </span>
                      )}
                      <p className="font-bold text-slate-900 mt-0.5">{card.destination}</p>
                      {card.planned_date && (
                        <p className="text-xs text-slate-500 mt-0.5">{formatDate(card.planned_date)}</p>
                      )}
                    </div>
                    <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(card.status)}`}>
                      {statusLabel(card.status)}
                    </span>
                  </div>

                  {customerNames.length > 0 && (
                    <p className="text-xs text-slate-600 mb-2 truncate">
                      {customerNames.slice(0, 3).join(', ')}{customerNames.length > 3 ? ` +${customerNames.length - 3}` : ''}
                    </p>
                  )}

                  {driverName && (
                    <p className="text-xs text-gold-700 flex items-center gap-1 mb-3">
                      <Truck className="w-3 h-3" /> {driverName}
                    </p>
                  )}

                  <div className="flex items-center gap-2">
                    <select
                      value={card.status}
                      onChange={(e) => handleMobileStatusChange(card.id, card.status, e.target.value as DeliveryStatus)}
                      className="flex-1 text-sm border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-crimson-500 bg-white"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{statusLabel(s)}</option>
                      ))}
                    </select>
                    <Link
                      href={`/cards/${card.id}`}
                      className="flex-shrink-0 text-xs text-crimson-700 font-medium border border-crimson-200 rounded-lg px-3 py-1.5 hover:bg-crimson-50 transition-colors"
                    >
                      Open
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Desktop Kanban */}
      <div className="hidden md:flex flex-1 overflow-x-auto p-6">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-4 w-full min-h-[calc(100vh-10rem)]">
            {STATUSES.map((status) => (
              <KanbanColumn key={status} status={status} cards={cardsByStatus[status]} />
            ))}
          </div>
        </DragDropContext>
      </div>

      <CreateCardModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={refresh}
      />
    </div>
  );
}
