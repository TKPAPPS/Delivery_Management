'use client';

import { useState, useCallback } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import KanbanColumn from '@/components/board/KanbanColumn';
import CreateCardModal from '@/components/board/CreateCardModal';
import Button from '@/components/ui/Button';
import { Plus, RefreshCw } from 'lucide-react';
import type { DeliveryCardWithCustomers, DeliveryStatus } from '@/types';
import { useToastStore } from '@/store/toastStore';

const STATUSES: DeliveryStatus[] = ['draft', 'driver_needed', 'driver_booked', 'loaded'];

interface BoardClientProps {
  initialCards: DeliveryCardWithCustomers[];
}

export default function BoardClient({ initialCards }: BoardClientProps) {
  const [cards, setCards] = useState<DeliveryCardWithCustomers[]>(initialCards);
  const [createOpen, setCreateOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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

      // Optimistic update
      setCards((prev) =>
        prev.map((c) => (c.id === draggableId ? { ...c, status: newStatus } : c))
      );

      try {
        const res = await fetch(`/api/cards/${draggableId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
        if (!res.ok) {
          throw new Error('Failed to update status');
        }
        addToast(`Card moved to ${newStatus.replace(/_/g, ' ')}`, 'success');
      } catch {
        // Revert
        setCards((prev) =>
          prev.map((c) => (c.id === draggableId ? { ...c, status: oldStatus } : c))
        );
        addToast('Failed to update card status', 'error');
      }
    },
    [addToast]
  );

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

  return (
    <div className="flex flex-col h-full">
      {/* Board toolbar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white flex-shrink-0">
        <h1 className="text-xl font-bold text-slate-900">Delivery Board</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={refresh} loading={refreshing}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" /> New Card
          </Button>
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto p-6">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-4 h-full min-h-[calc(100vh-10rem)]">
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
