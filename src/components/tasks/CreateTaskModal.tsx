'use client';

import { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import DatePicker from '@/components/ui/DatePicker';
import { useToastStore } from '@/store/toastStore';
import type { TaskWithRelations } from '@/types';

export interface UserOption { id: string; name: string | null; email: string }
export interface CustomerOption { id: string; name: string }

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  users: UserOption[];
  customers: CustomerOption[];
  task?: TaskWithRelations | null; // when set, edit mode
}

type LinkType = 'none' | 'customer' | 'order';

export default function CreateTaskModal({ open, onClose, onSaved, users, customers, task }: Props) {
  const addToast = useToastStore((s) => s.addToast);
  const isEdit = !!task;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [assignee, setAssignee] = useState('__all__'); // '__all__' or a user id
  const [linkType, setLinkType] = useState<LinkType>('none');
  const [customerId, setCustomerId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [orderLabel, setOrderLabel] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderResults, setOrderResults] = useState<Array<{ id: string; label: string }>>([]);
  const [dueDate, setDueDate] = useState('');
  const [loading, setLoading] = useState(false);

  // Seed form from an existing task (edit) or reset (create) whenever it opens.
  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? '');
    setBody(task?.body ?? '');
    setAssignee(task?.assigned_all ? '__all__' : (task?.assigned_to ?? '__all__'));
    setLinkType((task?.entity_type as LinkType) ?? 'none');
    setCustomerId(task?.entity_type === 'customer' ? (task?.entity_id ?? '') : '');
    setOrderId(task?.entity_type === 'order' ? (task?.entity_id ?? '') : '');
    setOrderLabel(task?.entity_type === 'order' ? (task?.entity_label ?? '') : '');
    setOrderSearch('');
    setOrderResults([]);
    setDueDate(task?.due_date ?? '');
  }, [open, task]);

  // Order picker: show open orders to choose from as soon as "Order" is selected,
  // and filter across all orders as the user types (SO number or customer name).
  useEffect(() => {
    if (linkType !== 'order' || orderId) { setOrderResults([]); return; }
    const term = orderSearch.trim();
    const t = setTimeout(async () => {
      try {
        // No query -> the open (active/unassigned) orders. Typing -> full search.
        const qs = term.length >= 2 ? `q=${encodeURIComponent(term)}&page=1` : `status=active&page=1`;
        const res = await fetch(`/api/orders?${qs}`);
        if (!res.ok) return;
        const data = await res.json();
        setOrderResults(
          (data.orders ?? []).slice(0, 10).map((o: { id: string; odoo_order_ref?: string; order_ref: string; customer_name_manual?: string }) => ({
            id: o.id,
            label: `${o.odoo_order_ref || o.order_ref}${o.customer_name_manual ? ' — ' + o.customer_name_manual : ''}`,
          })),
        );
      } catch { /* ignore */ }
    }, term.length >= 2 ? 300 : 0);
    return () => clearTimeout(t);
  }, [orderSearch, linkType, orderId]);

  const handleSubmit = async () => {
    if (!title.trim()) { addToast('Please enter a subject', 'error'); return; }
    if (linkType === 'order' && !orderId) { addToast('Please pick an order (or choose no link)', 'error'); return; }

    setLoading(true);
    try {
      const entity_type = linkType === 'none' ? null : linkType;
      const entity_id = linkType === 'customer' ? customerId : linkType === 'order' ? orderId : null;
      const payload = {
        title: title.trim(),
        body: body.trim() || null,
        assigned_all: assignee === '__all__',
        assigned_to: assignee === '__all__' ? null : assignee,
        entity_type,
        entity_id: entity_type ? entity_id : null,
        due_date: dueDate || null,
      };
      const res = await fetch(isEdit ? `/api/tasks/${task!.id}` : '/api/tasks', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      addToast(isEdit ? 'Task updated' : 'Task created', 'success');
      onSaved();
      onClose();
    } catch {
      addToast(isEdit ? 'Failed to update task' : 'Failed to create task', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Task' : 'New Task'} size="md">
      <div className="space-y-4">
        <Input label="Subject *" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Call customer about delivery time" autoFocus />
        <Textarea label="Details" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Anything worth noting..." rows={3} />

        <Select
          label="Assign to"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          options={[{ value: '__all__', label: 'Everyone' }, ...users.map((u) => ({ value: u.id, label: u.name || u.email }))]}
        />

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Link to (optional)"
            value={linkType}
            onChange={(e) => { setLinkType(e.target.value as LinkType); setCustomerId(''); setOrderId(''); setOrderLabel(''); setOrderSearch(''); }}
            options={[{ value: 'none', label: 'Nothing' }, { value: 'customer', label: 'Customer' }, { value: 'order', label: 'Order' }]}
          />
          <DatePicker label="Due date (optional)" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>

        {linkType === 'customer' && (
          <Select
            label="Customer"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            placeholder="Select a customer..."
            options={customers.map((c) => ({ value: c.id, label: c.name }))}
          />
        )}

        {linkType === 'order' && (
          <div>
            {orderId ? (
              <div className="flex items-center justify-between text-sm border border-slate-300 rounded-lg px-3 py-2 bg-slate-50">
                <span className="font-mono text-slate-800">{orderLabel}</span>
                <button className="text-xs text-crimson-700 hover:underline" onClick={() => { setOrderId(''); setOrderLabel(''); }}>change</button>
              </div>
            ) : (
              <>
                <Input label="Order" value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} placeholder="Search SO number or customer..." />
                <div className="mt-1 border border-slate-200 rounded-lg divide-y max-h-48 overflow-y-auto">
                  <p className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide bg-slate-50">
                    {orderSearch.trim().length >= 2 ? 'Matches' : 'Open orders'}
                  </p>
                  {orderResults.length > 0 ? (
                    orderResults.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => { setOrderId(o.id); setOrderLabel(o.label); setOrderResults([]); }}
                        className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50 font-mono"
                      >
                        {o.label}
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-2 text-xs text-slate-400">
                      {orderSearch.trim().length >= 2 ? 'No matching orders' : 'No open orders — type to search all'}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex gap-3 justify-end pt-2">
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleSubmit} loading={loading}>{isEdit ? 'Save' : 'Create Task'}</Button>
        </div>
      </div>
    </Modal>
  );
}
