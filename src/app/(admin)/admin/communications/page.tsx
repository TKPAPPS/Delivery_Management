'use client';

import { useEffect, useState } from 'react';
import type { LineGroup } from '@/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToastStore } from '@/store/toastStore';
import { MessageSquare, Plus, Edit, RefreshCw, Info, Trash2 } from 'lucide-react';

const STATUS_TRIGGER_OPTIONS = [
  { value: 'card_created', label: 'Card Created' },
  { value: 'urgent_card_created', label: 'Urgent Card Created' },
  { value: 'pending_booking', label: 'Pending Booking' },
  { value: 'booked', label: 'Booked' },
  { value: 'driver_assigned', label: 'Driver Assigned' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'delivered', label: 'Delivered' },
];

const EMPTY_FORM = { name: '', line_target_id: '', auto_triggers: [] as string[] };

export default function CommunicationsPage() {
  const addToast = useToastStore((s) => s.addToast);
  const [groups, setGroups] = useState<LineGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<LineGroup | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [masterEnabled, setMasterEnabled] = useState(true);
  const [savingMaster, setSavingMaster] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LineGroup | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetch_ = async () => {
    setLoading(true);
    try {
      const [gRes, sRes] = await Promise.all([fetch('/api/line-groups'), fetch('/api/line-settings')]);
      const gData = await gRes.json();
      setGroups(gData.groups ?? []);
      const sData = await sRes.json();
      if (typeof sData.master_enabled === 'boolean') setMasterEnabled(sData.master_enabled);
    } catch { addToast('Failed to load', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch_(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMaster = async () => {
    const next = !masterEnabled;
    setSavingMaster(true);
    setMasterEnabled(next); // optimistic
    try {
      const res = await fetch('/api/line-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ master_enabled: next }),
      });
      if (!res.ok) throw new Error();
      addToast(next ? 'LINE notifications enabled' : 'LINE notifications muted', 'success');
    } catch {
      setMasterEnabled(!next); // revert
      addToast('Failed to update LINE master switch', 'error');
    } finally { setSavingMaster(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/line-groups/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setGroups((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      addToast('Group deleted', 'success');
      setDeleteTarget(null);
    } catch { addToast('Failed to delete group', 'error'); }
    finally { setDeleting(false); }
  };

  const openCreate = () => { setEditItem(null); setForm(EMPTY_FORM); setModalOpen(true); };
  const openEdit = (g: LineGroup) => {
    setEditItem(g);
    setForm({ name: g.name, line_target_id: g.line_target_id ?? '', auto_triggers: g.auto_triggers ?? [] });
    setModalOpen(true);
  };

  const toggleTrigger = (value: string) => {
    setForm(f => ({
      ...f,
      auto_triggers: f.auto_triggers.includes(value)
        ? f.auto_triggers.filter(t => t !== value)
        : [...f.auto_triggers, value],
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { addToast('Name required', 'error'); return; }
    setSaving(true);
    try {
      const url = editItem ? `/api/line-groups/${editItem.id}` : '/api/line-groups';
      const method = editItem ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          line_target_id: form.line_target_id || null,
          auto_triggers: form.auto_triggers,
        }),
      });
      if (!res.ok) throw new Error();
      addToast(editItem ? 'Updated' : 'Created', 'success');
      setModalOpen(false);
      fetch_();
    } catch { addToast('Failed to save', 'error'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (g: LineGroup) => {
    try {
      await fetch(`/api/line-groups/${g.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !g.active }),
      });
      setGroups(prev => prev.map(x => x.id === g.id ? { ...x, active: !g.active } : x));
      addToast('Updated', 'success');
    } catch { addToast('Failed', 'error'); }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-5 h-5 text-slate-700" />
          <h1 className="text-xl font-bold text-black">Communications</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={fetch_} loading={loading}><RefreshCw className="w-4 h-4" /></Button>
          <Button onClick={openCreate}><Plus className="w-4 h-4" /> Add LINE Group</Button>
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-6">Configure LINE groups for push notifications via LINE Messaging API.</p>

      {/* Master switch */}
      <div className={`rounded-xl border p-4 mb-4 flex items-center justify-between gap-4 ${masterEnabled ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-300'}`}>
        <div>
          <p className="font-semibold text-slate-900 text-sm">Automatic LINE notifications</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Master switch for automatic <strong>team</strong> notifications (LINE + its fallback
            email). When off, no automatic team messages are sent, regardless of group settings.
            Does not affect customer emails (Msg Templates) or manual sends from a card.
          </p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer flex-shrink-0">
          <span className={`text-xs font-medium ${masterEnabled ? 'text-emerald-600' : 'text-slate-400'}`}>
            {masterEnabled ? 'On' : 'Off'}
          </span>
          <input
            type="checkbox"
            checked={masterEnabled}
            onChange={toggleMaster}
            disabled={savingMaster}
            className="h-5 w-5 rounded border-slate-300 text-crimson-600 cursor-pointer disabled:opacity-50"
          />
        </label>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-start gap-2 text-xs text-amber-800">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div className="space-y-1">
          <p><strong>How routing works:</strong> each event is sent only to <strong>active</strong> groups that have ticked it below. An event no active group subscribes to is not sent (and the master switch above mutes everything).</p>
          <p><strong>Adding groups:</strong> invite the bot to a LINE group and it auto-appears here (via the <code>/api/line/webhook</code>), or add it manually with its Target ID. Token via <code>LINE_CHANNEL_ID</code>/<code>LINE_CHANNEL_SECRET</code> (or legacy <code>LINE_CHANNEL_ACCESS_TOKEN</code>).</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Group Name</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">LINE Target ID</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden md:table-cell">Auto Triggers</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
              <th className="text-right px-4 py-3 font-semibold text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {groups.map((g) => (
              <tr key={g.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{g.name}</td>
                <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                  {g.line_target_id
                    ? g.line_target_id.slice(0, 6) + '••••' + g.line_target_id.slice(-4)
                    : <span className="text-slate-300">not set</span>}
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  {g.auto_triggers.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {g.auto_triggers.map(t => (
                        <span key={t} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{t}</span>
                      ))}
                    </div>
                  ) : <span className="text-slate-300 text-xs">none</span>}
                </td>
                <td className="px-4 py-3"><Badge variant={g.active ? 'success' : 'gray'}>{g.active ? 'Active' : 'Inactive'}</Badge></td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(g)}><Edit className="w-3.5 h-3.5" /> Edit</Button>
                    <Button size="sm" variant="outline" onClick={() => toggleActive(g)}>{g.active ? 'Deactivate' : 'Activate'}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(g)} className="text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && groups.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No LINE groups configured yet</p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete LINE group"
        message={`Delete "${deleteTarget?.name ?? ''}"? This removes it from notification routing and cannot be undone.`}
        confirmLabel="Delete"
        loading={deleting}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'Edit LINE Group' : 'Add LINE Group'} size="sm">
        <form onSubmit={handleSave} className="space-y-4">
          <Input label="Group Name *" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Driver Dispatch" />
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">LINE Target ID</label>
            <input
              type="password"
              value={form.line_target_id}
              onChange={(e) => setForm(f => ({ ...f, line_target_id: e.target.value }))}
              placeholder="e.g. Ca56f94637c94dbe..."
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-crimson-500 font-mono"
            />
            <p className="text-xs text-slate-400 mt-1">
              The LINE group ID from your Messaging API webhook events. Requires <code>LINE_CHANNEL_ACCESS_TOKEN</code> env var.
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-700 mb-2">Auto-send on status changes</p>
            <div className="space-y-2">
              {STATUS_TRIGGER_OPTIONS.map(opt => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.auto_triggers.includes(opt.value)}
                    onChange={() => toggleTrigger(opt.value)}
                    className="rounded border-slate-300 text-crimson-600"
                  />
                  <span className="text-sm text-slate-700">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" loading={saving}>{editItem ? 'Save Changes' : 'Add Group'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
