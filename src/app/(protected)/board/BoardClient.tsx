'use client';

import { useState, useCallback } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import KanbanColumn from '@/components/board/KanbanColumn';
import CreateCardModal from '@/components/board/CreateCardModal';
import Button from '@/components/ui/Button';
import { Plus, RefreshCw, AlertTriangle, Truck } from 'lucide-react';
import type { DeliveryCardWithCustomers, DeliveryStatus } from '@/types';
import { useToastStore } from '@/store/toastStore';
import { statusLabel, statusColor, formatDate } from '@/lib/utils';
import Link from 'next/link';

const STATUSES: DeliveryStatus[] = ['draft', 'driver_needed', 'driver_booked', 'loaded'];

interface BoardClientProps {
  initialCards: DeliveryCardWithCustomers[];
}

export default function BoardClient({ initialCards }: BoardClientProps) {
  const [cards, setCards] = useState<DeliveryCardWithCustomers[]>(initialCards);
  const [createOpen, setCreateOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [mobileFilter, setMobileFilter] = useState<DeliveryStatus | 'all'>('all');
  const addToast = useToastStore((s) => s.addToast);

  const cardsByStatus = STATUSES.reduce<Record<DeliveryStatus, DeliveryCardWithCustomers[]>>(
    (acc, status) => {
      acc[status] = cards.filter((c) => c.status === status);
      return acc;
    },
    { draft: [], driver_needed: [], driver_booked: [], loaded: [] }
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
        if (newStatus === 'loaded') {
          addToast('Card loaded — open it to archive when delivery is complete', 'success');
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
      if (newStatus === 'loaded') {
        addToast('Card loaded — open it to archive when delivery is complete', 'success');
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

  const mobileCards = mobileFilter === 'all' ? cards : cards.filter((c) => c.status === mobileFilter);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-slate-200 bg-white flex-shrink-0">
        <h1 className="text-xl font-bold text-black">Delivery Board</h1>
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
