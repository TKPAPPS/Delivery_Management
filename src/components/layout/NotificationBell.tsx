'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { cn, timeAgo } from '@/lib/utils';
import type { AppNotification } from '@/types';

export default function NotificationBell({ userId }: { userId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);

  const fetchItems = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(15);
    setItems((data ?? []) as AppNotification[]);
  }, [userId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Live: my own new/updated notifications.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel('notifications-bell')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, fetchItems)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchItems]);

  const unread = items.filter((n) => !n.read_at).length;

  const markRead = async (ids: string[]) => {
    if (ids.length === 0) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids);
    setItems((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n)));
  };

  const onItemClick = async (n: AppNotification) => {
    if (!n.read_at) await markRead([n.id]);
    setOpen(false);
    if (n.entity_type === 'task') router.push('/tasks');
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-crimson-600 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
              <span className="text-sm font-semibold text-slate-900">Notifications</span>
              {unread > 0 && (
                <button onClick={() => markRead(items.filter((n) => !n.read_at).map((n) => n.id))} className="text-xs text-crimson-700 hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <p className="text-sm text-slate-400 px-4 py-6 text-center">No notifications yet.</p>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => onItemClick(n)}
                    className={cn('block w-full text-left px-4 py-2.5 hover:bg-slate-50 border-b border-slate-50', !n.read_at && 'bg-crimson-50/40')}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read_at && <span className="mt-1.5 w-2 h-2 rounded-full bg-crimson-600 flex-none" />}
                      <div className={cn('min-w-0', n.read_at && 'pl-4')}>
                        <p className="text-sm text-slate-800 font-medium truncate">{n.title}</p>
                        {n.body && <p className="text-xs text-slate-500 truncate">{n.body}</p>}
                        <p className="text-[11px] text-slate-400 mt-0.5">{timeAgo(n.created_at)}</p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
