import { formatDate, statusColor, statusLabel } from '@/lib/utils';
import type { DeliveryCard } from '@/types';
import Link from 'next/link';
import Badge from '../ui/Badge';

interface UpcomingDeliveriesProps {
  cards: DeliveryCard[];
}

export default function UpcomingDeliveries({ cards }: UpcomingDeliveriesProps) {
  if (cards.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Upcoming Deliveries (14 days)</h3>
        <p className="text-sm text-slate-400 text-center py-4">No upcoming deliveries</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h3 className="text-sm font-semibold text-slate-900 mb-4">Upcoming Deliveries (14 days)</h3>
      <div className="space-y-3">
        {cards.map((card) => (
          <Link
            key={card.id}
            href={`/cards/${card.id}`}
            className="flex items-center justify-between gap-3 hover:bg-slate-50 rounded-lg px-2 py-1.5 -mx-2 transition-colors"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{card.destination}</p>
              <p className="text-xs text-slate-500 font-mono">{card.delivery_ref}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {card.priority === 'urgent' && (
                <Badge variant="danger">Urgent</Badge>
              )}
              <span className="text-xs text-slate-500">{formatDate(card.planned_date)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
