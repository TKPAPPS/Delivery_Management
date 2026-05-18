'use client';

import { Droppable, Draggable } from '@hello-pangea/dnd';
import { cn, statusColor, statusLabel } from '@/lib/utils';
import type { DeliveryCardWithCustomers, DeliveryStatus } from '@/types';
import DeliveryCardPreview from './DeliveryCardPreview';

interface KanbanColumnProps {
  status: DeliveryStatus;
  cards: DeliveryCardWithCustomers[];
}

export default function KanbanColumn({ status, cards }: KanbanColumnProps) {
  const colorClasses: Record<DeliveryStatus, string> = {
    draft: 'bg-slate-50 border-slate-200',
    driver_needed: 'bg-amber-50 border-amber-200',
    driver_booked: 'bg-blue-50 border-blue-200',
    loaded: 'bg-green-50 border-green-200',
  };

  return (
    <div className={cn('flex flex-col rounded-xl border min-w-[280px] w-72', colorClasses[status])}>
      <div className="p-3 border-b border-inherit">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-slate-700">{statusLabel(status)}</h3>
          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', statusColor(status))}>
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
              snapshot.isDraggingOver && 'bg-blue-50/50'
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
