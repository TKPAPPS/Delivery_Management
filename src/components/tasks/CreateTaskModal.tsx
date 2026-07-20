'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
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

interface OrderPick { id: string; label: string }

export default function CreateTaskModal({ open, onClose, onSaved, users, customers, task }: Props) {
  const addToast = useToastStore((s) => s.addToast);
  const isEdit = !!task;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [assignee, setAssignee] = useState('__all__'); // '__all__' or a user id
  const [customerId, setCustomerId] = useState('');
  const [orders, setOrders] = useState<OrderPick[]>([]);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderResults, setOrderResults] = useState<OrderPick[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [loading, setLoading] = useState(false);

  // Seed from an existing task (edit) or reset (create) whenever it opens.
  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? '');
    setBody(task?.body ?? '');
    setAssignee(task?.assigned_all ? '__all__' : (task?.assigned_to ?? '__all__'));
    const links = task?.links ?? [];
    setCustomerId(links.find((l) => l.entity_type === 'customer')?.entity_id ?? '');
    setOrders(links.filter((l) => l.entity_type === 'order').map((l) => ({ id: l.entity_id, label: l.label || l.entity_id })));
    setOrderSearch('');
    setOrderResults([]);
    setDueDate(task?.due_date ?? '');
  }, [open, task]);

  // Order picker: list open orders immediately; filter across all orders as you type.
  useEffect(() => {
    if (!open) return;
    const term = orderSearch.trim();
    const t = setTimeout(async () => {
      try {
        const qs = term.length >= 2 ? `q=${encodeURIComponent(term)}&page=1` : `status=active&page=1`;
        const res = await fetch(`/api/orders?${qs}`);
        if (!res.ok) return;
        const data = await res.json();
        const picked = new Set(orders.map((o) => o.id));
        setOrderResults(
          (data.orders ?? [])
            .map((o: { id: string; odoo_order_ref?: string; order_ref: string; customer_name_manual?: string }) => ({
              id: o.id,
              label: `${o.odoo_order_ref || o.order_ref}${o.customer_name_manual ? ' — ' + o.customer_name_manual : ''}`,
            }))
            .filter((o: OrderPick) => !picked.has(o.id))
            .slice(0, 10),
        );
      } catch { /* ignore */ }
    }, term.length >= 2 ? 300 : 0);
    return () => clearTimeout(t);
  }, [orderSearch, open, orders]);

  const addOrder = (o: OrderPick) => { setOrders((prev) => [...prev, o]); setOrderSearch(''); };
  const removeOrder = (id: string) => setOrders((prev) => prev.filter((o) => o.id !== id));

  const handleSubmit = async () => {
    if (!title.trim()) { addToast('Please enter a subject', 'error'); return; }
    setLoading(true);
    try {
      const links = [
        ...(customerId ? [{ entity_type: 'customer', entity_id: customerId }] : []),
        ...orders.map((o) => ({ entity_type: 'order', entity_id: o.id })),
      ];
      const payload = {
        title: title.trim(),
        body: body.trim() || null,
        assigned_all: assignee === '__all__',
        assigned_to: assignee === '__all__' ? null : assignee,
        links,
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

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Assign to"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            options={[{ value: '__all__', label: 'Everyone' }, ...users.map((u) => ({ value: u.id, label: u.name || u.email }))]}
          />
          <DatePicker label="Due date (optional)" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>

        <Select
          label="Link customer (optional)"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          options={[{ value: '', label: 'None' }, ...customers.map((c) => ({ value: c.id, label: c.name }))]}
        />

        <div>
          <label className="text-sm font-medium text-slate-700">Link orders (optional)</label>
          {orders.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
              {orders.map((o) => (
                <span key={o.id} className="inline-flex items-center gap-1 bg-crimson-50 text-crimson-700 text-xs px-2 py-1 rounded font-mono">
                  {o.label}
                  <button onClick={() => removeOrder(o.id)} className="hover:text-red-600"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          )}
          <Input value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} placeholder="Search SO number or customer to add..." className="mt-1" />
          <div className="mt-1 border border-slate-200 rounded-lg divide-y max-h-44 overflow-y-auto">
            <p className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide bg-slate-50">
              {orderSearch.trim().length >= 2 ? 'Matches' : 'Open orders'} · tap to add
            </p>
            {orderResults.length > 0 ? (
              orderResults.map((o) => (
                <button key={o.id} onClick={() => addOrder(o)} className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50 font-mono">
                  {o.label}
                </button>
              ))
            ) : (
              <p className="px-3 py-2 text-xs text-slate-400">
                {orderSearch.trim().length >= 2 ? 'No matching orders' : 'No more open orders — type to search all'}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleSubmit} loading={loading}>{isEdit ? 'Save' : 'Create Task'}</Button>
        </div>
      </div>
    </Modal>
  );
}
