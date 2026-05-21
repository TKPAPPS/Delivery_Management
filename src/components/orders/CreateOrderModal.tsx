'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useToastStore } from '@/store/toastStore';
import type { CustomerDirectory, Destination } from '@/types';

interface LineInput {
  product_name: string;
  product_code: string;
  sale_order_number: string;
  qty_ordered: string;
  notes: string;
}

const blankLine = (): LineInput => ({
  product_name: '', product_code: '', sale_order_number: '', qty_ordered: '', notes: '',
});

const PRIORITY_OPTIONS = [
  { value: '5', label: '5 – Critical' },
  { value: '4', label: '4 – High' },
  { value: '3', label: '3 – Medium' },
  { value: '2', label: '2 – Low' },
  { value: '1', label: '1 – Lowest' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CreateOrderModal({ open, onClose }: Props) {
  const router = useRouter();
  const addToast = useToastStore((s) => s.addToast);

  const [customers, setCustomers] = useState<Pick<CustomerDirectory, 'id' | 'name'>[]>([]);
  const [destinations, setDestinations] = useState<Pick<Destination, 'id' | 'name'>[]>([]);

  // Form state
  const [customerMode, setCustomerMode] = useState<'directory' | 'manual'>('directory');
  const [customerId, setCustomerId] = useState('');
  const [customerManual, setCustomerManual] = useState('');
  const [destinationMode, setDestinationMode] = useState<'directory' | 'manual'>('directory');
  const [destinationId, setDestinationId] = useState('');
  const [destinationManual, setDestinationManual] = useState('');
  const [priority, setPriority] = useState('3');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineInput[]>([blankLine()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch('/api/customer-directory').then((r) => r.json()).then((d) => setCustomers(d.customers ?? [])).catch(() => {});
    fetch('/api/destinations').then((r) => r.json()).then((d) => setDestinations(d.destinations ?? [])).catch(() => {});
  }, [open]);

  const reset = useCallback(() => {
    setCustomerMode('directory');
    setCustomerId('');
    setCustomerManual('');
    setDestinationMode('directory');
    setDestinationId('');
    setDestinationManual('');
    setPriority('3');
    setNotes('');
    setLines([blankLine()]);
    setErrors({});
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const updateLine = (i: number, field: keyof LineInput, value: string) => {
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  };

  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    const hasCustomer = customerMode === 'directory' ? !!customerId : !!customerManual.trim();
    if (!hasCustomer) e.customer = 'Customer is required';

    lines.forEach((line, i) => {
      if (!line.product_name.trim()) e[`line_${i}_product_name`] = 'Product name is required';
      const qty = parseInt(line.qty_ordered, 10);
      if (!line.qty_ordered || isNaN(qty) || qty <= 0) e[`line_${i}_qty`] = 'Must be > 0';
    });

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload = {
        customer_id: customerMode === 'directory' ? customerId || null : null,
        customer_name_manual: customerMode === 'manual' ? customerManual.trim() || null : null,
        destination_id: destinationMode === 'directory' ? destinationId || null : null,
        destination_manual: destinationMode === 'manual' ? destinationManual.trim() || null : null,
        priority: parseInt(priority, 10),
        notes: notes.trim() || null,
        lines: lines
          .filter((l) => l.product_name.trim())
          .map((l) => ({
            product_name: l.product_name.trim(),
            product_code: l.product_code.trim() || null,
            sale_order_number: l.sale_order_number.trim() || null,
            qty_ordered: parseInt(l.qty_ordered, 10),
            notes: l.notes.trim() || null,
          })),
      };

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create order');

      addToast('Order created', 'success');
      handleClose();
      router.push(`/orders/${data.order.id}`);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to create order', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="New Manual Order" size="xl">
      <div className="space-y-6">
        {/* Customer */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-slate-700">Customer *</label>
            <button
              type="button"
              className="text-xs text-blue-600 hover:underline"
              onClick={() => { setCustomerMode(customerMode === 'directory' ? 'manual' : 'directory'); setCustomerId(''); setCustomerManual(''); }}
            >
              {customerMode === 'directory' ? 'Enter manually' : 'Pick from directory'}
            </button>
          </div>
          {customerMode === 'directory' ? (
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">— select customer —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : (
            <input
              type="text"
              value={customerManual}
              onChange={(e) => setCustomerManual(e.target.value)}
              placeholder="Customer name"
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
          {errors.customer && <p className="text-xs text-red-600 mt-1">{errors.customer}</p>}
        </div>

        {/* Destination */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-slate-700">Destination</label>
            <button
              type="button"
              className="text-xs text-blue-600 hover:underline"
              onClick={() => { setDestinationMode(destinationMode === 'directory' ? 'manual' : 'directory'); setDestinationId(''); setDestinationManual(''); }}
            >
              {destinationMode === 'directory' ? 'Enter manually' : 'Pick from directory'}
            </button>
          </div>
          {destinationMode === 'directory' ? (
            <select
              value={destinationId}
              onChange={(e) => setDestinationId(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">— select destination —</option>
              {destinations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          ) : (
            <input
              type="text"
              value={destinationManual}
              onChange={(e) => setDestinationManual(e.target.value)}
              placeholder="Destination"
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
        </div>

        {/* Priority + Notes row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes"
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Order Lines */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-slate-700">Order Lines</label>
            <Button variant="secondary" size="sm" onClick={() => setLines((prev) => [...prev, blankLine()])}>
              <Plus className="w-3.5 h-3.5" /> Add Line
            </Button>
          </div>
          <div className="space-y-3">
            {lines.map((line, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-3 space-y-2">
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-5">
                    <Input
                      placeholder="Product name *"
                      value={line.product_name}
                      onChange={(e) => updateLine(i, 'product_name', e.target.value)}
                      error={errors[`line_${i}_product_name`]}
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      placeholder="Product code"
                      value={line.product_code}
                      onChange={(e) => updateLine(i, 'product_code', e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      placeholder="Qty *"
                      min={1}
                      value={line.qty_ordered}
                      onChange={(e) => updateLine(i, 'qty_ordered', e.target.value)}
                      error={errors[`line_${i}_qty`]}
                    />
                  </div>
                  <div className="col-span-2 flex justify-end items-start pt-1">
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(i)}
                        className="text-slate-400 hover:text-red-500 transition-colors p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="SO number"
                    value={line.sale_order_number}
                    onChange={(e) => updateLine(i, 'sale_order_number', e.target.value)}
                  />
                  <Input
                    placeholder="Line notes"
                    value={line.notes}
                    onChange={(e) => updateLine(i, 'notes', e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-2 border-t border-slate-100">
          <Button variant="secondary" onClick={handleClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} loading={submitting}>Create Order</Button>
        </div>
      </div>
    </Modal>
  );
}
