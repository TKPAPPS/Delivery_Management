'use client';

import { useState, useEffect } from 'react';
import type { CommunicationEvent, LineGroup, DeliveryCard, CustomerWithRelations } from '@/types';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import { MessageSquare, Mail, Send, FileText, CheckCircle, XCircle, MinusCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useToastStore } from '@/store/toastStore';
import { formatDate, formatDateTime } from '@/lib/utils';

interface CommunicationPanelProps {
  card: DeliveryCard;
  customers: CustomerWithRelations[];
}

const STATUS_ICON = {
  sent: <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />,
  failed: <XCircle className="w-3.5 h-3.5 text-red-500" />,
  skipped: <MinusCircle className="w-3.5 h-3.5 text-slate-400" />,
};

export default function CommunicationPanel({ card, customers }: CommunicationPanelProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [events, setEvents] = useState<CommunicationEvent[]>([]);
  const [lineGroups, setLineGroups] = useState<LineGroup[]>([]);
  const [lineOpen, setLineOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [sending, setSending] = useState(false);

  const [lineForm, setLineForm] = useState({ group_id: '', message: '' });
  const [emailForm, setEmailForm] = useState({ recipient: '', subject: '', body: '' });
  const [summaryForm, setSummaryForm] = useState({ to: '', subject: '' });

  useEffect(() => {
    fetch(`/api/communications?card_id=${card.id}`)
      .then(r => r.json())
      .then(d => setEvents(d.events ?? []))
      .catch(() => {});
    fetch('/api/line-groups')
      .then(r => r.json())
      .then(d => setLineGroups(d.groups ?? []))
      .catch(() => {});
  }, [card.id]);

  const defaultLineMessage = `Delivery ${card.delivery_ref} — ${card.destination}${card.planned_date ? `\nPlanned: ${formatDate(card.planned_date)}` : ''}\nStatus: ${card.status}`;

  const openLine = () => {
    setLineForm({ group_id: lineGroups[0]?.id ?? '', message: defaultLineMessage });
    setLineOpen(true);
  };

  const openEmail = () => {
    setEmailForm({
      recipient: '',
      subject: `Delivery Confirmation — ${card.delivery_ref}`,
      body: `Dear Customer,\n\nYour delivery (${card.delivery_ref}) to ${card.destination} has been ${card.status === 'delivered' ? 'completed' : 'updated'}.\n\nPlease contact us if you have any questions.\n\nThank you.`,
    });
    setEmailOpen(true);
  };

  const openSummary = () => {
    setSummaryForm({
      to: '',
      subject: `Delivery Summary — ${card.delivery_ref}`,
    });
    setSummaryOpen(true);
  };

  const sendLine = async () => {
    if (!lineForm.message.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/communications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'line',
          delivery_card_id: card.id,
          line_group_id: lineForm.group_id || null,
          body: lineForm.message,
          recipient: lineGroups.find(g => g.id === lineForm.group_id)?.name ?? 'LINE',
        }),
      });
      const data = await res.json();
      setEvents(prev => [data.event, ...prev]);
      if (data.event.status === 'sent') {
        addToast('LINE message sent', 'success');
      } else if (data.event.status === 'skipped') {
        addToast(data.event.error ?? 'Logged (no LINE config)', 'info' as 'success');
      } else {
        addToast(data.event.error ?? 'Failed to send LINE message', 'error');
      }
      setLineOpen(false);
    } catch {
      addToast('Failed to send', 'error');
    } finally {
      setSending(false);
    }
  };

  const sendEmail = async () => {
    if (!emailForm.recipient.trim() || !emailForm.body.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/communications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'email',
          delivery_card_id: card.id,
          recipient: emailForm.recipient,
          subject: emailForm.subject,
          body: emailForm.body,
        }),
      });
      const data = await res.json();
      setEvents(prev => [data.event, ...prev]);
      if (data.event.status === 'sent') {
        addToast('Email sent', 'success');
      } else if (data.event.status === 'skipped') {
        addToast(data.event.error ?? 'Logged (no email config)', 'info' as 'success');
      } else {
        addToast(data.event.error ?? 'Failed to send email', 'error');
      }
      setEmailOpen(false);
    } catch {
      addToast('Failed to send', 'error');
    } finally {
      setSending(false);
    }
  };

  const sendSummary = async () => {
    if (!summaryForm.to.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/cards/${card.id}/send-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: summaryForm.to, subject: summaryForm.subject }),
      });
      const data = await res.json() as { status?: string; error?: string; attachments_linked?: number };
      if (res.ok && data.status === 'sent') {
        const attNote = data.attachments_linked && data.attachments_linked > 0
          ? ` (${data.attachments_linked} attachment link${data.attachments_linked > 1 ? 's' : ''} included)`
          : '';
        addToast(`Summary email sent${attNote}`, 'success');
        setSummaryOpen(false);
        // Refresh event log
        fetch(`/api/communications?card_id=${card.id}`)
          .then(r => r.json())
          .then(d => setEvents(d.events ?? []))
          .catch(() => {});
      } else if (data.status === 'skipped') {
        addToast(data.error ?? 'Email not configured — summary logged', 'info' as 'success');
        setSummaryOpen(false);
      } else {
        addToast(data.error ?? 'Failed to send summary', 'error');
      }
    } catch {
      addToast('Failed to send', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-slate-500" />
          <h3 className="font-semibold text-slate-900 text-sm">Communications</h3>
          {events.length > 0 && (
            <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">{events.length}</span>
          )}
        </div>
        <button
          onClick={() => setShowLog((v) => !v)}
          className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
        >
          {showLog ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {showLog ? 'Hide log' : 'Show log'}
        </button>
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={openLine} className="flex-1 min-w-[120px]">
          <MessageSquare className="w-3.5 h-3.5" /> Send to LINE
        </Button>
        <Button variant="outline" size="sm" onClick={openEmail} className="flex-1 min-w-[120px]">
          <Mail className="w-3.5 h-3.5" /> Email Customer
        </Button>
        <Button variant="outline" size="sm" onClick={openSummary} className="flex-1 min-w-[120px]">
          <FileText className="w-3.5 h-3.5" /> Email Summary
        </Button>
      </div>

      {showLog && (
        <div className="space-y-2 mt-2 border-t border-slate-100 pt-3">
          {events.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-3">No messages sent yet</p>
          ) : (
            events.map((ev) => (
              <div key={ev.id} className="flex items-start gap-2 text-xs text-slate-600">
                <span className="mt-0.5 flex-shrink-0">{STATUS_ICON[ev.status]}</span>
                <div className="min-w-0 flex-1">
                  <span className="font-medium capitalize">{ev.channel}</span>
                  {ev.recipient && <span className="text-slate-400"> → {ev.recipient}</span>}
                  <span className="text-slate-400 ml-1">· {formatDateTime(ev.created_at)}</span>
                  {ev.subject && <p className="text-slate-500 truncate mt-0.5 italic">{ev.subject}</p>}
                  {ev.error && <p className="text-red-500 text-xs mt-0.5 truncate">{ev.error}</p>}
                  {!ev.subject && ev.body && <p className="text-slate-500 truncate mt-0.5">{ev.body}</p>}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* LINE Modal */}
      <Modal open={lineOpen} onClose={() => setLineOpen(false)} title="Send to LINE" size="sm">
        <div className="space-y-3">
          {lineGroups.length > 0 && (
            <Select
              label="LINE Group"
              value={lineForm.group_id}
              onChange={(e) => setLineForm(f => ({ ...f, group_id: e.target.value }))}
              options={[
                { value: '', label: '— Default group —' },
                ...lineGroups.filter(g => g.active).map(g => ({ value: g.id, label: g.name })),
              ]}
            />
          )}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Message</label>
            <textarea
              value={lineForm.message}
              onChange={(e) => setLineForm(f => ({ ...f, message: e.target.value }))}
              rows={5}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-crimson-500 resize-none font-mono"
            />
          </div>
          <p className="text-xs text-slate-400">
            {lineGroups.length === 0 && 'No LINE groups configured — message goes to the default group.'}
          </p>
        </div>
        <div className="flex gap-3 justify-end mt-4">
          <Button variant="secondary" onClick={() => setLineOpen(false)} disabled={sending}>Cancel</Button>
          <Button onClick={sendLine} loading={sending} disabled={!lineForm.message.trim()}>
            <Send className="w-4 h-4" /> Send
          </Button>
        </div>
      </Modal>

      {/* Email Customer Modal */}
      <Modal open={emailOpen} onClose={() => setEmailOpen(false)} title="Email Customer" size="sm">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">To (email address)</label>
            <input
              type="email"
              value={emailForm.recipient}
              onChange={(e) => setEmailForm(f => ({ ...f, recipient: e.target.value }))}
              placeholder="customer@example.com"
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-crimson-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Subject</label>
            <input
              type="text"
              value={emailForm.subject}
              onChange={(e) => setEmailForm(f => ({ ...f, subject: e.target.value }))}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-crimson-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Message</label>
            <textarea
              value={emailForm.body}
              onChange={(e) => setEmailForm(f => ({ ...f, body: e.target.value }))}
              rows={6}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-crimson-500 resize-none"
            />
          </div>
          <p className="text-xs text-slate-400">Email must be configured by an admin to send.</p>
        </div>
        <div className="flex gap-3 justify-end mt-4">
          <Button variant="secondary" onClick={() => setEmailOpen(false)} disabled={sending}>Cancel</Button>
          <Button onClick={sendEmail} loading={sending} disabled={!emailForm.recipient.trim() || !emailForm.body.trim()}>
            <Send className="w-4 h-4" /> Send Email
          </Button>
        </div>
      </Modal>

      {/* Email Summary Modal */}
      <Modal open={summaryOpen} onClose={() => setSummaryOpen(false)} title="Email Delivery Summary" size="sm">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">To (email address)</label>
            <input
              type="email"
              value={summaryForm.to}
              onChange={(e) => setSummaryForm(f => ({ ...f, to: e.target.value }))}
              placeholder="recipient@example.com"
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-crimson-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Subject</label>
            <input
              type="text"
              value={summaryForm.subject}
              onChange={(e) => setSummaryForm(f => ({ ...f, subject: e.target.value }))}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-crimson-500"
            />
          </div>
          <p className="text-xs text-slate-400">
            Sends a full card summary including customers, logistics, notes, and 24-hour attachment links. Email must be configured by an admin.
          </p>
        </div>
        <div className="flex gap-3 justify-end mt-4">
          <Button variant="secondary" onClick={() => setSummaryOpen(false)} disabled={sending}>Cancel</Button>
          <Button onClick={sendSummary} loading={sending} disabled={!summaryForm.to.trim()}>
            <FileText className="w-4 h-4" /> Send Summary
          </Button>
        </div>
      </Modal>
    </div>
  );
}
