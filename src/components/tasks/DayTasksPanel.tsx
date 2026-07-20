'use client';

import { formatDate } from '@/lib/utils';
import TaskCard from './TaskCard';
import type { TaskWithRelations } from '@/types';

interface Props {
  selectedDate: string;
  today: string;
  dayTasks: TaskWithRelations[];
  backlog: TaskWithRelations[]; // undated + overdue, not completed
  currentUserId: string;
  currentRole: string;
  users: Array<{ id: string; name: string | null; email: string }>;
  onToggleComplete: (task: TaskWithRelations, next: boolean) => void;
  onOpenDetail: (task: TaskWithRelations) => void;
}

export default function DayTasksPanel({ selectedDate, today, dayTasks, backlog, currentUserId, currentRole, users, onToggleComplete, onOpenDetail }: Props) {
  const dayLabel = selectedDate === today ? 'Today' : formatDate(selectedDate);

  const render = (t: TaskWithRelations) => (
    <TaskCard key={t.id} task={t} currentUserId={currentUserId} currentRole={currentRole} users={users} onToggleComplete={onToggleComplete} onOpenDetail={onOpenDetail} />
  );

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-crimson-700 mb-2">{dayLabel} · {dayTasks.length} {dayTasks.length === 1 ? 'task' : 'tasks'}</h3>
        {dayTasks.length === 0 ? (
          <p className="text-xs text-slate-400">Nothing scheduled for this day.</p>
        ) : (
          <div className="space-y-2">{dayTasks.map(render)}</div>
        )}
      </div>

      {backlog.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-500 mb-2">Backlog · undated &amp; overdue</h3>
          <div className="space-y-2">{backlog.map(render)}</div>
        </div>
      )}
    </div>
  );
}
