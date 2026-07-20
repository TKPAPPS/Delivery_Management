'use client';

import { cn, ymd } from '@/lib/utils';
import TaskPill from './TaskPill';
import type { TaskWithRelations } from '@/types';

interface Props {
  anchor: Date; // any date within the shown week
  tasksByDate: Map<string, TaskWithRelations[]>;
  today: string;
  onOpenDay: (ymd: string) => void;
  onOpenDetail: (task: TaskWithRelations) => void;
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function WeekView({ anchor, tasksByDate, today, onOpenDay, onOpenDetail }: Props) {
  const offset = (anchor.getDay() + 6) % 7; // Monday-based
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() - offset);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
      {days.map((d, i) => {
        const key = ymd(d);
        const isToday = key === today;
        const items = (tasksByDate.get(key) ?? []).filter((t) => !t.completed_at);
        return (
          <div key={key} className={cn('min-h-[160px] border-slate-100 flex flex-col', i < 6 && 'lg:border-r', i % 2 === 0 && 'border-r sm:border-r', 'border-b')}>
            <button
              onClick={() => onOpenDay(key)}
              className="px-2 py-1.5 text-left hover:bg-slate-50 border-b border-slate-100 flex items-baseline gap-1.5"
            >
              <span className="text-[10px] uppercase tracking-wide text-slate-400">{DOW[i]}</span>
              <span className={cn('text-sm font-semibold', isToday ? 'text-crimson-700' : 'text-slate-700')}>{d.getDate()}</span>
              {items.length > 0 && <span className="ml-auto text-[10px] text-slate-400">{items.length}</span>}
            </button>
            <div className="flex flex-col gap-1 p-1.5 flex-1">
              {items.length === 0 ? (
                <span className="text-[11px] text-slate-300 px-1">·</span>
              ) : (
                items.map((t) => <TaskPill key={t.id} task={t} today={today} onClick={() => onOpenDetail(t)} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
