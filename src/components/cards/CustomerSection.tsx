'use client';

import { useState } from 'react';
import type { CustomerWithRelations, DeliveryCard } from '@/types';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import PartialShipmentModal from './PartialShipmentModal';
import UnloadCustomerModal from './UnloadCustomerModal';
import { useToastStore } from '@/store/toastStore';
import {
  ChevronDown,
  ChevronUp,
  Trash2,
  PackageOpen,
  Truck,
  Plus,
  X,
  Pencil,
  Check,
  MailX,
} from 'lucide-react';
import Input from '@/components/ui/Input';
import Tooltip from '@/components/ui/Tooltip';

interface CustomerSectionProps {
  customers: CustomerWithRelations[];
  card: DeliveryCard;
  activeCards: Array<Pick<DeliveryCard, 'id' | 'delivery_ref' | 'destination'>>;
  onRefresh: () => void;
}

export default function CustomerSection({ customers, card, activeCards, onRefresh }: CustomerSectionProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [expanded, setExpanded] = useState<string | null>(customers[0]?.id ?? null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [partialId, setPartialId] = useState<string | null>(null);
  const [unloadId, setUnloadId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addingSOFor, setAddingSOFor] = useState<string | null>(null);
  const [newSO, setNewSO] = useState('');
  const [addingItemFor, setAddingItemFor] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({ item_name: '', quantity: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState({ customer_name: '', customer_email: '', receive_auto_emails: true, delivery_location: '', notes: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeletingId(deleteId);
    try {
      const res = await fetch(`/api/customers/${deleteId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete customer');
      addToast('Customer removed', 'success');
      onRefresh();
    } catch {
      addToast('Failed to remove customer', 'error');
    } finally {
      setDeletingId(null);
      setDeleteId(null);
    }
  };

  const handleAddSO = async (customerId: string) => {
    if (!newSO.trim()) return;
    try {
      const res = await fetch(`/api/customers/${customerId}/sale-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sale_order_number: newSO.trim() }),
      });
      if (!res.ok) throw new Error('Failed to add SO');
      setNewSO('');
      setAddingSOFor(null);
      addToast('Sale order added', 'success');
      onRefresh();
    } catch {
      addToast('Failed to add sale order', 'error');
    }
  };

  const handleDeleteSO = async (soId: string) => {
    try {
      const res = await fetch(`/api/sale-orders/${soId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete SO');
      addToast('Sale order removed', 'success');
      onRefresh();
    } catch {
      addToast('Failed to remove sale order', 'error');
    }
  };

  const handleAddItem = async (customerId: string) => {
    if (!newItem.item_name.trim()) return;
    try {
      const res = await fetch(`/api/customers/${customerId}/extra-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem),
      });
      if (!res.ok) throw new Error('Failed to add item');
      setNewItem({ item_name: '', quantity: '' });
      setAddingItemFor(null);
      addToast('Item added', 'success');
      onRefresh();
    } catch {
      addToast('Failed to add item', 'error');
    }
  };

  const openEdit = (cust: CustomerWithRelations) => {
    setEditFields({
      customer_name: cust.customer_name,
      customer_email: cust.customer_email ?? '',
      receive_auto_emails: cust.receive_auto_emails ?? true,
      delivery_location: cust.delivery_location ?? '',
      notes: cust.notes ?? '',
    });
    setEditingId(cust.id);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editFields.customer_name.trim()) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/customers/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: editFields.customer_name.trim(),
          customer_email: editFields.customer_email.trim() || null,
          receive_auto_emails: editFields.receive_auto_emails,
          delivery_location: editFields.delivery_location.trim() || null,
          notes: editFields.notes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to update customer');
      addToast('Customer updated', 'success');
      setEditingId(null);
      onRefresh();
    } catch {
      addToast('Failed to update customer', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      const res = await fetch(`/api/extra-items/${itemId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete item');
      addToast('Item removed', 'success');
      onRefresh();
    } catch {
      addToast('Failed to remove item', 'error');
    }
  };

  const selectedCustomer = customers.find((c) => c.id === (partialId ?? unloadId));

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <h3 className="font-semibold text-slate-900 text-sm mb-3">Customers ({customers.length})</h3>

      <div className="space-y-2">
        {customers.map((cust) => (
          <div key={cust.id} className="border border-slate-200 rounded-lg overflow-hidden">
            {editingId === cust.id ? (
              <div className="px-3 py-2.5 space-y-2 bg-slate-50">
                <Input
                  label="Customer Name"
                  value={editFields.customer_name}
                  onChange={(e) => setEditFields((f) => ({ ...f, customer_name: e.target.value }))}
                />
                <Input
                  label="Customer Email"
                  type="email"
                  value={editFields.customer_email}
                  onChange={(e) => setEditFields((f) => ({ ...f, customer_email: e.target.value }))}
                  placeholder="customer@email.com — for automatic status emails"
                />
                <label className="flex items-center gap-2 text-xs text-slate-600 select-none">
                  <input
                    type="checkbox"
                    checked={editFields.receive_auto_emails}
                    onChange={(e) => setEditFields((f) => ({ ...f, receive_auto_emails: e.target.checked }))}
                    className="rounded border-slate-300 text-crimson-600 focus:ring-crimson-500"
                  />
                  Send automatic status emails to this customer
                </label>
                <Input
                  label="Delivery Location"
                  value={editFields.delivery_location}
                  onChange={(e) => setEditFields((f) => ({ ...f, delivery_location: e.target.value }))}
                  placeholder="Building, floor, contact…"
                />
                <Input
                  label="Notes"
                  value={editFields.notes}
                  onChange={(e) => setEditFields((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes"
                />
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={handleSaveEdit} loading={savingEdit} disabled={!editFields.customer_name.trim()}>
                    <Check className="w-3.5 h-3.5" /> Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={savingEdit}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-slate-50"
                onClick={() => setExpanded((e) => (e === cust.id ? null : cust.id))}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-sm text-slate-900 truncate">{cust.customer_name}</span>
                  {cust.partial_shipment && (
                    <Badge variant="warning">Partial</Badge>
                  )}
                  {!cust.customer_email && (
                    <Tooltip
                      label="No email on file — this customer won't receive automatic status updates. Add one via Edit."
                      className="flex-shrink-0"
                    >
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                        <MailX className="w-3.5 h-3.5" /> no email
                      </span>
                    </Tooltip>
                  )}
                  {cust.sale_orders.length > 0 && (
                    <span className="text-xs text-slate-400">
                      {cust.sale_orders.length} SO
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); openEdit(cust); }}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {expanded === cust.id ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </div>
            )}

            {editingId !== cust.id && expanded === cust.id && (
              <div className="px-3 pb-3 border-t border-slate-100 pt-3 space-y-3">
                {cust.delivery_location && (
                  <p className="text-sm text-slate-600">
                    <span className="font-medium">Location:</span> {cust.delivery_location}
                  </p>
                )}
                {cust.notes && (
                  <p className="text-sm text-slate-600">
                    <span className="font-medium">Notes:</span> {cust.notes}
                  </p>
                )}
                {cust.partial_shipment && cust.partial_shipment_note && (
                  <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-800">
                    <strong>Partial note:</strong> {cust.partial_shipment_note}
                  </div>
                )}

                {/* Sale orders */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Sale Orders</p>
                    <button
                      className="text-xs text-blue-600 hover:underline"
                      onClick={() => setAddingSOFor(addingSOFor === cust.id ? null : cust.id)}
                    >
                      + Add SO
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-1">
                    {cust.sale_orders.map((so) => (
                      <span
                        key={so.id}
                        className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded font-mono"
                      >
                        {so.sale_order_number}
                        <button onClick={() => handleDeleteSO(so.id)} className="hover:text-red-500 ml-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    {cust.sale_orders.length === 0 && (
                      <span className="text-xs text-slate-400">No SOs</span>
                    )}
                  </div>
                  {addingSOFor === cust.id && (
                    <div className="flex gap-2 mt-1">
                      <Input
                        placeholder="SO-XXXX"
                        value={newSO}
                        onChange={(e) => setNewSO(e.target.value)}
                        className="flex-1 text-xs"
                      />
                      <Button size="sm" onClick={() => handleAddSO(cust.id)}>Add</Button>
                      <Button size="sm" variant="ghost" onClick={() => setAddingSOFor(null)}>Cancel</Button>
                    </div>
                  )}
                </div>

                {/* Extra items */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Extra Items</p>
                    <button
                      className="text-xs text-blue-600 hover:underline"
                      onClick={() => setAddingItemFor(addingItemFor === cust.id ? null : cust.id)}
                    >
                      + Add Item
                    </button>
                  </div>
                  <div className="space-y-1 mb-1">
                    {cust.extra_items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-xs text-slate-700 bg-slate-50 px-2 py-1 rounded">
                        <span>{item.item_name}{item.quantity ? ` (${item.quantity})` : ''}</span>
                        <button onClick={() => handleDeleteItem(item.id)} className="text-slate-400 hover:text-red-500 ml-2">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {cust.extra_items.length === 0 && (
                      <span className="text-xs text-slate-400">No extra items</span>
                    )}
                  </div>
                  {addingItemFor === cust.id && (
                    <div className="flex gap-2 mt-1">
                      <Input
                        placeholder="Item name"
                        value={newItem.item_name}
                        onChange={(e) => setNewItem((i) => ({ ...i, item_name: e.target.value }))}
                        className="flex-1 text-xs"
                      />
                      <Input
                        placeholder="Qty"
                        value={newItem.quantity}
                        onChange={(e) => setNewItem((i) => ({ ...i, quantity: e.target.value }))}
                        className="w-20 text-xs"
                      />
                      <Button size="sm" onClick={() => handleAddItem(cust.id)}>Add</Button>
                      <Button size="sm" variant="ghost" onClick={() => setAddingItemFor(null)}>Cancel</Button>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-100">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPartialId(cust.id)}
                  >
                    <PackageOpen className="w-3.5 h-3.5" />
                    {cust.partial_shipment ? 'Update Partial' : 'Mark Partial'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setUnloadId(cust.id)}
                  >
                    <Truck className="w-3.5 h-3.5" />
                    Unload / Move
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteId(cust.id)}
                    className="text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Partial Shipment Modal */}
      {partialId && (
        <PartialShipmentModal
          open={!!partialId}
          onClose={() => setPartialId(null)}
          customerId={partialId}
          customerName={customers.find((c) => c.id === partialId)?.customer_name ?? ''}
          currentNote={customers.find((c) => c.id === partialId)?.partial_shipment_note ?? null}
          onUpdated={onRefresh}
        />
      )}

      {/* Unload Modal */}
      {unloadId && (
        <UnloadCustomerModal
          open={!!unloadId}
          onClose={() => setUnloadId(null)}
          customerId={unloadId}
          customerName={customers.find((c) => c.id === unloadId)?.customer_name ?? ''}
          activeCards={activeCards.filter((c) => c.id !== card.id)}
          onDone={onRefresh}
        />
      )}

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Remove Customer"
        message="Are you sure you want to remove this customer from the delivery card? This cannot be undone."
        loading={!!deletingId}
      />
    </div>
  );
}
