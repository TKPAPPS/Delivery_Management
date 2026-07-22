'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CustomerDirectory } from '@/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToastStore } from '@/store/toastStore';
import { BookUser, Plus, Edit, RefreshCw, Trash2, Search, ChevronLeft, ChevronRight, X } from 'lucide-react';

const EMPTY_FORM = { name: '', email: '', contact_number: '', full_address: '', default_delivery_location: '', notes: '' };
const PAGE_SIZE = 25;

export default function AdminCustomersPage() {
  const addToast = useToastStore((s) => s.addToast);
  const [customers, setCustomers] = useState<CustomerDirectory[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<CustomerDirectory | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<CustomerDirectory | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      [c.name, c.email, c.contact_number, c.default_delivery_location, c.full_address]
        .some((v) => (v ?? '').toLowerCase().includes(q)),
    );
  }, [customers, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const onSearch = (v: string) => { setSearch(v); setPage(1); };

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/customer-directory?all=true');
      const data = await res.json();
      setCustomers(data.customers ?? []);
    } catch {
      addToast('Failed to load customers', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCustomers(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => {
    setEditCustomer(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (c: CustomerDirectory) => {
    setEditCustomer(c);
    setForm({
      name: c.name,
      email: c.email ?? '',
      contact_number: c.contact_number ?? '',
      full_address: c.full_address ?? '',
      default_delivery_location: c.default_delivery_location ?? '',
      notes: c.notes ?? '',
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { addToast('Name is required', 'error'); return; }
    setSaving(true);
    try {
      const url = editCustomer ? `/api/customer-directory/${editCustomer.id}` : '/api/customer-directory';
      const method = editCustomer ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Failed to save');
      addToast(editCustomer ? 'Customer updated' : 'Customer created', 'success');
      setModalOpen(false);
      fetchCustomers();
    } catch {
      addToast('Failed to save customer', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c: CustomerDirectory) => {
    try {
      const res = await fetch(`/api/customer-directory/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !c.active }),
      });
      if (!res.ok) throw new Error();
      setCustomers((prev) => prev.map((x) => (x.id === c.id ? { ...x, active: !c.active } : x)));
      addToast('Customer updated', 'success');
    } catch {
      addToast('Failed to update customer', 'error');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/customer-directory/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setCustomers((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      addToast('Customer deleted', 'success');
      setDeleteTarget(null);
    } catch {
      addToast('Failed to delete customer', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const f = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BookUser className="w-5 h-5 text-slate-700" />
          <h1 className="text-xl font-bold text-black">Customer Directory</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={fetchCustomers} loading={loading}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" /> Add Customer
          </Button>
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search by name, email, phone, or location..."
          className="w-full pl-9 pr-9 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-crimson-500 focus:border-transparent"
        />
        {search && (
          <button onClick={() => onSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label="Clear search">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading...</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Email</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden md:table-cell">Contact</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden md:table-cell">Delivery Location</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginated.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{c.name}</p>
                    {c.full_address && <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[200px]">{c.full_address}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.email ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{c.contact_number ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{c.default_delivery_location ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={c.active ? 'success' : 'gray'}>{c.active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                        <Edit className="w-3.5 h-3.5" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => toggleActive(c)}>
                        {c.active ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(c)} className="text-red-600 hover:bg-red-50">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              {search ? `No customers match "${search}"` : 'No customers yet'}
            </div>
          )}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between mt-4 text-sm text-slate-600">
          <span>
            {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
            {search && ` (filtered from ${customers.length})`}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-slate-500">Page {currentPage} of {totalPages}</span>
              <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editCustomer ? 'Edit Customer' : 'Add Customer'} size="sm">
        <form onSubmit={handleSave} className="space-y-3">
          <Input label="Name *" value={form.name} onChange={f('name')} placeholder="Customer name" />
          <Input label="Email" type="text" value={form.email} onChange={f('email')} placeholder="email(s) — separate multiple with commas" />
          <Input label="Contact Number" value={form.contact_number} onChange={f('contact_number')} placeholder="+66 XX XXXX XXXX" />
          <Input label="Default Delivery Location" value={form.default_delivery_location} onChange={f('default_delivery_location')} placeholder="e.g. Patong, Phuket" />
          <Textarea label="Full Address" value={form.full_address} onChange={f('full_address')} rows={2} placeholder="Full address..." />
          <Textarea label="Notes" value={form.notes} onChange={f('notes')} rows={2} placeholder="Optional notes..." />
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" loading={saving}>{editCustomer ? 'Save Changes' : 'Add Customer'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete customer"
        message={`Delete "${deleteTarget?.name ?? ''}"? This removes it from the directory. Existing deliveries keep their saved details, and a future Odoo order will recreate it fresh.`}
        confirmLabel="Delete"
        loading={deleting}
      />
    </div>
  );
}
