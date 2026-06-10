'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, X, Truck, ExternalLink, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import CreateOrderModal from '@/components/orders/CreateOrderModal';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useDebouncedCallback } from '@/lib/useDebouncedCallback';
import Tooltip from '@/components/ui/Tooltip';
import { useToastStore } from '@/store/toastStore';
import { formatDate, orderPriorityLabel, orderPriorityColor, orderStatusLabel, orderStatusColor, displayOrderRef } from '@/lib/utils';
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
  initialTotal: number;
  pageSize: number;
  role: string;
}

export default function OrdersPoolClient({ initialOrders, initialTotal, pageSize, role }: Props) {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderListItem[]>(initialOrders);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creatingDelivery, setCreatingDelivery] = useState(false);

  // Filters (server-side). `search` is the input; `appliedSearch` is the debounced value.
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [page, setPage] = useState(1);

  // Debounce the search box → appliedSearch (and reset to page 1 on change).
  useEffect(() => {
    const t = setTimeout(() => {
      setAppliedSearch((prev) => {
        if (prev !== search) setPage(1);
        return search;
      });
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const canWrite = ['admin', 'sales'].includes(role);
  const isAdmin = role === 'admin';
  const [syncing, setSyncing] = useState(false);

  // Pull fresh orders from Odoo (admin only). Read-only import; refreshes the list on success.
  const syncOdoo = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/sync/odoo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json();
      if (!res.ok) {
        addToast(data.error || 'Odoo sync failed', 'error');
        return;
      }
      addToast(`Odoo sync done: ${data.created_count ?? 0} new, ${data.updated_count ?? 0} updated`, 'success');
      router.refresh();
    } catch {
      addToast('Odoo sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  };
  const canDispatch = ['admin', 'sales', 'logistics'].includes(role);
  const addToast = useToastStore((s) => s.addToast);

  // Server-side fetch of the current page + filters. Single source of truth for the list.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (sourceFilter) params.set('source', sourceFilter);
      if (appliedSearch.trim()) params.set('q', appliedSearch.trim());
      params.set('page', String(page));
      const res = await fetch(`/api/orders?${params.toString()}`);
      if (!res.ok) throw new Error('Request failed');
      const d = await res.json();
      setOrders(d.orders ?? []);
      setTotal(d.total ?? 0);
    } catch {
      addToast('Failed to load orders', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, sourceFilter, appliedSearch, page, addToast]);

  // Refetch whenever filters / search / page change. Skip the first run — the SSR
  // page already provided page 1 of the default view.
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    void load();
  }, [load]);

  // Live sync: refetch the current page when any order changes. Debounced so a bulk
  // Odoo sync (hundreds of row events) collapses into a single refetch.
  const scheduleRefetch = useDebouncedCallback(() => { void load(); });
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel('orders-pool-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, scheduleRefetch)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [scheduleRefetch]);

  // Filter changes reset to page 1.
  const changeStatus = (v: string) => { setStatusFilter(v); setPage(1); };
  const changePriority = (v: string) => { setPriorityFilter(v); setPage(1); };
  const changeSource = (v: string) => { setSourceFilter(v); setPage(1); };
  const clearFilters = () => { setSearch(''); setStatusFilter('active'); setPriorityFilter(''); setSourceFilter(''); setPage(1); };
  const hasFilters = !!(search || statusFilter !== 'active' || priorityFilter || sourceFilter);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo = Math.min(page * pageSize, total);

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
          <p className="text-sm text-slate-500 mt-0.5">{total} order{total !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="outline" onClick={syncOdoo} loading={syncing}>
              <RefreshCw className="w-4 h-4" /> Sync from Odoo
            </Button>
          )}
          {canWrite && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" /> New Order
            </Button>
          )}
        </div>
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
          onChange={(e) => changeStatus(e.target.value)}
          className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => changePriority(e.target.value)}
          className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => changeSource(e.target.value)}
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
      {orders.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          {loading ? 'Loading…' : hasFilters ? 'No orders match the current filters.' : 'No orders yet. Create your first order.'}
        </div>
      ) : (
        <div className={`bg-white border border-slate-200 rounded-xl overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <table className="w-full text-sm min-w-[640px]">
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
              {orders.map((order) => (
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
                      {displayOrderRef(order)}
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
                        <Tooltip label="View delivery card" focusable={false}>
                          <Link
                            href={`/cards/${order.delivery_card_id}`}
                            className="text-crimson-700 hover:text-crimson-800"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        </Tooltip>
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

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-slate-500">
            Showing {rangeFrom}–{rangeTo} of {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="flex items-center gap-1 text-sm border border-slate-300 rounded-lg px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>
            <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="flex items-center gap-1 text-sm border border-slate-300 rounded-lg px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {canWrite && (
        <CreateOrderModal open={createOpen} onClose={() => { setCreateOpen(false); void load(); }} />
      )}
    </div>
  );
}
