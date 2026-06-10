'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import CustomerPicker from '@/components/cards/CustomerPicker';
import { Plus, X, Trash2 } from 'lucide-react';
import { useToastStore } from '@/store/toastStore';

interface AddCustomerFormProps {
  cardId: string;
  onAdded: () => void;
  onCancel: () => void;
}

export default function AddCustomerForm({ cardId, onAdded, onCancel }: AddCustomerFormProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    customer_name: '',
    customer_directory_id: null as string | null,
    customer_email: '',
    receive_auto_emails: true,
    delivery_location: '',
    notes: '',
  });
  const [saleOrders, setSaleOrders] = useState<string[]>(['']);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer_name.trim()) {
      addToast('Customer name is required', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/cards/${cardId}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          sale_orders: saleOrders.filter((so) => so.trim()),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to add customer');
      }
      addToast('Customer added', 'success');
      onAdded();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to add customer', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border border-blue-200 bg-blue-50 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">Add Customer</p>
        <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-600">
          <X className="w-4 h-4" />
        </button>
      </div>
      <CustomerPicker
        name={form.customer_name}
        deliveryLocation={form.delivery_location}
        onChangeName={(v) => setForm((f) => ({ ...f, customer_name: v }))}
        onChangeDeliveryLocation={(v) => setForm((f) => ({ ...f, delivery_location: v }))}
        onSelectEntry={(entry) => setForm((f) => ({
          ...f,
          customer_directory_id: entry?.id ?? null,
          customer_email: entry?.email ?? '',
        }))}
      />
      <Input
        type="email"
        placeholder="Customer email (for automatic status emails)"
        value={form.customer_email}
        onChange={(e) => setForm((f) => ({ ...f, customer_email: e.target.value }))}
      />
      <label className="flex items-center gap-2 text-xs text-slate-600 select-none">
        <input
          type="checkbox"
          checked={form.receive_auto_emails}
          onChange={(e) => setForm((f) => ({ ...f, receive_auto_emails: e.target.checked }))}
          className="rounded border-slate-300 text-crimson-600 focus:ring-crimson-500"
        />
        Send automatic status emails to this customer
      </label>
      <Textarea
        placeholder="Notes"
        value={form.notes}
        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        rows={2}
      />
      <div className="space-y-1">
        <p className="text-xs text-slate-500">Sale Orders</p>
        {saleOrders.map((so, i) => (
          <div key={i} className="flex gap-2">
            <Input
              placeholder="SO-XXXX"
              value={so}
              onChange={(e) =>
                setSaleOrders((prev) => prev.map((s, si) => (si === i ? e.target.value : s)))
              }
              className="flex-1"
            />
            {saleOrders.length > 1 && (
              <button
                type="button"
                onClick={() => setSaleOrders((prev) => prev.filter((_, si) => si !== i))}
                className="text-slate-400 hover:text-red-500"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setSaleOrders((prev) => [...prev, ''])}
        >
          <Plus className="w-3 h-3" /> Add SO
        </Button>
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={loading}>
          Add Customer
        </Button>
      </div>
    </form>
  );
}
