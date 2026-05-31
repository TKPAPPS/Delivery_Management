'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, X, Truck, ExternalLink } from 'lucide-react';
import Button from '@/components/ui/Button';
import CreateOrderModal from '@/components/orders/CreateOrderModal';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useDebouncedCallback } from '@/lib/useDebouncedCallback';
import { useToastStore } from '@/store/toastStore';
import { formatDate, orderPriorityLabel, orderPriorityColor, orderStatusLabel, orderStatusColor } from '@/lib/utils';
import type { OrderListItem } from '@/types';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active (unassigned)' },
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'partial', label: 'Partial' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

// Statuses considered "handled" — hidden under the default Active view.
const HANDLED_STATUSES = ['assigned', 'completed', 'cancelled'];

const PRIORITY_OPTIONS = [
  { value: '', label: 'All priorities' },
  { value: '5', label: '5 – Critical' },
  { value: '4', label: '4 – High' },
  { value: '3', label: '3 – Medium' },
  { value: '2', label: '2 – Low' },
  { value: '1', label: '1 – Lowest' },
];

const SOURCE_OPTIONS = [
  { value: '', label: 'All sources' },
  { value: 'manual', label: 'Manual' },
  { value: 'odoo', label: 'Odoo' },
];

function resolveCustomer(order: OrderListItem): string {
  return (order.customer as { name?: string } | null)?.name ?? order.customer_name_manual ?? '—';
}

function resolveDestination(order: OrderListItem): string {
  return (order.destination as { name?: string } | null)?.name ?? order.destination_manual ?? '—';
}

interface Props {
  initialOrders: OrderListItem[];
  role: string;
}

export default function OrdersPoolClient({ initialOrders, role }: Props) {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderListItem[]>(initialOrders);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creatingDelivery, setCreatingDelivery] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');

  const canWrite = ['admin', 'sales'].includes(role);
  const canDispatch = ['admin', 'sales', 'logistics'].includes(role);
  const addToast = useToastStore((s) => s.addToast);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/orders');
      if (!res.ok) throw new Error('Request failed');
      const d = await res.json();
      setOrders(d.orders ?? []);
    } catch {
      addToast('Failed to refresh orders', 'error');
    }
  }, [addToast]);

  // Live sync: refetch when any order changes. Debounced so a bulk Odoo sync
  // (hundreds of row events) collapses into a single refetch.
  const scheduleRefetch = useDebouncedCallback(() => { void fetchOrders(); });
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel('orders-pool-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, scheduleRefetch)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [scheduleRefetch]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = orders.filter((o) => {
      if (statusFilter === 'active') {
        if (HANDLED_STATUSES.includes(o.status)) return false;
      } else if (statusFilter && o.status !== statusFilter) return false;
      if (priorityFilter && String(o.priority) !== priorityFilter) return false;
      if (sourceFilter && o.source !== sourceFilter) return false;
      if (q) {
        const customer = resolveCustomer(o).toLowerCase();
        const destination = resolveDestination(o).toLowerCase();
        if (
          !o.order_ref.toLowerCase().includes(q) &&
          !customer.includes(q) &&
          !destination.includes(q) &&
          !(o.notes ?? '').toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
    // Sort to match what the table shows: priority first, then the displayed
    // date column (order_date, falling back to created_at), newest first.
    return matched.sort((a, b) =>
      b.priority - a.priority ||
      (b.order_date ?? b.created_at).localeCompare(a.order_date ?? a.created_at)
    );
  }, [orders, search, statusFilter, priorityFilter, sourceFilter]);

  const clearFilters = () => { setSearch(''); setStatusFilter('active'); setPriorityFilter(''); setSourceFilter(''); };
  const hasFilters = !!(search || statusFilter !== 'active' || priorityFilter || sourceFilter);

  // An order can be turned into a delivery only if not already assigned and not terminal.
  const isDispatchable = (o: OrderListItem) => !o.delivery_card_id && o.status !== 'completed' && o.status !== 'cancelled';

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const createDelivery = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setCreatingDelivery(true);
    try {
      const res = await fetch('/api/deliveries/from-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_ids: ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create delivery');
      const n = data.assigned?.length ?? ids.length;
      const skippedNote = data.skipped?.length ? `, ${data.skipped.length} skipped` : '';
      addToast(`Delivery created from ${n} order${n > 1 ? 's' : ''}${skippedNote}`, 'success');
      setSelected(new Set());
      router.push(`/cards/${data.card_id}`);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to create delivery', 'error');
      setCreatingDelivery(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Orders Pool</h1>
          <p className="text-sm text-slate-500 mt-0.5">{filtered.length} order{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        {canWrite && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" /> New Order
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ref, customer, destination…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {hasFilters && (
          <button onClick={clearFilters} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 px-2">
            <X className="w-4 h-4" /> Clear
          </button>
        )}
      </div>

      {/* Selection action bar */}
      {canDispatch && selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 mb-4 px-4 py-3 bg-crimson-50 border border-crimson-200 rounded-lg">
          <p className="text-sm text-crimson-800 font-medium">
            {selected.size} order{selected.size > 1 ? 's' : ''} selected
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelected(new Set())} className="text-sm text-slate-600 hover:text-slate-800 px-2">
              Clear
            </button>
            <Button size="sm" onClick={createDelivery} loading={creatingDelivery}>
              <Truck className="w-4 h-4" /> Create Delivery
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          {hasFilters ? 'No orders match the current filters.' : 'No orders yet. Create your first order.'}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {canDispatch && <th className="w-10 px-4 py-3" />}
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Ref</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Destination</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Priority</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Lines</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Order Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                  {canDispatch && (
                    <td className="px-4 py-3">
                      {isDispatchable(order) ? (
                        <input
                          type="checkbox"
                          checked={selected.has(order.id)}
                          onChange={() => toggleSelected(order.id)}
                          className="rounded border-slate-300 text-crimson-600 focus:ring-crimson-500"
                          aria-label={`Select ${order.order_ref}`}
                        />
                      ) : null}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <Link href={`/orders/${order.id}`} className="font-mono text-xs font-medium text-crimson-700 hover:underline">
                      {order.order_ref}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-800">{resolveCustomer(order)}</td>
                  <td className="px-4 py-3 text-slate-600">{resolveDestination(order)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${orderPriorityColor(order.priority)}`}>
                      {order.priority} – {orderPriorityLabel(order.priority)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${orderStatusColor(order.status)}`}>
                        {orderStatusLabel(order.status)}
                      </span>
                      {order.delivery_card_id && (
                        <Link
                          href={`/cards/${order.delivery_card_id}`}
                          title="View delivery"
                          className="text-crimson-700 hover:text-crimson-800"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{order._count.lines}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(order.order_date ?? order.created_at, 'Asia/Bangkok')}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">
                      {order.source}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canWrite && (
        <CreateOrderModal open={createOpen} onClose={() => { setCreateOpen(false); fetchOrders(); }} />
      )}
    </div>
  );
}
