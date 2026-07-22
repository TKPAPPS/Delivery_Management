'use client';

import { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { useToastStore } from '@/store/toastStore';
import { cn } from '@/lib/utils';

interface Recipient { id: string; name: string; phone_present: boolean; phone_masked: string | null; sale_orders: string[] }
interface Pdf { id: string; file_name: string }

interface Props {
  open: boolean;
  cardId: string | null;
  onClose: () => void;
  onDone?: () => void;
  source?: 'manual' | 'transit';
}

export default function SendWhatsAppModal({ open, cardId, onClose, onDone, source = 'manual' }: Props) {
  const addToast = useToastStore((s) => s.addToast);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [pdfs, setPdfs] = useState<Pdf[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pdfChoice, setPdfChoice] = useState('auto');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !cardId) return;
    setLoading(true);
    setPdfChoice('auto');
    (async () => {
      try {
        const res = await fetch(`/api/cards/${cardId}/send-whatsapp`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setConfigured(data.configured);
        setRecipients(data.recipients ?? []);
        setPdfs(data.pdfs ?? []);
        setSelected(new Set((data.recipients ?? []).filter((r: Recipient) => r.phone_present).map((r: Recipient) => r.id)));
      } catch {
        addToast('Could not load WhatsApp recipients', 'error');
        onClose();
      } finally {
        setLoading(false);
      }
    })();
  }, [open, cardId, addToast, onClose]);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleSend = async () => {
    if (!cardId || selected.size === 0) { addToast('Select at least one recipient', 'error'); return; }
    setSending(true);
    try {
      const res = await fetch(`/api/cards/${cardId}/send-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_ids: Array.from(selected), pdf: pdfChoice, source }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const parts = [`Sent to ${data.sent}`];
      if (data.failed) parts.push(`${data.failed} failed`);
      if (data.skipped) parts.push(`${data.skipped} skipped`);
      addToast(parts.join(', '), data.sent > 0 ? 'success' : (data.failed ? 'error' : 'info' as 'success'));
      onDone?.();
      onClose();
    } catch {
      addToast('Failed to send WhatsApp', 'error');
    } finally {
      setSending(false);
    }
  };

  const withPhone = recipients.filter((r) => r.phone_present);

  return (
    <Modal open={open} onClose={onClose} title="Send WhatsApp update" size="md">
      {loading ? (
        <p className="text-sm text-slate-400 py-6 text-center">Loading…</p>
      ) : (
        <div className="space-y-4">
          {!configured && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              WhatsApp is not set up yet (missing API credentials). You can review recipients, but sending is disabled until it is configured.
            </div>
          )}

          {/* Recipients */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Recipients</p>
            {recipients.length === 0 ? (
              <p className="text-sm text-slate-400">No customers on this card.</p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {recipients.map((r) => (
                  <label
                    key={r.id}
                    className={cn('flex items-center gap-2.5 px-2.5 py-2 border rounded-lg text-sm',
                      r.phone_present ? 'border-slate-200 cursor-pointer hover:bg-slate-50' : 'border-slate-100 bg-slate-50 opacity-70')}
                  >
                    <input
                      type="checkbox"
                      disabled={!r.phone_present}
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="font-medium text-slate-800">{r.name}</span>
                      {r.sale_orders.length > 0 && <span className="text-xs text-slate-400"> · {r.sale_orders.join(', ')}</span>}
                    </span>
                    <span className="text-xs text-slate-500 flex-none">{r.phone_present ? r.phone_masked : 'no phone'}</span>
                  </label>
                ))}
              </div>
            )}
            {recipients.length > 0 && withPhone.length === 0 && (
              <p className="text-xs text-amber-700 mt-1">None of these customers have a phone number on file.</p>
            )}
          </div>

          {/* PDF choice */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Attachment (PDF)</p>
            <div className="space-y-1.5">
              <label className={cn('flex items-center gap-2.5 px-2.5 py-2 border rounded-lg text-sm cursor-pointer',
                pdfChoice === 'auto' ? 'border-crimson-400 bg-crimson-50' : 'border-slate-200 hover:bg-slate-50')}>
                <input type="radio" name="wapdf" checked={pdfChoice === 'auto'} onChange={() => setPdfChoice('auto')} />
                <span><span className="font-medium text-slate-800">Auto delivery note</span><span className="text-xs text-slate-500"> · generated per customer</span></span>
              </label>
              {pdfs.map((p) => (
                <label key={p.id} className={cn('flex items-center gap-2.5 px-2.5 py-2 border rounded-lg text-sm cursor-pointer',
                  pdfChoice === p.id ? 'border-crimson-400 bg-crimson-50' : 'border-slate-200 hover:bg-slate-50')}>
                  <input type="radio" name="wapdf" checked={pdfChoice === p.id} onChange={() => setPdfChoice(p.id)} />
                  <span className="truncate text-slate-800">{p.file_name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" onClick={onClose} disabled={sending}>Cancel</Button>
            <Button onClick={handleSend} loading={sending} disabled={!configured || selected.size === 0}>
              Send to {selected.size || 0}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
