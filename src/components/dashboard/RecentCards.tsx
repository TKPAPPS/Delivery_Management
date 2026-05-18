import { formatDate, statusColor, statusLabel, timeAgo } from '@/lib/utils';
import type { DeliveryCard } from '@/types';
import Link from 'next/link';
import Badge from '../ui/Badge';
import { cn } from '@/lib/utils';

interface RecentCardsProps {
  cards: DeliveryCard[];
  title?: string;
}

export default function RecentCards({ cards, title = 'Recent Cards' }: RecentCardsProps) {
  if (cards.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">{title}</h3>
        <p className="text-sm text-slate-400 text-center py-4">No cards</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h3 className="text-sm font-semibold text-slate-900 mb-4">{title}</h3>
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
              <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', statusColor(card.status))}>
                {statusLabel(card.status)}
              </span>
              <span className="text-xs text-slate-400 hidden sm:block">{timeAgo(card.updated_at)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
