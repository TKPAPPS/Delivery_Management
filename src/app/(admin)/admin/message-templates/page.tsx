'use client';

import { useEffect, useState } from 'react';
import type { MessageTemplate, DeliveryStatus } from '@/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import { useToastStore } from '@/store/toastStore';
import { Mail, RefreshCw, Info, Check } from 'lucide-react';
import { statusLabel } from '@/lib/utils';

const STATUSES: DeliveryStatus[] = ['pending_booking', 'booked', 'in_transit', 'delivered'];

const PLACEHOLDERS = [
  '{{customer_name}}', '{{driver_name}}', '{{driver_phone}}',
  '{{destination}}', '{{delivery_ref}}', '{{planned_date}}',
];

interface Draft { subject: string; body: string; active: boolean; }

export default function MessageTemplatesPage() {
  const addToast = useToastStore((s) => s.addToast);
  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState<DeliveryStatus | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/message-templates');
      const data = await res.json();
      const byStatus: Record<string, Draft> = {};
      for (const s of STATUSES) byStatus[s] = { subject: '', body: '', active: false };
      for (const t of (data.templates ?? []) as MessageTemplate[]) {
        byStatus[t.status] = { subject: t.subject, body: t.body, active: t.active };
      }
      setDrafts(byStatus);
    } catch {
      addToast('Failed to load templates', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (status: DeliveryStatus, p: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [status]: { ...prev[status], ...p } }));

  const save = async (status: DeliveryStatus) => {
    setSavingStatus(status);
    try {
      const res = await fetch('/api/message-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...drafts[status] }),
      });
      if (!res.ok) throw new Error();
      addToast(`${statusLabel(status)} template saved`, 'success');
    } catch {
      addToast('Failed to save template', 'error');
    } finally {
      setSavingStatus(null);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Mail className="w-5 h-5 text-slate-700" />
          <h1 className="text-xl font-bold text-black">Customer Message Templates</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={load} loading={loading}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        When a card moves to a status, every customer on that card who has an email and has automatic
        emails enabled is sent the matching template below. Email only. Internal team LINE
        notifications are configured under <a href="/admin/communications" className="underline font-medium text-slate-600">Communications</a>.
      </p>

      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-800">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>
          A template only sends to a customer who has an <strong>email address</strong> and the
          &ldquo;Send automatic status emails&rdquo; toggle on (set per customer on the delivery card,
          or add emails in <a href="/admin/customers" className="underline font-medium">Customer Directory</a>).
          Customers without an email are skipped.
        </p>
      </div>

      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6 text-xs text-blue-800">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium mb-1">Available placeholders (replaced automatically):</p>
          <div className="flex flex-wrap gap-1.5">
            {PLACEHOLDERS.map((p) => (
              <code key={p} className="bg-white border border-blue-200 rounded px-1.5 py-0.5 font-mono">{p}</code>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading…</div>
      ) : (
        <div className="space-y-4">
          {STATUSES.map((status) => {
            const d = drafts[status] ?? { subject: '', body: '', active: false };
            return (
              <div key={status} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-slate-900 text-sm">On status: {statusLabel(status)}</h3>
                  <label className="flex items-center gap-2 text-xs text-slate-600 select-none">
                    <input
                      type="checkbox"
                      checked={d.active}
                      onChange={(e) => patch(status, { active: e.target.checked })}
                      className="rounded border-slate-300 text-crimson-600 focus:ring-crimson-500"
                    />
                    Active
                  </label>
                </div>
                <div className="space-y-2">
                  <Input
                    label="Subject"
                    value={d.subject}
                    onChange={(e) => patch(status, { subject: e.target.value })}
                    placeholder="Email subject"
                  />
                  <Textarea
                    label="Message body"
                    value={d.body}
                    onChange={(e) => patch(status, { body: e.target.value })}
                    rows={3}
                    placeholder="Hello {{customer_name}}, …"
                  />
                </div>
                <div className="flex justify-end mt-3">
                  <Button size="sm" onClick={() => save(status)} loading={savingStatus === status}>
                    <Check className="w-3.5 h-3.5" /> Save
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
