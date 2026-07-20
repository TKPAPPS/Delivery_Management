'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TaskWithRelations } from '@/types';

export function ymd(d: Date): string {
  // Local YYYY-MM-DD (due_date is a plain date; the team works in one timezone).
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Props {
  month: Date; // any date within the shown month
  tasksByDate: Map<string, TaskWithRelations[]>;
  selectedDate: string;
  today: string;
  onSelectDate: (ymd: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export default function TaskCalendar({ month, tasksByDate, selectedDate, today, onSelectDate, onPrevMonth, onNextMonth }: Props) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  // Monday-based offset for the grid start.
  const offset = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - offset);

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }

  const monthLabel = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <button onClick={onPrevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600" aria-label="Previous month">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={onNextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600" aria-label="Next month">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DOW.map((d) => (
          <div key={d} className="text-[10px] text-slate-400 uppercase tracking-wide text-center pb-1">{d}</div>
        ))}
        {days.map((d) => {
          const key = ymd(d);
          const inMonth = d.getMonth() === first.getMonth();
          const count = tasksByDate.get(key)?.filter((t) => !t.completed_at).length ?? 0;
          const isSelected = key === selectedDate;
          const isToday = key === today;
          return (
            <button
              key={key}
              onClick={() => onSelectDate(key)}
              className={cn(
                'relative aspect-square rounded-md text-xs p-1 flex flex-col items-start border transition-colors',
                inMonth ? 'bg-white text-slate-800' : 'bg-slate-50 text-slate-300',
                isSelected ? 'border-crimson-500 ring-1 ring-crimson-500' : 'border-slate-100 hover:border-slate-300',
              )}
            >
              <span className={cn('font-medium', isToday && 'bg-crimson-600 text-white rounded-full w-5 h-5 flex items-center justify-center')}>
                {d.getDate()}
              </span>
              {count > 0 && (
                <span className="absolute bottom-1 right-1 text-[9px] font-semibold text-crimson-700 bg-crimson-50 rounded-full px-1.5 min-w-[16px] text-center">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
