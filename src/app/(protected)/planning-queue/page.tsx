'use client';

import { useEffect, useState } from 'react';
import type { DeliveryCardWithCustomers } from '@/types';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import DestinationInput from '@/components/ui/DestinationInput';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useDebouncedCallback } from '@/lib/useDebouncedCallback';
import { useToastStore } from '@/store/toastStore';
import { ClipboardList, RefreshCw, Trash2, Plus, ArrowRight, ChevronUp, ChevronDown } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';

/**
 * Planning Queue is a filtered view of DRAFT delivery cards — the same rows that
 * appear as "Draft" on the Dashboard and in the board's Draft column. One source of
 * truth: editing/moving a card anywhere updates it everywhere (kept live via Realtime).
 */
export default function PlanningQueuePage() {
  const addToast = useToastStore((s) => s.addToast);
  const [items, setItems] = useState<DeliveryCardWithCustomers[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Add-to-queue modal
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    customer_name: '',
    destination: '',
    delivery_location: '',
    sale_orders_text: '',
    notes: '',
  });
  const [adding, setAdding] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cards?include_customers=true');
      const data = await res.json();
      const drafts = ((data.cards ?? []) as DeliveryCardWithCustomers[])
        .filter((c) => c.status === 'draft')
        .sort((a, b) => (a.sort_order - b.sort_order) || a.created_at.localeCompare(b.created_at));
      setItems(drafts);
    } catch {
      addToast('Failed to load planning queue', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchItems(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Live sync with board / dashboard / card detail. Debounced to coalesce bursts.
  const scheduleRefetch = useDebouncedCallback(() => { void fetchItems(); });
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel('planning-queue-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_cards' }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_customers' }, scheduleRefetch)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [scheduleRefetch]);

  const handleRemove = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/cards/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setItems((prev) => prev.filter((i) => i.id !== id));
      addToast('Removed from queue', 'success');
    } catch {
      addToast('Failed to remove item', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const sendToBoard = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/cards/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pending_booking' }),
      });
      if (!res.ok) throw new Error();
      setItems((prev) => prev.filter((i) => i.id !== id));
      addToast('Moved to board (Pending Booking)', 'success');
    } catch {
      addToast('Failed to move card', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const moveItem = async (index: number, direction: 'up' | 'down') => {
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= items.length) return;
    const newItems = [...items];
    [newItems[index], newItems[swapIndex]] = [newItems[swapIndex], newItems[index]];
    setItems(newItems);
    await Promise.all(
      newItems.map((item, i) =>
        fetch(`/api/cards/${item.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: i }),
        })
      )
    );
  };

  const handleDirectAdd = async () => {
    if (!addForm.customer_name.trim()) return;
    setAdding(true);
    try {
      const sale_orders = addForm.sale_orders_text
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: addForm.destination.trim() || 'Unassigned',
          status: 'draft',
          customers: [{
            customer_name: addForm.customer_name.trim(),
            delivery_location: addForm.delivery_location.trim() || null,
            notes: addForm.notes.trim() || null,
            sale_orders,
          }],
        }),
      });
      if (!res.ok) throw new Error();
      addToast('Added to queue', 'success');
      setAddOpen(false);
      setAddForm({ customer_name: '', destination: '', delivery_location: '', sale_orders_text: '', notes: '' });
      fetchItems();
    } catch {
      addToast('Failed to add to queue', 'error');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-5 h-5 text-slate-700" />
          <div>
            <h1 className="text-xl font-bold text-black">Planning Queue</h1>
            <p className="text-xs text-slate-500 mt-0.5">Draft deliveries awaiting booking — synced with the Dashboard &amp; Board</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={fetchItems} loading={loading}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4" /> Add to Queue
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">Queue is empty</p>
          <p className="text-xs mt-1">Add customers directly or unload them from delivery cards</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => {
            const customerNames = item.customers.map((c) => c.customer_name);
            const sos = item.customers.flatMap((c) => c.sale_orders.map((so) => so.sale_order_number));
            return (
              <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-0.5 flex-shrink-0 pt-0.5">
                    <button onClick={() => moveItem(index, 'up')} disabled={index === 0} className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-0">
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button onClick={() => moveItem(index, 'down')} disabled={index === items.length - 1} className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-0">
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Link href={`/cards/${item.id}`} className="font-semibold text-slate-900 hover:text-crimson-700 truncate">
                        {customerNames.length > 0 ? customerNames.join(', ') : item.destination}
                      </Link>
                      <span className="text-xs font-mono text-crimson-700">{item.delivery_ref}</span>
                    </div>
                    {item.destination && item.destination !== 'Unassigned' && (
                      <p className="text-sm text-slate-600 mb-1"><span className="font-medium">Destination:</span> {item.destination}</p>
                    )}
                    {sos.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1">
                        {sos.map((so, i) => (
                          <span key={i} className="text-xs font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{so}</span>
                        ))}
                      </div>
                    )}
                    {item.internal_notes && <p className="text-xs text-slate-500 italic">{item.internal_notes}</p>}
                    <p className="text-xs text-slate-400 mt-2">Added {formatDate(item.created_at)}</p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button size="sm" variant="outline" onClick={() => sendToBoard(item.id)} loading={busyId === item.id}>
                      <ArrowRight className="w-3.5 h-3.5" /> To Board
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleRemove(item.id)} loading={busyId === item.id} className="text-red-500 hover:bg-red-50">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add to Queue Modal */}
      <Modal
        open={addOpen}
        onClose={() => { setAddOpen(false); setAddForm({ customer_name: '', destination: '', delivery_location: '', sale_orders_text: '', notes: '' }); }}
        title="Add to Planning Queue"
        size="sm"
      >
        <div className="space-y-3">
          <Input
            label="Customer Name *"
            value={addForm.customer_name}
            onChange={(e) => setAddForm((f) => ({ ...f, customer_name: e.target.value }))}
            placeholder="Customer name"
          />
          <DestinationInput
            label="Destination"
            value={addForm.destination}
            onChange={(v) => setAddForm((f) => ({ ...f, destination: v }))}
          />
          <Input
            label="Delivery Location"
            value={addForm.delivery_location}
            onChange={(e) => setAddForm((f) => ({ ...f, delivery_location: e.target.value }))}
            placeholder="Building, floor, contact…"
          />
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Sale Orders</label>
            <textarea
              value={addForm.sale_orders_text}
              onChange={(e) => setAddForm((f) => ({ ...f, sale_orders_text: e.target.value }))}
              rows={3}
              placeholder="One SO number per line&#10;SO-1234&#10;SO-5678"
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-crimson-500 resize-none"
            />
          </div>
          <Input
            label="Notes"
            value={addForm.notes}
            onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Optional notes"
          />
        </div>
        <div className="flex gap-3 justify-end mt-4">
          <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={adding}>Cancel</Button>
          <Button onClick={handleDirectAdd} loading={adding} disabled={!addForm.customer_name.trim()}>
            <Plus className="w-4 h-4" /> Add to Queue
          </Button>
        </div>
      </Modal>
    </div>
  );
}
