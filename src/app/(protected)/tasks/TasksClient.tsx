'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, CalendarDays, List as ListIcon } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useDebouncedCallback } from '@/lib/useDebouncedCallback';
import { cn } from '@/lib/utils';
import Button from '@/components/ui/Button';
import TaskCalendar, { ymd } from '@/components/tasks/TaskCalendar';
import DayTasksPanel from '@/components/tasks/DayTasksPanel';
import TaskCard from '@/components/tasks/TaskCard';
import CreateTaskModal, { type UserOption, type CustomerOption } from '@/components/tasks/CreateTaskModal';
import type { TaskWithRelations } from '@/types';

interface Props {
  currentUserId: string;
  currentRole: string;
  users: UserOption[];
  customers: CustomerOption[];
}

export default function TasksClient({ currentUserId, currentRole, users, customers }: Props) {
  const today = useMemo(() => ymd(new Date()), []);
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [month, setMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [showCompleted, setShowCompleted] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TaskWithRelations | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks?include_completed=${showCompleted}`);
      if (!res.ok) return;
      const data = await res.json();
      setTasks(data.tasks ?? []);
    } catch { /* ignore */ }
  }, [showCompleted]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Live refresh when any task changes.
  const debouncedRefetch = useDebouncedCallback(fetchTasks, 400);
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel('tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, debouncedRefetch)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [debouncedRefetch]);

  const tasksByDate = useMemo(() => {
    const m = new Map<string, TaskWithRelations[]>();
    for (const t of tasks) {
      if (t.due_date) {
        const arr = m.get(t.due_date) ?? [];
        arr.push(t);
        m.set(t.due_date, arr);
      }
    }
    return m;
  }, [tasks]);

  const dayTasks = useMemo(() => tasksByDate.get(selectedDate) ?? [], [tasksByDate, selectedDate]);
  const backlog = useMemo(
    () => tasks.filter((t) => !t.completed_at && (!t.due_date || t.due_date < today)),
    [tasks, today],
  );

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (t: TaskWithRelations) => { setEditing(t); setModalOpen(true); };

  const shiftMonth = (delta: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  // List view groups.
  const groups = useMemo(() => {
    const overdue: TaskWithRelations[] = [];
    const todayList: TaskWithRelations[] = [];
    const upcoming: TaskWithRelations[] = [];
    const undated: TaskWithRelations[] = [];
    const completed: TaskWithRelations[] = [];
    for (const t of tasks) {
      if (t.completed_at) { completed.push(t); continue; }
      if (!t.due_date) undated.push(t);
      else if (t.due_date < today) overdue.push(t);
      else if (t.due_date === today) todayList.push(t);
      else upcoming.push(t);
    }
    return { overdue, todayList, upcoming, undated, completed };
  }, [tasks, today]);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Tasks</h1>
          <p className="text-sm text-slate-500">Shared reminders and to-dos for the team.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex text-xs border border-slate-200 rounded-lg overflow-hidden">
            <button onClick={() => setView('calendar')} className={cn('px-3 py-1.5 flex items-center gap-1', view === 'calendar' ? 'bg-crimson-600 text-white' : 'text-slate-600 hover:bg-slate-50')}>
              <CalendarDays className="w-3.5 h-3.5" /> Calendar
            </button>
            <button onClick={() => setView('list')} className={cn('px-3 py-1.5 flex items-center gap-1', view === 'list' ? 'bg-crimson-600 text-white' : 'text-slate-600 hover:bg-slate-50')}>
              <ListIcon className="w-3.5 h-3.5" /> List
            </button>
          </div>
          <Button onClick={openCreate} size="sm"><Plus className="w-4 h-4" /> New Task</Button>
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-500 mb-3 cursor-pointer w-fit">
        <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
        Show completed
      </label>

      {view === 'calendar' ? (
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5">
          <TaskCalendar
            month={month}
            tasksByDate={tasksByDate}
            selectedDate={selectedDate}
            today={today}
            onSelectDate={setSelectedDate}
            onPrevMonth={() => shiftMonth(-1)}
            onNextMonth={() => shiftMonth(1)}
          />
          <DayTasksPanel
            selectedDate={selectedDate}
            today={today}
            dayTasks={dayTasks}
            backlog={backlog}
            currentUserId={currentUserId}
            currentRole={currentRole}
            users={users}
            onChanged={fetchTasks}
            onEdit={openEdit}
          />
        </div>
      ) : (
        <div className="space-y-6 max-w-2xl">
          {([
            ['Overdue', groups.overdue],
            ['Today', groups.todayList],
            ['Upcoming', groups.upcoming],
            ['No date', groups.undated],
            ...(showCompleted ? [['Completed', groups.completed] as const] : []),
          ] as Array<[string, TaskWithRelations[]]>).map(([label, list]) => list.length > 0 && (
            <div key={label}>
              <h3 className={cn('text-sm font-semibold mb-2', label === 'Overdue' ? 'text-red-600' : 'text-slate-600')}>{label} · {list.length}</h3>
              <div className="space-y-2">
                {list.map((t) => (
                  <TaskCard key={t.id} task={t} currentUserId={currentUserId} currentRole={currentRole} users={users} onChanged={fetchTasks} onEdit={openEdit} />
                ))}
              </div>
            </div>
          ))}
          {tasks.length === 0 && <p className="text-sm text-slate-400">No tasks yet. Create one to get started.</p>}
        </div>
      )}

      <CreateTaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={fetchTasks}
        users={users}
        customers={customers}
        task={editing}
      />
    </div>
  );
}
