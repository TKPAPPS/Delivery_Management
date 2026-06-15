'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import DatePicker from '@/components/ui/DatePicker';
import DestinationInput from '@/components/ui/DestinationInput';
import CustomerPicker from '@/components/cards/CustomerPicker';
import type { CustomerDirectory } from '@/types';
import { useToastStore } from '@/store/toastStore';
import { Plus, Trash2 } from 'lucide-react';

interface InlineCustomer {
  customer_name: string;
  customer_directory_id: string | null;
  customer_email: string;
  receive_auto_emails: boolean;
  delivery_location: string;
  loading_priority: string;
  sale_orders: string[];
}

interface CreateCardModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const EMPTY_FORM = { destination: '', status: 'draft', planned_date: '', priority: 'normal', single_customer_lock: false, internal_notes: '', delivery_method: 'car', delivery_type: '' };
const EMPTY_CUSTOMER: InlineCustomer = { customer_name: '', customer_directory_id: null, customer_email: '', receive_auto_emails: true, delivery_location: '', loading_priority: '', sale_orders: [''] };

export default function CreateCardModal({ open, onClose, onCreated }: CreateCardModalProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [customers, setCustomers] = useState<InlineCustomer[]>([{ ...EMPTY_CUSTOMER }]);
  const [customerDirectory, setCustomerDirectory] = useState<CustomerDirectory[]>([]);

  useEffect(() => {
    fetch('/api/customer-directory')
      .then((r) => r.json())
      .then((d) => setCustomerDirectory(d.customers ?? []))
      .catch(() => {});
  }, []);

  const reset = () => { setForm(EMPTY_FORM); setCustomers([{ ...EMPTY_CUSTOMER }]); };
  const handleClose = () => { reset(); onClose(); };

  const addCustomer = () => {
    setCustomers((prev) => [...prev, { ...EMPTY_CUSTOMER }]);
  };

  const removeCustomer = (i: number) => {
    setCustomers((prev) => prev.filter((_, idx) => idx !== i));
  };

  const patchCustomer = (i: number, patch: Partial<InlineCustomer>) => {
    setCustomers((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c))
    );
  };

  const addSO = (i: number) => {
    setCustomers((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, sale_orders: [...c.sale_orders, ''] } : c))
    );
  };

  const updateSO = (ci: number, si: number, value: string) => {
    setCustomers((prev) =>
      prev.map((c, idx) =>
        idx === ci
          ? { ...c, sale_orders: c.sale_orders.map((so, si2) => (si2 === si ? value : so)) }
          : c
      )
    );
  };

  const removeSO = (ci: number, si: number) => {
    setCustomers((prev) =>
      prev.map((c, idx) =>
        idx === ci ? { ...c, sale_orders: c.sale_orders.filter((_, si2) => si2 !== si) } : c
      )
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.destination.trim()) {
      addToast('Destination is required', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          customers: customers
            .filter((c) => c.customer_name.trim())
            .map((c) => ({ ...c, loading_priority: c.loading_priority ? Number(c.loading_priority) : null })),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to create card');
      }
      addToast('Delivery card created', 'success');
      onCreated();
      handleClose();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Error creating card', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="New Delivery Card" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <DestinationInput
          label="Destination *"
          value={form.destination}
          onChange={(v) => setForm((f) => ({ ...f, destination: v }))}
          required
        />
        <Select
          label="Delivery Method"
          value={form.delivery_method}
          onChange={(e) => setForm((f) => ({
            ...f,
            delivery_method: e.target.value,
            // Delivery Type (motorcycle) only applies to the "other" method — clear it otherwise.
            delivery_type: e.target.value === 'other' ? f.delivery_type : '',
          }))}
          options={[
            { value: 'car', label: 'Car / Truck' },
            { value: 'post', label: 'Post / Courier' },
            { value: 'air', label: 'Air Freight' },
            { value: 'other', label: 'Other' },
          ]}
        />
        {form.delivery_method === 'other' && (
          <Select
            label="Delivery Type"
            value={form.delivery_type}
            onChange={(e) => setForm((f) => ({ ...f, delivery_type: e.target.value }))}
            options={[
              { value: '', label: '— Not specified —' },
              { value: 'our_motorcycle', label: 'Our motorcycle' },
              { value: 'company_motorcycle', label: 'Delivery company motorcycle' },
            ]}
          />
        )}
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Status"
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            options={[
              { value: 'draft', label: 'Draft' },
              { value: 'pending_booking', label: 'Pending Booking' },
            ]}
          />
          <Select
            label="Priority"
            value={form.priority}
            onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'urgent', label: 'Urgent' },
            ]}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.single_customer_lock}
            onChange={(e) => setForm((f) => ({ ...f, single_customer_lock: e.target.checked }))}
            className="rounded border-slate-300 text-crimson-600 focus:ring-crimson-500"
          />
          Lock to a single customer (no additional customers can be added)
        </label>
        <DatePicker
          label="Planned Date"
          value={form.planned_date}
          onChange={(e) => setForm((f) => ({ ...f, planned_date: e.target.value }))}
        />
        <Textarea
          label="Internal Notes"
          value={form.internal_notes}
          onChange={(e) => setForm((f) => ({ ...f, internal_notes: e.target.value }))}
          placeholder="Optional notes..."
          rows={2}
        />

        {/* Customers */}
        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">Customers</p>
          {customers.map((cust, ci) => (
            <div key={ci} className="border border-slate-200 rounded-lg p-3 mb-3 space-y-2">
              <div className="flex justify-between items-start">
                <p className="text-xs font-semibold text-slate-600">Customer {ci + 1}</p>
                <button
                  type="button"
                  onClick={() => removeCustomer(ci)}
                  className="text-slate-400 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <CustomerPicker
                name={cust.customer_name}
                deliveryLocation={cust.delivery_location}
                onChangeName={(v) => patchCustomer(ci, { customer_name: v })}
                onChangeDeliveryLocation={(v) => patchCustomer(ci, { delivery_location: v })}
                onSelectEntry={(entry) =>
                  patchCustomer(ci, {
                    customer_directory_id: entry?.id ?? null,
                    customer_email: entry?.email ?? '',
                  })
                }
                directory={customerDirectory}
              />
              <Input
                type="text"
                placeholder="Customer email(s) — separate multiple with commas"
                value={cust.customer_email}
                onChange={(e) => patchCustomer(ci, { customer_email: e.target.value })}
              />
              <Input
                type="number"
                min={1}
                max={10}
                placeholder="Loading priority (1–10) — optional"
                value={cust.loading_priority}
                onChange={(e) => patchCustomer(ci, { loading_priority: e.target.value })}
              />
              <label className="flex items-center gap-2 text-xs text-slate-600 select-none">
                <input
                  type="checkbox"
                  checked={cust.receive_auto_emails}
                  onChange={(e) => patchCustomer(ci, { receive_auto_emails: e.target.checked })}
                  className="rounded border-slate-300 text-crimson-600 focus:ring-crimson-500"
                />
                Send automatic status emails to this customer
              </label>
              <div className="space-y-1">
                <p className="text-xs text-slate-500">Sale Orders</p>
                {cust.sale_orders.map((so, si) => (
                  <div key={si} className="flex gap-2">
                    <Input
                      placeholder="SO-XXXX"
                      value={so}
                      onChange={(e) => updateSO(ci, si, e.target.value)}
                      className="flex-1"
                    />
                    {cust.sale_orders.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSO(ci, si)}
                        className="text-slate-400 hover:text-red-500 px-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="ghost" size="sm" onClick={() => addSO(ci)}>
                  <Plus className="w-3 h-3" /> Add SO
                </Button>
              </div>
            </div>
          ))}
          {!(form.single_customer_lock && customers.length >= 1) && (
            <Button type="button" variant="outline" size="sm" onClick={addCustomer} className="mt-1">
              <Plus className="w-3 h-3" /> Add Another
            </Button>
          )}
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            Create Card
          </Button>
        </div>
      </form>
    </Modal>
  );
}
