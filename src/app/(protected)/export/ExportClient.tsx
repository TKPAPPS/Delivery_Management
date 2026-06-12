'use client';

import { useMemo, useState } from 'react';
import type { DeliveryCardWithCustomers, DeliveryStatus } from '@/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import EmptyState from '@/components/ui/EmptyState';
import { useToastStore } from '@/store/toastStore';
import { formatDate, statusLabel, statusColor } from '@/lib/utils';
import { exportCardsToXlsx } from '@/lib/export-cards';
import { Download, FileSpreadsheet } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_booking', label: 'Pending Booking' },
  { value: 'booked', label: 'Booked' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'archived', label: 'Archived' },
];

export default function ExportClient({ cards }: { cards: DeliveryCardWithCustomers[] }) {
  const addToast = useToastStore((s) => s.addToast);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards.filter((c) => {
      if (statusFilter === 'archived') {
        if (!c.is_archived) return false;
      } else if (statusFilter !== 'all') {
        if (c.status !== (statusFilter as DeliveryStatus)) return false;
      }
      if (!q) return true;
      const haystack = [
        c.delivery_ref,
        c.destination,
        ...c.customers.map((cu) => cu.customer_name),
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [cards, statusFilter, search]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filtered.forEach((c) => next.delete(c.id));
      } else {
        filtered.forEach((c) => next.add(c.id));
      }
      return next;
    });

  const handleExport = async () => {
    const chosen = cards.filter((c) => selected.has(c.id));
    if (chosen.length === 0) return;
    setExporting(true);
    try {
      await exportCardsToXlsx(chosen);
      addToast(`Exported ${chosen.length} card${chosen.length === 1 ? '' : 's'}`, 'success');
    } catch {
      addToast('Failed to export', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <FileSpreadsheet className="w-5 h-5 text-slate-700" />
        <h1 className="text-xl font-bold text-black">Export Cards</h1>
        <span className="text-xs text-slate-400">Pick any cards, any status, and download as Excel</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="w-48">
          <Select label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} options={STATUS_OPTIONS} />
        </div>
        <div className="flex-1 min-w-[200px]">
          <Input label="Search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ref, destination, or customer" />
        </div>
      </div>

      {/* Selection bar */}
      <div className="flex items-center justify-between gap-3 mb-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg">
        <p className="text-sm text-slate-700">
          <span className="font-medium">{selected.size}</span> selected
          <span className="text-slate-400"> · {filtered.length} shown</span>
        </p>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button onClick={() => setSelected(new Set())} className="text-sm text-slate-600 hover:text-slate-800 px-2">
              Clear
            </button>
          )}
          <Button size="sm" onClick={handleExport} loading={exporting} disabled={selected.size === 0}>
            <Download className="w-4 h-4" /> Export selected (.xlsx)
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={FileSpreadsheet} title="No cards match" description="Adjust the status filter or search." />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleAll}
                    className="rounded border-slate-300 text-crimson-600 focus:ring-crimson-500"
                    aria-label="Select all shown"
                  />
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Ref</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Destination</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Planned</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Customers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className="hover:bg-slate-50 cursor-pointer"
                  onClick={() => toggle(c.id)}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                      className="rounded border-slate-300 text-crimson-600 focus:ring-crimson-500"
                      aria-label={`Select ${c.delivery_ref}`}
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-crimson-700">{c.delivery_ref}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(c.status)}`}>
                      {statusLabel(c.status)}{c.is_archived ? ' · Archived' : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-800">{c.destination}</td>
                  <td className="px-4 py-3 text-slate-600">{c.planned_date ? formatDate(c.planned_date) : '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{c.customers.map((cu) => cu.customer_name).join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
