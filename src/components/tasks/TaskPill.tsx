'use client';

import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TaskWithRelations } from '@/types';

// Compact task chip shown inside month/week calendar cells. Click bubbles up to
// open the day (where full cards let you act). Colour signals overdue vs normal.
export default function TaskPill({ task, today, onClick }: { task: TaskWithRelations; today: string; onClick: () => void }) {
  const done = !!task.completed_at;
  const overdue = !done && !!task.due_date && task.due_date < today;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={task.title}
      className={cn(
        'w-full text-left text-[11px] leading-tight px-1.5 py-1 rounded truncate flex items-center gap-1 border-l-2 transition-colors',
        done && 'opacity-50 line-through',
        overdue
          ? 'bg-red-50 text-red-700 border-red-400 hover:bg-red-100'
          : 'bg-crimson-50 text-crimson-800 border-crimson-400 hover:bg-crimson-100',
      )}
    >
      {task.assigned_all && <Users className="w-2.5 h-2.5 flex-none opacity-70" />}
      <span className="truncate">{task.title}</span>
    </button>
  );
}
