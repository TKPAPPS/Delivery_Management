'use client';

import { useState } from 'react';
import { Check, Undo2, Pencil, Trash2, User, Users, Link2, CalendarDays } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { cn, formatDate, ymd } from '@/lib/utils';
import { useToastStore } from '@/store/toastStore';
import type { TaskWithRelations } from '@/types';

interface Props {
  task: TaskWithRelations;
  open: boolean;
  onClose: () => void;
  currentUserId: string;
  currentRole: string;
  users: Array<{ id: string; name: string | null; email: string }>;
  onToggleComplete: (task: TaskWithRelations, next: boolean) => void;
  onEdit: (task: TaskWithRelations) => void;
  onDeleted: () => void;
}

export default function TaskDetailModal({ task, open, onClose, currentUserId, currentRole, users, onToggleComplete, onEdit, onDeleted }: Props) {
  const addToast = useToastStore((s) => s.addToast);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const done = !!task.completed_at;
  // A shared "Everyone" task can be completed by anyone active; field edits stay stricter.
  const canComplete = currentRole === 'admin' || task.created_by === currentUserId || task.assigned_to === currentUserId || task.assigned_all;
  const canEdit = currentRole === 'admin' || task.created_by === currentUserId || task.assigned_to === currentUserId;
  const canDelete = currentRole === 'admin' || task.created_by === currentUserId;

  const creatorName = task.creator?.name || task.creator?.email || 'someone';
  const assigneeName = task.assigned_all
    ? 'Everyone'
    : task.assignee?.name || task.assignee?.email || users.find((u) => u.id === task.assigned_to)?.name || 'Unassigned';
  const overdue = !done && !!task.due_date && task.due_date < ymd(new Date());

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      addToast('Task deleted', 'success');
      onDeleted();
      onClose();
    } catch {
      addToast('Failed to delete task', 'error');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <>
    <Modal open={open} onClose={onClose} title="Task" size="md">
      <div className="space-y-4">
        <div>
          <div className="flex items-start gap-2">
            <p className={cn('text-lg font-semibold text-slate-900 flex-1', done && 'line-through text-slate-500')}>{task.title}</p>
            {done && <span className="text-[11px] font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full flex-none mt-1">Done</span>}
          </div>
          {task.body && <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{task.body}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded bg-crimson-50 text-crimson-700">
            {task.assigned_all ? <Users className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}{assigneeName}
          </span>
          {task.due_date && (
            <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded', overdue ? 'bg-red-100 text-red-700' : 'bg-gold-100 text-gold-800')}>
              <CalendarDays className="w-3.5 h-3.5" />{formatDate(task.due_date)}{overdue ? ' · overdue' : ''}
            </span>
          )}
        </div>

        {(task.links ?? []).length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {(task.links ?? []).map((l) => (
              <span key={`${l.entity_type}:${l.entity_id}`} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded bg-slate-100 text-slate-600">
                <Link2 className="w-3.5 h-3.5" />{l.label || `${l.entity_type} (deleted)`}
              </span>
            ))}
          </div>
        )}

        <p className="text-xs text-slate-400">Created by {creatorName}</p>

        <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-slate-100">
          {canDelete && (
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} className="text-red-600 hover:bg-red-50 mr-auto">
              <Trash2 className="w-4 h-4" /> Delete
            </Button>
          )}
          {canEdit && (
            <Button variant="secondary" size="sm" onClick={() => onEdit(task)}>
              <Pencil className="w-4 h-4" /> Edit
            </Button>
          )}
          <Button
            size="sm"
            disabled={!canComplete}
            title={canComplete ? undefined : 'Only the creator or assignee can complete this'}
            onClick={() => { onToggleComplete(task, !done); onClose(); }}
          >
            {done ? <><Undo2 className="w-4 h-4" /> Mark not done</> : <><Check className="w-4 h-4" /> Mark as done</>}
          </Button>
        </div>
      </div>
    </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Delete task?"
        message="This task will be removed for everyone."
        confirmLabel="Delete"
        loading={deleting}
      />
    </>
  );
}
