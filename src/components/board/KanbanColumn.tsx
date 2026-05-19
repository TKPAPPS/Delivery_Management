'use client';

import { Droppable, Draggable } from '@hello-pangea/dnd';
import { cn, statusLabel } from '@/lib/utils';
import type { DeliveryCardWithCustomers, DeliveryStatus } from '@/types';
import DeliveryCardPreview from './DeliveryCardPreview';

interface KanbanColumnProps {
  status: DeliveryStatus;
  cards: DeliveryCardWithCustomers[];
}

export default function KanbanColumn({ status, cards }: KanbanColumnProps) {
  const columnStyles: Record<DeliveryStatus, { container: string; badge: string }> = {
    draft: {
      container: 'bg-slate-50/50 border-slate-200',
      badge: 'bg-slate-100 text-slate-600',
    },
    driver_needed: {
      container: 'bg-gold-50/50 border-gold-200',
      badge: 'bg-gold-100 text-gold-700',
    },
    driver_booked: {
      container: 'bg-crimson-50/50 border-crimson-200',
      badge: 'bg-crimson-100 text-crimson-700',
    },
    loaded: {
      container: 'bg-emerald-50/50 border-emerald-200',
      badge: 'bg-emerald-100 text-emerald-700',
    },
    delivered: {
      container: 'bg-teal-50/50 border-teal-200',
      badge: 'bg-teal-100 text-teal-700',
    },
  };

  const headerTextColors: Record<DeliveryStatus, string> = {
    draft: 'text-slate-600',
    driver_needed: 'text-gold-700',
    driver_booked: 'text-crimson-700',
    loaded: 'text-emerald-700',
    delivered: 'text-teal-700',
  };

  const styles = columnStyles[status];

  return (
    <div className={cn('flex flex-col rounded-xl border min-w-[280px] w-72', styles.container)}>
      <div className="p-3 border-b border-inherit">
        <div className="flex items-center justify-between">
          <h3 className={cn('font-bold text-sm', headerTextColors[status])}>{statusLabel(status)}</h3>
          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', styles.badge)}>
            {cards.length}
          </span>
        </div>
      </div>
      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              'flex-1 p-3 space-y-2 min-h-[200px] transition-colors',
              snapshot.isDraggingOver && 'bg-crimson-50/30'
            )}
          >
            {cards.map((card, index) => (
              <Draggable key={card.id} draggableId={card.id} index={index}>
                {(prov, snap) => (
                  <div
                    ref={prov.innerRef}
                    {...prov.draggableProps}
                    {...prov.dragHandleProps}
                  >
                    <DeliveryCardPreview card={card} dragging={snap.isDragging} />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
            {cards.length === 0 && !snapshot.isDraggingOver && (
              <p className="text-xs text-slate-400 text-center py-8">No cards</p>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
}
