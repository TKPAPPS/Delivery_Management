import { cn, formatDate, statusColor, statusLabel } from '@/lib/utils';
import type { DeliveryCardWithCustomers } from '@/types';
import { MessageSquare, Paperclip, User, AlertTriangle, PackageOpen } from 'lucide-react';
import Link from 'next/link';

interface DeliveryCardPreviewProps {
  card: DeliveryCardWithCustomers;
  dragging?: boolean;
}

export default function DeliveryCardPreview({ card, dragging }: DeliveryCardPreviewProps) {
  const allSOs = card.customers.flatMap((c) => c.sale_orders.map((so) => so.sale_order_number));
  const hasPartial = card.customers.some((c) => c.partial_shipment);
  const driverName = card.driver?.name ?? card.driver_name_manual ?? null;
  const customerNames = card.customers.map((c) => c.customer_name);

  return (
    <Link href={`/cards/${card.id}`}>
      <div
        className={cn(
          'bg-white rounded-lg border border-slate-200 p-3 cursor-pointer hover:border-blue-300 transition-all',
          dragging && 'shadow-lg rotate-1 border-blue-400',
          card.priority === 'urgent' && 'border-l-4 border-l-red-400'
        )}
      >
        {/* Top row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="font-mono text-xs text-slate-400">{card.delivery_ref}</span>
          {card.priority === 'urgent' && (
            <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
              <AlertTriangle className="w-3 h-3" />
              Urgent
            </span>
          )}
        </div>

        {/* Destination */}
        <p className="font-semibold text-slate-900 text-sm mb-1 line-clamp-2">{card.destination}</p>

        {/* Planned date */}
        {card.planned_date && (
          <p className="text-xs text-slate-500 mb-2">{formatDate(card.planned_date)}</p>
        )}

        {/* Customers */}
        {customerNames.length > 0 && (
          <div className="mb-2">
            {customerNames.slice(0, 2).map((name, i) => (
              <span
                key={i}
                className="inline-block bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded mr-1 mb-1"
              >
                {name}
              </span>
            ))}
            {customerNames.length > 2 && (
              <span className="text-xs text-slate-400">+{customerNames.length - 2} more</span>
            )}
          </div>
        )}

        {/* SO refs */}
        {allSOs.length > 0 && (
          <div className="mb-2">
            {allSOs.slice(0, 2).map((so, i) => (
              <span
                key={i}
                className="inline-block bg-blue-50 text-blue-700 text-xs px-1.5 py-0.5 rounded mr-1 mb-1 font-mono"
              >
                {so}
              </span>
            ))}
            {allSOs.length > 2 && (
              <span className="text-xs text-slate-400">+{allSOs.length - 2} more</span>
            )}
          </div>
        )}

        {/* Driver */}
        {driverName && (
          <div className="flex items-center gap-1 text-xs text-slate-500 mb-2">
            <User className="w-3 h-3" />
            <span className="truncate">{driverName}</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-3">
            {(card._count?.comments ?? 0) > 0 && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <MessageSquare className="w-3 h-3" />
                {card._count?.comments}
              </span>
            )}
            {(card._count?.attachments ?? 0) > 0 && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Paperclip className="w-3 h-3" />
                {card._count?.attachments}
              </span>
            )}
            {hasPartial && (
              <span className="flex items-center gap-1 text-xs text-amber-600">
                <PackageOpen className="w-3 h-3" />
                Partial
              </span>
            )}
          </div>
          {card.creator && (
            <span className="text-xs text-slate-400 truncate max-w-[80px]">
              {card.creator.name ?? card.creator.email}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
