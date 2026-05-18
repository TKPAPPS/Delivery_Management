'use client';

import { useEffect, useState } from 'react';
import type { Driver } from '@/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { useToastStore } from '@/store/toastStore';
import { Truck, Plus, Edit, RefreshCw } from 'lucide-react';

export default function AdminDriversPage() {
  const addToast = useToastStore((s) => s.addToast);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editDriver, setEditDriver] = useState<Driver | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    vehicle_type: '',
    license_plate: '',
    notes: '',
  });

  const fetchDrivers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/drivers');
      const data = await res.json();
      setDrivers(data.drivers ?? []);
    } catch {
      addToast('Failed to load drivers', 'error');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchDrivers(); }, []);

  const openCreate = () => {
    setEditDriver(null);
    setForm({ name: '', phone: '', vehicle_type: '', license_plate: '', notes: '' });
    setModalOpen(true);
  };

  const openEdit = (driver: Driver) => {
    setEditDriver(driver);
    setForm({
      name: driver.name,
      phone: driver.phone ?? '',
      vehicle_type: driver.vehicle_type ?? '',
      license_plate: driver.license_plate ?? '',
      notes: driver.notes ?? '',
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      addToast('Driver name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const url = editDriver ? `/api/drivers/${editDriver.id}` : '/api/drivers';
      const method = editDriver ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Failed to save driver');
      addToast(editDriver ? 'Driver updated' : 'Driver created', 'success');
      setModalOpen(false);
      fetchDrivers();
    } catch {
      addToast('Failed to save driver', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (driver: Driver) => {
    try {
      const res = await fetch(`/api/drivers/${driver.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !driver.active }),
      });
      if (!res.ok) throw new Error('Failed to update driver');
      setDrivers((prev) =>
        prev.map((d) => (d.id === driver.id ? { ...d, active: !driver.active } : d))
      );
      addToast('Driver updated', 'success');
    } catch {
      addToast('Failed to update driver', 'error');
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Truck className="w-5 h-5 text-slate-500" />
          <h1 className="text-xl font-bold text-slate-900">Drivers</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={fetchDrivers} loading={loading}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" /> Add Driver
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading drivers...</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden sm:table-cell">Phone</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden md:table-cell">Vehicle</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {drivers.map((driver) => (
                <tr key={driver.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{driver.name}</td>
                  <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">{driver.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 hidden md:table-cell">
                    {[driver.vehicle_type, driver.license_plate].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={driver.active ? 'success' : 'gray'}>
                      {driver.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(driver)}>
                        <Edit className="w-3.5 h-3.5" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleActive(driver)}
                      >
                        {driver.active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {drivers.length === 0 && (
            <div className="text-center py-12 text-slate-400">No drivers yet</div>
          )}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editDriver ? 'Edit Driver' : 'Add Driver'}
        size="sm"
      >
        <form onSubmit={handleSave} className="space-y-3">
          <Input
            label="Name *"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Driver's full name"
          />
          <Input
            label="Phone"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="+66 XX XXXX XXXX"
          />
          <Input
            label="Vehicle Type"
            value={form.vehicle_type}
            onChange={(e) => setForm((f) => ({ ...f, vehicle_type: e.target.value }))}
            placeholder="e.g. 6-wheel truck"
          />
          <Input
            label="License Plate"
            value={form.license_plate}
            onChange={(e) => setForm((f) => ({ ...f, license_plate: e.target.value }))}
            placeholder="กข-1234"
          />
          <Textarea
            label="Notes"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
          />
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editDriver ? 'Save Changes' : 'Add Driver'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
