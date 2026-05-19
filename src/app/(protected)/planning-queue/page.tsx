'use client';

import { useEffect, useState } from 'react';
import type { PlanningQueueItem, DeliveryStatus } from '@/types';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import DestinationInput from '@/components/ui/DestinationInput';
import { useToastStore } from '@/store/toastStore';
import { ClipboardList, RefreshCw, Trash2, Plus, ArrowRight } from 'lucide-react';
import { formatDate } from '@/lib/utils';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'driver_needed', label: 'Driver Needed' },
];

export default function PlanningQueuePage() {
  const addToast = useToastStore((s) => s.addToast);
  const [items, setItems] = useState<PlanningQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  // Create card modal
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PlanningQueueItem | null>(null);
  const [newDestination, setNewDestination] = useState('');
  const [newStatus, setNewStatus] = useState<DeliveryStatus>('draft');
  const [creating, setCreating] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/planning-queue');
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      addToast('Failed to load planning queue', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchItems(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRemove = async (id: string) => {
    setRemoving(id);
    try {
      const res = await fetch(`/api/planning-queue/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove item');
      setItems((prev) => prev.filter((i) => i.id !== id));
      addToast('Removed from queue', 'success');
    } catch {
      addToast('Failed to remove item', 'error');
    } finally {
      setRemoving(null);
    }
  };

  const openCreateCard = (item: PlanningQueueItem) => {
    setSelectedItem(item);
    setNewDestination(item.destination ?? '');
    setNewStatus('draft');
    setCreateOpen(true);
  };

  const handleCreateCard = async () => {
    if (!selectedItem || !newDestination.trim()) return;
    setCreating(true);
    try {
      // Create the card
      const cardRes = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: newDestination.trim(),
          status: newStatus,
          customers: [{
            customer_name: selectedItem.customer_name,
            delivery_location: selectedItem.delivery_location ?? '',
            notes: selectedItem.notes ?? '',
            sale_orders: selectedItem.sale_order_refs ?? [],
            extra_items: (selectedItem.extra_items ?? []).map((ei) => ({
              item_name: ei.item_name,
              quantity: ei.quantity ?? '',
            })),
          }],
        }),
      });
      if (!cardRes.ok) throw new Error('Failed to create card');

      // Remove from queue
      await fetch(`/api/planning-queue/${selectedItem.id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((i) => i.id !== selectedItem.id));

      addToast('Delivery card created', 'success');
      setCreateOpen(false);
      setSelectedItem(null);
    } catch {
      addToast('Failed to create card', 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-5 h-5 text-slate-700" />
          <div>
            <h1 className="text-xl font-bold text-black">Planning Queue</h1>
            <p className="text-xs text-slate-500 mt-0.5">Customers awaiting assignment to a delivery card</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchItems} loading={loading}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">Queue is empty</p>
          <p className="text-xs mt-1">Customers unloaded from delivery cards will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-semibold text-slate-900">{item.customer_name}</p>
                    {item.reason && (
                      <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                        {item.reason}
                      </span>
                    )}
                  </div>

                  {item.destination && (
                    <p className="text-sm text-slate-600 mb-1">
                      <span className="font-medium">Destination:</span> {item.destination}
                      {item.delivery_location && ` — ${item.delivery_location}`}
                    </p>
                  )}

                  {item.sale_order_refs && item.sale_order_refs.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1">
                      {item.sale_order_refs.map((so, i) => (
                        <span key={i} className="text-xs font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                          {so}
                        </span>
                      ))}
                    </div>
                  )}

                  {item.extra_items && item.extra_items.length > 0 && (
                    <p className="text-xs text-slate-500 mb-1">
                      +{item.extra_items.length} extra item{item.extra_items.length > 1 ? 's' : ''}
                    </p>
                  )}

                  {item.notes && (
                    <p className="text-xs text-slate-500 italic">{item.notes}</p>
                  )}

                  <p className="text-xs text-slate-400 mt-2">Added {formatDate(item.created_at)}</p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openCreateCard(item)}
                    className="text-crimson-700 border-crimson-200 hover:bg-crimson-50"
                  >
                    <Plus className="w-3.5 h-3.5" /> New Card
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemove(item.id)}
                    loading={removing === item.id}
                    className="text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Card Modal */}
      <Modal
        open={createOpen}
        onClose={() => { setCreateOpen(false); setSelectedItem(null); }}
        title="Create Delivery Card"
        size="sm"
      >
        {selectedItem && (
          <>
            <p className="text-sm text-slate-600 mb-4">
              Creating a new card for <span className="font-semibold">{selectedItem.customer_name}</span>.
            </p>
            <div className="space-y-3">
              <DestinationInput
                label="Destination *"
                value={newDestination}
                onChange={(v) => setNewDestination(v)}
                required
              />
              <Select
                label="Initial Status"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as DeliveryStatus)}
                options={STATUS_OPTIONS}
              />
            </div>
            <div className="flex gap-3 justify-end mt-4">
              <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={creating}>
                Cancel
              </Button>
              <Button onClick={handleCreateCard} loading={creating} disabled={!newDestination.trim()}>
                <ArrowRight className="w-4 h-4" /> Create Card
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
