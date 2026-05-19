'use client';

import { useEffect, useState } from 'react';
import type { CargoCompany } from '@/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { useToastStore } from '@/store/toastStore';
import { Plane, Plus, Edit, RefreshCw } from 'lucide-react';

export default function CargoCompaniesPage() {
  const addToast = useToastStore((s) => s.addToast);
  const [companies, setCompanies] = useState<CargoCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<CargoCompany | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');

  const fetch_ = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cargo-companies');
      const data = await res.json();
      setCompanies(data.companies ?? []);
    } catch { addToast('Failed to load', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch_(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => { setEditItem(null); setName(''); setModalOpen(true); };
  const openEdit = (c: CargoCompany) => { setEditItem(c); setName(c.name); setModalOpen(true); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { addToast('Name required', 'error'); return; }
    setSaving(true);
    try {
      const url = editItem ? `/api/cargo-companies/${editItem.id}` : '/api/cargo-companies';
      const method = editItem ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      if (!res.ok) throw new Error();
      addToast(editItem ? 'Updated' : 'Created', 'success');
      setModalOpen(false);
      fetch_();
    } catch { addToast('Failed to save', 'error'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (c: CargoCompany) => {
    try {
      await fetch(`/api/cargo-companies/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !c.active }) });
      setCompanies(prev => prev.map(x => x.id === c.id ? { ...x, active: !c.active } : x));
      addToast('Updated', 'success');
    } catch { addToast('Failed', 'error'); }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Plane className="w-5 h-5 text-slate-700" />
          <h1 className="text-xl font-bold text-black">Cargo Companies</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={fetch_} loading={loading}><RefreshCw className="w-4 h-4" /></Button>
          <Button onClick={openCreate}><Plus className="w-4 h-4" /> Add Cargo Co.</Button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Name</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
              <th className="text-right px-4 py-3 font-semibold text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {companies.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                <td className="px-4 py-3"><Badge variant={c.active ? 'success' : 'gray'}>{c.active ? 'Active' : 'Inactive'}</Badge></td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Edit className="w-3.5 h-3.5" /> Edit</Button>
                    <Button size="sm" variant="outline" onClick={() => toggleActive(c)}>{c.active ? 'Deactivate' : 'Activate'}</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && companies.length === 0 && <div className="text-center py-12 text-slate-400">No cargo companies yet</div>}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'Edit Cargo Company' : 'Add Cargo Company'} size="sm">
        <form onSubmit={handleSave} className="space-y-3">
          <Input label="Name *" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Thai Airways Cargo" />
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" loading={saving}>{editItem ? 'Save Changes' : 'Add Cargo Co.'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
