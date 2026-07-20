'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, CalendarDays, List as ListIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useDebouncedCallback } from '@/lib/useDebouncedCallback';
import { cn, ymd, parseYMD } from '@/lib/utils';
import Button from '@/components/ui/Button';
import TaskCalendar from '@/components/tasks/TaskCalendar';
import WeekView from '@/components/tasks/WeekView';
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

type View = 'month' | 'week' | 'day' | 'list';

export default function TasksClient({ currentUserId, currentRole, users, customers }: Props) {
  const today = useMemo(() => ymd(new Date()), []);
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [view, setView] = useState<View>('month');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [showCompleted, setShowCompleted] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TaskWithRelations | null>(null);

  const selected = ymd(anchor);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks?include_completed=${showCompleted}`);
      if (!res.ok) return;
      const data = await res.json();
      setTasks(data.tasks ?? []);
    } catch { /* ignore */ }
  }, [showCompleted]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

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

  const dayTasks = useMemo(() => tasksByDate.get(selected) ?? [], [tasksByDate, selected]);
  const backlog = useMemo(
    () => tasks.filter((t) => !t.completed_at && (!t.due_date || t.due_date < today)),
    [tasks, today],
  );

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (t: TaskWithRelations) => { setEditing(t); setModalOpen(true); };
  const openDay = (key: string) => { setAnchor(parseYMD(key)); setView('day'); };

  // Navigation adapts to the active calendar view.
  const nav = (delta: number) => setAnchor((a) => {
    const d = new Date(a);
    if (view === 'month') d.setMonth(d.getMonth() + delta);
    else if (view === 'week') d.setDate(d.getDate() + delta * 7);
    else d.setDate(d.getDate() + delta);
    return d;
  });

  const navLabel = useMemo(() => {
    if (view === 'month') return anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (view === 'day') return anchor.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    // week range
    const offset = (anchor.getDay() + 6) % 7;
    const mon = new Date(anchor); mon.setDate(anchor.getDate() - offset);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const sameMonth = mon.getMonth() === sun.getMonth();
    const mL = mon.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const sL = sun.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    return sameMonth ? `${mon.getDate()}-${sL}` : `${mL} to ${sL}`;
  }, [view, anchor]);

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

  const VIEWS: Array<{ key: View; label: string }> = [
    { key: 'month', label: 'Month' },
    { key: 'week', label: 'Week' },
    { key: 'day', label: 'Day' },
    { key: 'list', label: 'List' },
  ];

  const Backlog = () => backlog.length > 0 ? (
    <div className="mt-5">
      <h3 className="text-sm font-semibold text-slate-500 mb-2">Backlog · undated &amp; overdue ({backlog.length})</h3>
      <div className="grid sm:grid-cols-2 gap-2">
        {backlog.map((t) => (
          <TaskCard key={t.id} task={t} currentUserId={currentUserId} currentRole={currentRole} users={users} onChanged={fetchTasks} onEdit={openEdit} />
        ))}
      </div>
    </div>
  ) : null;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Tasks</h1>
          <p className="text-sm text-slate-500">Shared reminders and to-dos for the team.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex text-xs border border-slate-200 rounded-lg overflow-hidden">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={cn('px-3 py-1.5 flex items-center gap-1', view === v.key ? 'bg-crimson-600 text-white' : 'text-slate-600 hover:bg-slate-50')}
              >
                {v.key === 'list' ? <ListIcon className="w-3.5 h-3.5" /> : <CalendarDays className="w-3.5 h-3.5" />}
                {v.label}
              </button>
            ))}
          </div>
          <Button onClick={openCreate} size="sm"><Plus className="w-4 h-4" /> New Task</Button>
        </div>
      </div>

      {/* Toolbar: date navigation (calendar views) + show completed */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        {view !== 'list' ? (
          <div className="flex items-center gap-2">
            <button onClick={() => nav(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600" aria-label="Previous"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm font-semibold text-slate-800 min-w-[9rem] text-center">{navLabel}</span>
            <button onClick={() => nav(1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600" aria-label="Next"><ChevronRight className="w-4 h-4" /></button>
            <button onClick={() => setAnchor(new Date())} className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Today</button>
          </div>
        ) : <span />}
        <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
          <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
          Show completed
        </label>
      </div>

      {view === 'month' && (
        <>
          <TaskCalendar month={anchor} tasksByDate={tasksByDate} today={today} onOpenDay={openDay} onEdit={openEdit} />
          <Backlog />
        </>
      )}

      {view === 'week' && (
        <>
          <WeekView anchor={anchor} tasksByDate={tasksByDate} today={today} onOpenDay={openDay} onEdit={openEdit} />
          <Backlog />
        </>
      )}

      {view === 'day' && (
        <div className="max-w-2xl">
          <DayTasksPanel
            selectedDate={selected}
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
      )}

      {view === 'list' && (
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
