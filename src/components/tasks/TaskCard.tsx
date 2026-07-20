'use client';

import { Check, User, Users, Link2, CalendarDays } from 'lucide-react';
import { cn, formatDate, ymd } from '@/lib/utils';
import type { TaskWithRelations } from '@/types';

interface Props {
  task: TaskWithRelations;
  currentUserId: string;
  currentRole: string;
  users: Array<{ id: string; name: string | null; email: string }>;
  onToggleComplete: (task: TaskWithRelations, next: boolean) => void;
  onOpenDetail: (task: TaskWithRelations) => void;
}

export default function TaskCard({ task, currentUserId, currentRole, users, onToggleComplete, onOpenDetail }: Props) {
  const done = !!task.completed_at;
  // Shared "Everyone" tasks can be ticked off by anyone active.
  const canComplete = currentRole === 'admin' || task.created_by === currentUserId || task.assigned_to === currentUserId || task.assigned_all;

  const creatorName = task.creator?.name || task.creator?.email || 'someone';
  const assigneeName = task.assigned_all
    ? 'Everyone'
    : task.assignee?.name || task.assignee?.email || users.find((u) => u.id === task.assigned_to)?.name || 'Unassigned';
  const overdue = !done && !!task.due_date && task.due_date < ymd(new Date());

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetail(task)}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpenDetail(task); }}
      className={cn('bg-white border rounded-lg p-3 cursor-pointer hover:border-slate-300 transition-colors outline-none focus:border-crimson-400',
        overdue ? 'border-red-200' : 'border-slate-200', done && 'opacity-60')}
    >
      <div className="flex items-start gap-2.5">
        <button
          onClick={(e) => { e.stopPropagation(); if (canComplete) onToggleComplete(task, !done); }}
          disabled={!canComplete}
          title={canComplete ? (done ? 'Mark not done' : 'Mark done') : 'Only the creator or assignee can complete this'}
          className={cn(
            'mt-0.5 w-5 h-5 rounded border flex items-center justify-center flex-none transition-colors',
            done ? 'bg-crimson-600 border-crimson-600 text-white' : 'border-slate-300 hover:border-crimson-500',
            !canComplete && 'opacity-50 cursor-not-allowed',
          )}
        >
          {done && <Check className="w-3.5 h-3.5" />}
        </button>

        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-semibold text-slate-900', done && 'line-through')}>{task.title}</p>
          {task.body && <p className="text-xs text-slate-600 mt-0.5 whitespace-pre-wrap line-clamp-2">{task.body}</p>}

          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded bg-crimson-50 text-crimson-700">
              {task.assigned_all ? <Users className="w-3 h-3" /> : <User className="w-3 h-3" />}{assigneeName}
            </span>
            {(task.links ?? []).map((l) => (
              <span key={`${l.entity_type}:${l.entity_id}`} className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                <Link2 className="w-3 h-3" />{l.label || `${l.entity_type} (deleted)`}
              </span>
            ))}
            {task.due_date && (
              <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded',
                overdue ? 'bg-red-100 text-red-700' : 'bg-gold-100 text-gold-800')}>
                <CalendarDays className="w-3 h-3" />{formatDate(task.due_date)}{overdue ? ' · overdue' : ''}
              </span>
            )}
          </div>

          <p className="text-[11px] text-slate-400 mt-1.5">by {creatorName}</p>
        </div>
      </div>
    </div>
  );
}
