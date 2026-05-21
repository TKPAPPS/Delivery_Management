'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToastStore } from '@/store/toastStore';
import {
  formatDate, formatDateTime,
  orderPriorityLabel, orderPriorityColor,
  orderStatusLabel, orderStatusColor,
  timeAgo,
} from '@/lib/utils';
import type { OrderWithLines, OrderLine } from '@/types';

const PRIORITY_OPTIONS = [
  { value: '5', label: '5 – Critical' },
  { value: '4', label: '4 – High' },
  { value: '3', label: '3 – Medium' },
  { value: '2', label: '2 – Low' },
  { value: '1', label: '1 – Lowest' },
];

interface Props {
  initialOrder: OrderWithLines;
  role: string;
}

function resolveCustomerName(order: OrderWithLines): string {
  return (order.customer as { name?: string } | null)?.name ?? order.customer_name_manual ?? '—';
}

function resolveDestinationName(order: OrderWithLines): string {
  return (order.destination as { name?: string } | null)?.name ?? order.destination_manual ?? '—';
}

export default function OrderDetailClient({ initialOrder, role }: Props) {
  const router = useRouter();
  const addToast = useToastStore((s) => s.addToast);

  const [order, setOrder] = useState<OrderWithLines>(initialOrder);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form state (mirrors order fields)
  const [editNotes, setEditNotes] = useState(order.notes ?? '');
  const [editPriority, setEditPriority] = useState(String(order.priority));

  // Line state
  const [addingLine, setAddingLine] = useState(false);
  const [newLine, setNewLine] = useState({ product_name: '', product_code: '', sale_order_number: '', qty_ordered: '', notes: '' });
  const [newLineErrors, setNewLineErrors] = useState<Record<string, string>>({});
  const [savingLine, setSavingLine] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editLineData, setEditLineData] = useState<Partial<OrderLine & { qty_ordered_str: string }>>({});
  const [savingEditLine, setSavingEditLine] = useState(false);

  // Delete state
  const [deleteOrderOpen, setDeleteOrderOpen] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState(false);
  const [deleteLineId, setDeleteLineId] = useState<string | null>(null);
  const [deletingLine, setDeletingLine] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/orders/${order.id}`);
    if (res.ok) {
      const data = await res.json();
      setOrder(data.order);
    }
  }, [order.id]);

  // --- Order edit ---
  const startEdit = () => {
    setEditNotes(order.notes ?? '');
    setEditPriority(String(order.priority));
    setEditMode(true);
  };

  const cancelEdit = () => setEditMode(false);

  const saveEdit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: editNotes.trim() || null, priority: parseInt(editPriority, 10) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to save');
      setOrder((prev) => ({ ...prev, ...data.order }));
      setEditMode(false);
      addToast('Order updated', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  // --- Order delete ---
  const handleDeleteOrder = async () => {
    setDeletingOrder(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed to delete'); }
      addToast('Order deleted', 'success');
      router.push('/orders');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to delete', 'error');
    } finally {
      setDeletingOrder(false);
      setDeleteOrderOpen(false);
    }
  };

  // --- Add line ---
  const validateNewLine = (): boolean => {
    const e: Record<string, string> = {};
    if (!newLine.product_name.trim()) e.product_name = 'Required';
    const qty = parseInt(newLine.qty_ordered, 10);
    if (!newLine.qty_ordered || isNaN(qty) || qty <= 0) e.qty_ordered = 'Must be > 0';
    setNewLineErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleAddLine = async () => {
    if (!validateNewLine()) return;
    setSavingLine(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: newLine.product_name.trim(),
          product_code: newLine.product_code.trim() || null,
          sale_order_number: newLine.sale_order_number.trim() || null,
          qty_ordered: parseInt(newLine.qty_ordered, 10),
          notes: newLine.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to add line');
      await refresh();
      setNewLine({ product_name: '', product_code: '', sale_order_number: '', qty_ordered: '', notes: '' });
      setAddingLine(false);
      addToast('Line added', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to add line', 'error');
    } finally {
      setSavingLine(false);
    }
  };

  // --- Edit line inline ---
  const startEditLine = (line: OrderLine) => {
    setEditingLineId(line.id);
    setEditLineData({ ...line, qty_ordered_str: String(line.qty_ordered) });
  };

  const cancelEditLine = () => { setEditingLineId(null); setEditLineData({}); };

  const saveEditLine = async (lineId: string) => {
    const qty = parseInt(String(editLineData.qty_ordered_str ?? ''), 10);
    if (!editLineData.product_name?.trim()) { addToast('Product name is required', 'error'); return; }
    if (isNaN(qty) || qty <= 0) { addToast('Qty must be > 0', 'error'); return; }
    setSavingEditLine(true);
    try {
      const res = await fetch(`/api/order-lines/${lineId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: editLineData.product_name,
          product_code: editLineData.product_code || null,
          sale_order_number: editLineData.sale_order_number || null,
          qty_ordered: qty,
          notes: editLineData.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to update line');
      await refresh();
      cancelEditLine();
      addToast('Line updated', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to update line', 'error');
    } finally {
      setSavingEditLine(false);
    }
  };

  // --- Delete line ---
  const handleDeleteLine = async () => {
    if (!deleteLineId) return;
    setDeletingLine(true);
    try {
      const res = await fetch(`/api/order-lines/${deleteLineId}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed to delete line'); }
      await refresh();
      addToast('Line removed', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to delete line', 'error');
    } finally {
      setDeletingLine(false);
      setDeleteLineId(null);
    }
  };

  const canWrite = ['admin', 'sales'].includes(role);
  const isEditable = canWrite && order.status !== 'completed' && order.status !== 'cancelled' && order.source === 'manual';

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Back + header */}
      <div className="mb-6">
        <Link href="/orders" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3">
          <ArrowLeft className="w-4 h-4" /> Orders Pool
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold font-mono text-slate-900">{order.order_ref}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${orderStatusColor(order.status)}`}>
                {orderStatusLabel(order.status)}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${orderPriorityColor(order.priority)}`}>
                {order.priority} – {orderPriorityLabel(order.priority)}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">
                {order.source}
              </span>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {!editMode && isEditable && (
              <Button variant="outline" size="sm" onClick={startEdit}>
                <Pencil className="w-3.5 h-3.5" /> Edit
              </Button>
            )}
            {role === 'admin' && (
              <Button variant="danger" size="sm" onClick={() => setDeleteOrderOpen(true)}>
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Order info */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
        {editMode ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Priority</label>
                <select
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Notes</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={cancelEdit} disabled={saving}>Cancel</Button>
              <Button size="sm" onClick={saveEdit} loading={saving}>
                <Check className="w-3.5 h-3.5" /> Save
              </Button>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer</dt>
              <dd className="mt-1 text-sm text-slate-900">{resolveCustomerName(order)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Destination</dt>
              <dd className="mt-1 text-sm text-slate-900">{resolveDestinationName(order)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Created</dt>
              <dd className="mt-1 text-sm text-slate-900">{formatDate(order.created_at)}</dd>
            </div>
            {order.notes && (
              <div className="col-span-2 md:col-span-3">
                <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Notes</dt>
                <dd className="mt-1 text-sm text-slate-700">{order.notes}</dd>
              </div>
            )}
          </dl>
        )}
      </div>

      {/* Order Lines */}
      <div className="bg-white border border-slate-200 rounded-xl mb-6">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Order Lines ({order.lines.length})</h2>
          {isEditable && !addingLine && (
            <Button variant="outline" size="sm" onClick={() => setAddingLine(true)}>
              <Plus className="w-3.5 h-3.5" /> Add Line
            </Button>
          )}
        </div>

        {order.lines.length === 0 && !addingLine ? (
          <p className="text-sm text-slate-400 text-center py-8">No order lines yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Product</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Code</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">SO#</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Ordered</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Sent</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Remaining</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Status</th>
                {isEditable && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {order.lines.map((line) => (
                editingLineId === line.id ? (
                  <tr key={line.id} className="bg-blue-50">
                    <td className="px-3 py-2">
                      <Input
                        value={String(editLineData.product_name ?? '')}
                        onChange={(e) => setEditLineData((p) => ({ ...p, product_name: e.target.value }))}
                        className="text-xs py-1"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={String(editLineData.product_code ?? '')}
                        onChange={(e) => setEditLineData((p) => ({ ...p, product_code: e.target.value }))}
                        className="text-xs py-1"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={String(editLineData.sale_order_number ?? '')}
                        onChange={(e) => setEditLineData((p) => ({ ...p, sale_order_number: e.target.value }))}
                        className="text-xs py-1"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        min={1}
                        value={String(editLineData.qty_ordered_str ?? '')}
                        onChange={(e) => setEditLineData((p) => ({ ...p, qty_ordered_str: e.target.value }))}
                        className="text-xs py-1 w-20 text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-slate-500">{line.qty_sent}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{line.qty_ordered - line.qty_sent}</td>
                    <td className="px-3 py-2 text-slate-500 text-xs">{line.status}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => saveEditLine(line.id)} disabled={savingEditLine} className="text-emerald-600 hover:text-emerald-700 p-1 disabled:opacity-50">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={cancelEditLine} className="text-slate-400 hover:text-slate-600 p-1">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={line.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{line.product_name}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{line.product_code ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{line.sale_order_number ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{line.qty_ordered}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{line.qty_sent}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-700">{line.qty_ordered - line.qty_sent}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">{line.status}</span>
                    </td>
                    {isEditable && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => startEditLine(line)} className="text-slate-400 hover:text-blue-500 p-1">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeleteLineId(line.id)} className="text-slate-400 hover:text-red-500 p-1">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              ))}

              {/* Add line row */}
              {addingLine && (
                <tr className="bg-emerald-50">
                  <td className="px-3 py-2">
                    <Input
                      placeholder="Product name *"
                      value={newLine.product_name}
                      onChange={(e) => setNewLine((p) => ({ ...p, product_name: e.target.value }))}
                      error={newLineErrors.product_name}
                      className="text-xs py-1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      placeholder="Code"
                      value={newLine.product_code}
                      onChange={(e) => setNewLine((p) => ({ ...p, product_code: e.target.value }))}
                      className="text-xs py-1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      placeholder="SO#"
                      value={newLine.sale_order_number}
                      onChange={(e) => setNewLine((p) => ({ ...p, sale_order_number: e.target.value }))}
                      className="text-xs py-1"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Input
                      type="number"
                      min={1}
                      placeholder="Qty"
                      value={newLine.qty_ordered}
                      onChange={(e) => setNewLine((p) => ({ ...p, qty_ordered: e.target.value }))}
                      error={newLineErrors.qty_ordered}
                      className="text-xs py-1 w-20 text-right"
                    />
                  </td>
                  <td colSpan={2} />
                  <td className="px-3 py-2 text-slate-400 text-xs">pending</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={handleAddLine} disabled={savingLine} className="text-emerald-600 hover:text-emerald-700 p-1 disabled:opacity-50">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => { setAddingLine(false); setNewLine({ product_name: '', product_code: '', sale_order_number: '', qty_ordered: '', notes: '' }); setNewLineErrors({}); }} className="text-slate-400 hover:text-slate-600 p-1">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Activity log */}
      {order.activity_log.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl">
          <h2 className="text-sm font-semibold text-slate-900 px-5 py-4 border-b border-slate-100">Activity</h2>
          <ul className="divide-y divide-slate-100">
            {order.activity_log.map((entry) => (
              <li key={entry.id} className="px-5 py-3 flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-xs text-slate-700">
                    <span className="font-medium">{(entry.profile as { name?: string } | null)?.name ?? 'System'}</span>
                    {' — '}
                    <span className="text-slate-500">{entry.action.replace(/_/g, ' ')}</span>
                  </p>
                </div>
                <span className="text-xs text-slate-400 shrink-0">{timeAgo(entry.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Delete order confirmation */}
      <ConfirmDialog
        open={deleteOrderOpen}
        onClose={() => setDeleteOrderOpen(false)}
        onConfirm={handleDeleteOrder}
        title="Delete order"
        message={`Delete ${order.order_ref}? This action soft-deletes the order and cannot be undone from the UI.`}
        confirmLabel="Delete"
        loading={deletingOrder}
      />

      {/* Delete line confirmation */}
      <ConfirmDialog
        open={!!deleteLineId}
        onClose={() => setDeleteLineId(null)}
        onConfirm={handleDeleteLine}
        title="Remove line"
        message="Remove this order line?"
        confirmLabel="Remove"
        loading={deletingLine}
      />
    </div>
  );
}
