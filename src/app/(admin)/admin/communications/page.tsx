'use client';

import { useEffect, useState } from 'react';
import type { LineGroup } from '@/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToastStore } from '@/store/toastStore';
import { MessageSquare, Plus, Edit, RefreshCw, Info, Trash2, Send, CheckCircle, XCircle, MinusCircle } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

interface NotificationEventRow {
  id: string;
  type: string;
  status: 'sent' | 'failed' | 'skipped' | 'pending';
  error: string | null;
  created_at: string;
}
interface LineConfig { line_configured: boolean; email_configured: boolean; default_target_set: boolean; }

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
  const [config, setConfig] = useState<LineConfig | null>(null);
  const [events, setEvents] = useState<NotificationEventRow[]>([]);
  const [testing, setTesting] = useState(false);

  const fetch_ = async () => {
    setLoading(true);
    try {
      const [gRes, sRes, nRes] = await Promise.all([
        fetch('/api/line-groups'),
        fetch('/api/line-settings'),
        fetch('/api/notifications'),
      ]);
      const gData = await gRes.json();
      setGroups(gData.groups ?? []);
      const sData = await sRes.json();
      if (typeof sData.master_enabled === 'boolean') setMasterEnabled(sData.master_enabled);
      setConfig({
        line_configured: !!sData.line_configured,
        email_configured: !!sData.email_configured,
        default_target_set: !!sData.default_target_set,
      });
      const nData = await nRes.json();
      setEvents(nData.events ?? []);
    } catch { addToast('Failed to load', 'error'); }
    finally { setLoading(false); }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const res = await fetch('/api/line-settings/test', { method: 'POST' });
      const data = await res.json();
      if (data.ok) addToast('Test message sent to the default LINE group', 'success');
      else addToast(data.error || 'Test failed', 'error');
      fetch_();
    } catch { addToast('Test failed', 'error'); }
    finally { setTesting(false); }
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

      {/* Connection status + test */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 mb-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {config && (
            <>
              <ConfigChip ok={config.line_configured} label="LINE token" />
              <ConfigChip ok={config.default_target_set} label="Default group" />
              <ConfigChip ok={config.email_configured} label="Fallback email" />
            </>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={sendTest}
          loading={testing}
          disabled={!config?.line_configured || !config?.default_target_set}
        >
          <Send className="w-3.5 h-3.5" /> Send test
        </Button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-start gap-2 text-xs text-amber-800">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div className="space-y-1">
          <p><strong>How routing works:</strong> each event is sent only to <strong>active</strong> groups that have ticked it below. An event no active group subscribes to is not sent (and the master switch above mutes everything).</p>
          <p><strong>Adding groups:</strong> invite the bot to a LINE group and it auto-appears here (via the <code>/api/line/webhook</code>), or add it manually with its Target ID. Token via <code>LINE_CHANNEL_ID</code>/<code>LINE_CHANNEL_SECRET</code> (or legacy <code>LINE_CHANNEL_ACCESS_TOKEN</code>).</p>
          <p>This page controls <strong>internal team</strong> LINE notifications. Customer-facing emails are configured under <a href="/admin/message-templates" className="underline font-medium">Msg Templates</a>.</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
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

      {/* Recent automatic notifications (observability) */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Recent automatic notifications</h2>
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {events.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No notifications yet</p>
          ) : (
            events.map((ev) => (
              <div key={ev.id} className="flex items-start gap-2 px-4 py-2.5 text-xs">
                <span className="mt-0.5 flex-shrink-0"><NotifIcon status={ev.status} /></span>
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-slate-700">{ev.type}</span>
                  <span className="text-slate-400 ml-2">{formatDateTime(ev.created_at)}</span>
                  {ev.error && <p className="text-red-500 mt-0.5 truncate">{ev.error}</p>}
                </div>
                <span className="text-slate-400 capitalize flex-shrink-0">{ev.status}</span>
              </div>
            ))
          )}
        </div>
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
              The LINE group/room ID. Usually captured automatically when the bot is added to a group; you can also paste it here.
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

function ConfigChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
      {ok ? <CheckCircle className="w-3 h-3" /> : <MinusCircle className="w-3 h-3" />} {label}
    </span>
  );
}

function NotifIcon({ status }: { status: string }) {
  if (status === 'sent') return <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />;
  if (status === 'failed') return <XCircle className="w-3.5 h-3.5 text-red-500" />;
  return <MinusCircle className="w-3.5 h-3.5 text-slate-400" />;
}
