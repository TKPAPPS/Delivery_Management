'use client';

import { useState } from 'react';
import { Check, Pencil, Trash2, User, Users, Link2, CalendarDays } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { useToastStore } from '@/store/toastStore';
import type { TaskWithRelations } from '@/types';

interface Props {
  task: TaskWithRelations;
  currentUserId: string;
  currentRole: string;
  users: Array<{ id: string; name: string | null; email: string }>;
  onChanged: () => void;
  onEdit: (task: TaskWithRelations) => void;
}

export default function TaskCard({ task, currentUserId, currentRole, users, onChanged, onEdit }: Props) {
  const addToast = useToastStore((s) => s.addToast);
  const [busy, setBusy] = useState(false);

  const canEdit = currentRole === 'admin' || task.created_by === currentUserId || task.assigned_to === currentUserId;
  const canDelete = currentRole === 'admin' || task.created_by === currentUserId;
  const done = !!task.completed_at;

  const creatorName = task.creator?.name || task.creator?.email || 'someone';
  const assigneeName = task.assigned_all
    ? 'Everyone'
    : task.assignee?.name || task.assignee?.email
      || users.find((u) => u.id === task.assigned_to)?.name || 'Unassigned';

  const overdue = !done && task.due_date && task.due_date < new Date().toISOString().slice(0, 10);

  const toggleDone = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !done }),
      });
      if (!res.ok) throw new Error();
      onChanged();
    } catch {
      addToast('Failed to update task', 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm('Delete this task?')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      addToast('Task deleted', 'success');
      onChanged();
    } catch {
      addToast('Failed to delete task', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn('bg-white border rounded-lg p-3', overdue ? 'border-red-200' : 'border-slate-200', done && 'opacity-60')}>
      <div className="flex items-start gap-2.5">
        <button
          onClick={toggleDone}
          disabled={busy || !canEdit}
          title={canEdit ? (done ? 'Mark not done' : 'Mark done') : 'Only the creator or assignee can complete this'}
          className={cn(
            'mt-0.5 w-5 h-5 rounded border flex items-center justify-center flex-none transition-colors',
            done ? 'bg-crimson-600 border-crimson-600 text-white' : 'border-slate-300 hover:border-crimson-500',
            !canEdit && 'opacity-50 cursor-not-allowed',
          )}
        >
          {done && <Check className="w-3.5 h-3.5" />}
        </button>

        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-semibold text-slate-900', done && 'line-through')}>{task.title}</p>
          {task.body && <p className="text-xs text-slate-600 mt-0.5 whitespace-pre-wrap">{task.body}</p>}

          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded bg-crimson-50 text-crimson-700">
              {task.assigned_all ? <Users className="w-3 h-3" /> : <User className="w-3 h-3" />}{assigneeName}
            </span>
            {task.entity_type && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                <Link2 className="w-3 h-3" />{task.entity_label || `${task.entity_type} (deleted)`}
              </span>
            )}
            {task.due_date && (
              <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded',
                overdue ? 'bg-red-100 text-red-700' : 'bg-gold-100 text-gold-800')}>
                <CalendarDays className="w-3 h-3" />{formatDate(task.due_date)}{overdue ? ' · overdue' : ''}
              </span>
            )}
          </div>

          <p className="text-[11px] text-slate-400 mt-1.5">by {creatorName}</p>
        </div>

        {(canEdit || canDelete) && (
          <div className="flex items-center gap-1 flex-none">
            {canEdit && (
              <button onClick={() => onEdit(task)} disabled={busy} className="p-1 text-slate-400 hover:text-slate-700" title="Edit">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {canDelete && (
              <button onClick={remove} disabled={busy} className="p-1 text-slate-400 hover:text-red-600" title="Delete">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
