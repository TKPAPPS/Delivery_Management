'use client';

import { cn, ymd } from '@/lib/utils';
import TaskPill from './TaskPill';
import type { TaskWithRelations } from '@/types';

interface Props {
  month: Date; // any date within the shown month
  tasksByDate: Map<string, TaskWithRelations[]>;
  today: string;
  onOpenDay: (ymd: string) => void;
  onEdit: (task: TaskWithRelations) => void;
}

const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MAX_PILLS = 3;

export default function TaskCalendar({ month, tasksByDate, today, onOpenDay, onEdit }: Props) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // Monday-based
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - offset);

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="grid grid-cols-7 border-b border-slate-100">
        {DOW.map((d) => (
          <div key={d} className="text-[10px] text-slate-400 uppercase tracking-wide text-center py-1.5">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const key = ymd(d);
          const inMonth = d.getMonth() === first.getMonth();
          const isToday = key === today;
          const items = (tasksByDate.get(key) ?? []).filter((t) => !t.completed_at);
          const shown = items.slice(0, MAX_PILLS);
          const extra = items.length - shown.length;
          return (
            <div
              key={key}
              role="button"
              tabIndex={0}
              onClick={() => onOpenDay(key)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDay(key); } }}
              className={cn(
                'min-h-[92px] text-left p-1.5 border-b border-r border-slate-100 flex flex-col gap-1 hover:bg-slate-50 transition-colors cursor-pointer outline-none focus:bg-slate-50',
                (i + 1) % 7 === 0 && 'border-r-0',
                !inMonth && 'bg-slate-50/60',
              )}
            >
              <span className={cn(
                'text-xs font-medium self-start',
                isToday ? 'bg-crimson-600 text-white rounded-full w-5 h-5 flex items-center justify-center' : inMonth ? 'text-slate-700' : 'text-slate-300',
              )}>
                {d.getDate()}
              </span>
              <div className="flex flex-col gap-0.5">
                {shown.map((t) => (
                  <TaskPill key={t.id} task={t} today={today} onClick={() => onEdit(t)} />
                ))}
                {extra > 0 && (
                  <span className="text-[10px] text-slate-400 pl-1">+{extra} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
