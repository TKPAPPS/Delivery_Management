import type { ActivityLog, Profile } from '@/types';
import { timeAgo } from '@/lib/utils';
import { History } from 'lucide-react';

interface ActivityLogWithProfile extends ActivityLog {
  profile: Pick<Profile, 'id' | 'name' | 'email'> | null;
}

interface ActivityLogSectionProps {
  logs: ActivityLogWithProfile[];
}

function actionLabel(action: string, metadata: Record<string, unknown> | null): string {
  const meta = metadata ?? {};
  switch (action) {
    case 'card_created': return 'Created this card';
    case 'status_changed':
      return `Status changed: ${meta.from ?? '?'} → ${meta.to ?? '?'}`;
    case 'priority_changed':
      return `Priority changed to ${meta.priority ?? '?'}`;
    case 'customer_added':
      return `Added customer: ${meta.customer_name ?? '?'}`;
    case 'customer_removed':
      return `Removed customer: ${meta.customer_name ?? '?'}`;
    case 'customer_unloaded':
      return `Unloaded customer: ${meta.customer_name ?? '?'}`;
    case 'customer_moved':
      return `Moved customer to another card`;
    case 'driver_updated':
      return `Updated driver details`;
    case 'attachment_added':
      return `Uploaded attachment: ${meta.file_name ?? '?'}`;
    case 'attachment_removed':
      return `Removed attachment: ${meta.file_name ?? '?'}`;
    case 'partial_shipment_marked':
      return `Marked partial shipment for ${meta.customer_name ?? '?'}`;
    case 'comment_added':
      return 'Added a comment';
    case 'card_archived':
      return 'Archived this card';
    case 'card_updated':
      return 'Updated card details';
    case 'sale_order_added':
      return `Added SO: ${meta.sale_order_number ?? '?'}`;
    case 'sale_order_removed':
      return `Removed SO: ${meta.sale_order_number ?? '?'}`;
    case 'extra_item_added':
      return `Added extra item: ${meta.item_name ?? '?'}`;
    case 'extra_item_removed':
      return `Removed extra item: ${meta.item_name ?? '?'}`;
    default:
      return action.replace(/_/g, ' ');
  }
}

export default function ActivityLogSection({ logs }: ActivityLogSectionProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <History className="w-4 h-4 text-slate-500" />
        <h3 className="font-semibold text-slate-900 text-sm">Activity Log</h3>
      </div>

      {logs.length === 0 ? (
        <p className="text-sm text-slate-400 italic">No activity yet</p>
      ) : (
        <div className="space-y-3">
          {[...logs].reverse().map((log) => (
            <div key={log.id} className="flex gap-3 text-sm">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 mt-0.5">
                {(log.profile?.name ?? log.profile?.email ?? '?').charAt(0).toUpperCase()}
              </div>
              <div>
                <span className="font-medium text-slate-700">
                  {log.profile?.name ?? log.profile?.email ?? 'System'}
                </span>{' '}
                <span className="text-slate-600">{actionLabel(log.action, log.metadata)}</span>
                <span className="text-xs text-slate-400 ml-2">{timeAgo(log.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
