'use client';

import { useEffect, useState } from 'react';
import type { Destination } from '@/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { useToastStore } from '@/store/toastStore';
import { Settings, MapPin, Plus, Edit, RefreshCw } from 'lucide-react';

export default function AdminSettingsPage() {
  const addToast = useToastStore((s) => s.addToast);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editDest, setEditDest] = useState<Destination | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');

  const fetchDestinations = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/destinations?all=true');
      const data = await res.json();
      setDestinations(data.destinations ?? []);
    } catch {
      addToast('Failed to load destinations', 'error');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchDestinations(); }, []);

  const openCreate = () => {
    setEditDest(null);
    setName('');
    setModalOpen(true);
  };

  const openEdit = (dest: Destination) => {
    setEditDest(dest);
    setName(dest.name);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { addToast('Name is required', 'error'); return; }
    setSaving(true);
    try {
      const url = editDest ? `/api/destinations/${editDest.id}` : '/api/destinations';
      const method = editDest ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error('Failed to save');
      addToast(editDest ? 'Destination updated' : 'Destination added', 'success');
      setModalOpen(false);
      fetchDestinations();
    } catch {
      addToast('Failed to save destination', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (dest: Destination) => {
    try {
      const res = await fetch(`/api/destinations/${dest.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !dest.active }),
      });
      if (!res.ok) throw new Error();
      setDestinations((prev) =>
        prev.map((d) => (d.id === dest.id ? { ...d, active: !dest.active } : d))
      );
      addToast('Destination updated', 'success');
    } catch {
      addToast('Failed to update destination', 'error');
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Settings className="w-5 h-5 text-slate-700" />
        <h1 className="text-xl font-bold text-black">Settings</h1>
      </div>

      {/* Destinations section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-slate-500" />
            <h2 className="text-base font-semibold text-slate-800">Destinations</h2>
            <span className="text-xs text-slate-400">Selectable when creating a delivery card</span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={fetchDestinations} loading={loading}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="w-4 h-4" /> Add
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-10 text-slate-400">Loading...</div>
        ) : (
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
                {destinations.map((dest) => (
                  <tr key={dest.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{dest.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={dest.active ? 'success' : 'gray'}>
                        {dest.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(dest)}>
                          <Edit className="w-3.5 h-3.5" /> Edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => toggleActive(dest)}>
                          {dest.active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {destinations.length === 0 && (
              <div className="text-center py-12 text-slate-400">No destinations yet</div>
            )}
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editDest ? 'Edit Destination' : 'Add Destination'}
        size="sm"
      >
        <form onSubmit={handleSave} className="space-y-3">
          <Input
            label="Name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Bangkok Warehouse A"
            autoFocus
          />
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editDest ? 'Save Changes' : 'Add Destination'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
