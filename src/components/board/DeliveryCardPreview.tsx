import { cn, formatDate } from '@/lib/utils';
import type { DeliveryCardWithCustomers } from '@/types';
import Tooltip from '@/components/ui/Tooltip';
import { MessageSquare, Paperclip, Truck, Mail, Plane, Package, AlertTriangle, PackageOpen, Clock } from 'lucide-react';
import type { DeliveryMethod } from '@/types';

const METHOD_ICONS: Record<DeliveryMethod, React.ElementType> = {
  car: Truck,
  post: Mail,
  air: Plane,
  other: Package,
};
import Link from 'next/link';

interface DeliveryCardPreviewProps {
  card: DeliveryCardWithCustomers;
  dragging?: boolean;
}

export default function DeliveryCardPreview({ card, dragging }: DeliveryCardPreviewProps) {
  const allSOs = card.customers.flatMap((c) => c.sale_orders.map((so) => so.sale_order_number));
  const hasPartial = card.customers.some((c) => c.partial_shipment);
  const method = card.delivery_method ?? 'car';
  const MethodIcon = METHOD_ICONS[method as DeliveryMethod];
  const driverName = card.driver?.name ?? card.driver_name_manual ?? null;
  const logisticsLine = (() => {
    if (method === 'car') return driverName;
    if (method === 'post') return card.courier_company_name ?? card.tracking_number ?? null;
    if (method === 'air') return card.cargo_company_name ?? card.flight_number ?? null;
    if (method === 'other') return card.other_method_name ?? null;
    return null;
  })();
  // Order customers by loading priority (1 loads first); unprioritised go last.
  const sortedCustomers = [...card.customers].sort((a, b) => {
    const ap = a.loading_priority ?? Infinity;
    const bp = b.loading_priority ?? Infinity;
    if (ap !== bp) return ap - bp;
    return a.sort_order - b.sort_order;
  });

  const daysWaiting =
    card.status === 'pending_booking' && card.status_changed_at
      ? Math.floor((Date.now() - new Date(card.status_changed_at).getTime()) / 86_400_000)
      : 0;
  const isStuck = daysWaiting >= 2;

  return (
    <Link href={`/cards/${card.id}`}>
      <div
        className={cn(
          // Reserve a 4px left accent on every card so they align; colour it only when meaningful.
          'bg-white rounded-lg border border-slate-200 border-l-4 border-l-transparent p-3 cursor-pointer hover:border-crimson-300 transition-all',
          dragging && 'shadow-lg rotate-1 border-crimson-400',
          card.priority === 'urgent' && 'border-l-crimson-700',
          isStuck && card.priority !== 'urgent' && 'border-l-amber-400'
        )}
      >
        {/* Top row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="font-mono text-xs text-crimson-700">{card.delivery_ref}</span>
          <div className="flex items-center gap-1 flex-shrink-0">
            {card.priority === 'urgent' && (
              <Tooltip label="Urgent priority" focusable={false} side="bottom">
                <span className="inline-flex items-center gap-1 bg-crimson-100 text-crimson-700 text-xs px-1.5 py-0.5 rounded-full font-medium">
                  <AlertTriangle className="w-3 h-3" />
                  Urgent
                </span>
              </Tooltip>
            )}
            {card.shipping_type && (
              <Tooltip label={`Shipping: ${card.shipping_type}`} focusable={false} side="bottom">
                <span className={cn(
                  'inline-flex items-center text-xs px-1.5 py-0.5 rounded-full font-medium',
                  card.shipping_type === 'Frozen' && 'bg-blue-100 text-blue-700',
                  card.shipping_type === 'Chilled' && 'bg-cyan-100 text-cyan-700',
                  card.shipping_type === 'Dry' && 'bg-amber-100 text-amber-700',
                )}>
                  {card.shipping_type}
                </span>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Destination */}
        <p className="font-bold text-slate-900 text-sm mb-1 line-clamp-2">{card.destination}</p>

        {/* Planned date */}
        {card.planned_date && (
          <p className="text-xs text-slate-500 mb-2">{formatDate(card.planned_date)}</p>
        )}

        {/* Customers (with per-customer loading priority) */}
        {sortedCustomers.length > 0 && (
          <div className="mb-2">
            {sortedCustomers.slice(0, 2).map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded mr-1 mb-1"
              >
                {c.loading_priority != null && (
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-crimson-600 text-white text-[10px] font-semibold">
                    {c.loading_priority}
                  </span>
                )}
                {c.customer_name}
              </span>
            ))}
            {sortedCustomers.length > 2 && (
              <span className="text-xs text-slate-400">+{sortedCustomers.length - 2} more</span>
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

        {/* Logistics line */}
        {logisticsLine && (
          <Tooltip label={`Delivery method: ${method}`} focusable={false} className="mb-2 max-w-full">
            <span className="flex items-center gap-1 text-xs text-gold-700">
              <MethodIcon className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{logisticsLine}</span>
            </span>
          </Tooltip>
        )}

        {/* Latest comment */}
        {card._latest_comment?.body && (
          <div className="flex items-start gap-1.5 mb-2 rounded-md bg-amber-50 border border-amber-100 px-2 py-1.5">
            <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-600" />
            <span className="text-xs text-slate-700 whitespace-pre-wrap break-words line-clamp-3">{card._latest_comment.body}</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-3">
            {(card._count?.comments ?? 0) > 0 && (
              <Tooltip label={`${card._count?.comments} comment${card._count?.comments === 1 ? '' : 's'}`} focusable={false}>
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <MessageSquare className="w-3 h-3" />
                  {card._count?.comments}
                </span>
              </Tooltip>
            )}
            {(card._count?.attachments ?? 0) > 0 && (
              <Tooltip label={`${card._count?.attachments} attachment${card._count?.attachments === 1 ? '' : 's'}`} focusable={false}>
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Paperclip className="w-3 h-3" />
                  {card._count?.attachments}
                </span>
              </Tooltip>
            )}
            {hasPartial && (
              <Tooltip label="One or more customers have a partial shipment" focusable={false}>
                <span className="flex items-center gap-1 text-xs text-amber-600">
                  <PackageOpen className="w-3 h-3" />
                  Partial
                </span>
              </Tooltip>
            )}
            {isStuck && (
              <Tooltip label={`Waiting ${daysWaiting} days for booking`} focusable={false}>
                <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                  <Clock className="w-3 h-3" />
                  {daysWaiting}d waiting
                </span>
              </Tooltip>
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
