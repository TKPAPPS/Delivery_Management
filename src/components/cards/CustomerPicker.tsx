'use client';

import { useEffect, useState } from 'react';
import type { CustomerDirectory } from '@/types';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Textarea from '@/components/ui/Textarea';
import { useToastStore } from '@/store/toastStore';
import { UserPlus } from 'lucide-react';

interface CustomerPickerProps {
  name: string;
  deliveryLocation: string;
  onChangeName: (val: string) => void;
  onChangeDeliveryLocation: (val: string) => void;
  namePlaceholder?: string;
  locationPlaceholder?: string;
}

const EMPTY_FORM = { name: '', contact_number: '', full_address: '', default_delivery_location: '', notes: '' };

export default function CustomerPicker({
  name,
  deliveryLocation,
  onChangeName,
  onChangeDeliveryLocation,
  namePlaceholder = 'Customer name *',
  locationPlaceholder = 'Delivery location',
}: CustomerPickerProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [directory, setDirectory] = useState<CustomerDirectory[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    fetch('/api/customer-directory')
      .then((r) => r.json())
      .then((d) => setDirectory(d.customers ?? []))
      .catch(() => {});
  }, []);

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (!id) { onChangeName(''); onChangeDeliveryLocation(''); return; }
    if (id === '__manual__') { onChangeName(''); onChangeDeliveryLocation(''); return; }
    const found = directory.find((c) => c.id === id);
    if (found) {
      onChangeName(found.name);
      onChangeDeliveryLocation(found.default_delivery_location ?? '');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { addToast('Name is required', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/customer-directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Failed to create');
      const data = await res.json();
      const created: CustomerDirectory = data.customer;
      setDirectory((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      onChangeName(created.name);
      onChangeDeliveryLocation(created.default_delivery_location ?? '');
      addToast('Customer saved to directory', 'success');
      setCreateOpen(false);
      setForm(EMPTY_FORM);
    } catch {
      addToast('Failed to create customer', 'error');
    } finally {
      setSaving(false);
    }
  };

  const selectedId = directory.find((c) => c.name === name)?.id ?? '';

  const f = (key: keyof typeof EMPTY_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <>
      <div className="space-y-2">
        {/* Directory select */}
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-600 mb-1">Select from directory</label>
            <select
              value={selectedId}
              onChange={handleSelect}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-crimson-500 bg-white"
            >
              <option value="">— pick a customer —</option>
              {directory.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.default_delivery_location ? ` (${c.default_delivery_location})` : ''}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1 text-xs text-crimson-700 border border-crimson-200 rounded-lg px-2.5 py-2 hover:bg-crimson-50 transition-colors flex-shrink-0"
            title="Create new customer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            New
          </button>
        </div>

        {/* Name input — only shown when typing manually (no directory selection) */}
        {!selectedId && (
          <Input
            placeholder={namePlaceholder}
            value={name}
            onChange={(e) => onChangeName(e.target.value)}
          />
        )}

        {/* Delivery location */}
        <Input
          placeholder={locationPlaceholder}
          value={deliveryLocation}
          onChange={(e) => onChangeDeliveryLocation(e.target.value)}
        />
      </div>

      {/* Create customer modal */}
      <Modal open={createOpen} onClose={() => { setCreateOpen(false); setForm(EMPTY_FORM); }} title="New Customer" size="sm">
        <form onSubmit={handleCreate} className="space-y-3">
          <Input label="Name *" value={form.name} onChange={f('name')} placeholder="Customer name" />
          <Input label="Contact Number" value={form.contact_number} onChange={f('contact_number')} placeholder="+66 XX XXXX XXXX" />
          <Input label="Default Delivery Location" value={form.default_delivery_location} onChange={f('default_delivery_location')} placeholder="e.g. Patong, Phuket" />
          <Textarea label="Full Address" value={form.full_address} onChange={f('full_address')} rows={2} placeholder="Full address..." />
          <Textarea label="Notes" value={form.notes} onChange={f('notes')} rows={2} placeholder="Optional..." />
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" loading={saving}>Save Customer</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
