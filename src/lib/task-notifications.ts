import { createSupabaseAdminClient } from './supabase-server';
import type { Task } from '@/types';

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/**
 * In-app notifications for a task (the bell). Inserts one `notifications` row per
 * recipient. Recipients:
 *   - assigned_all -> every active profile (excluding the creator on 'created')
 *   - else assigned_to -> that single user
 *   - else -> the creator
 * Fire-and-forget; never throws. Email/LINE are intentionally deferred — this
 * function is the single choke point where those channels get added later.
 */
export async function sendTaskNotification(admin: Admin, task: Task, kind: 'created' | 'due'): Promise<void> {
  try {
    let recipientIds: string[] = [];

    if (task.assigned_all) {
      const { data } = await admin.from('profiles').select('id').eq('active', true);
      recipientIds = (data ?? []).map((p) => p.id);
      if (kind === 'created' && task.created_by) {
        recipientIds = recipientIds.filter((id) => id !== task.created_by);
      }
    } else if (task.assigned_to) {
      recipientIds = [task.assigned_to];
    } else if (task.created_by) {
      recipientIds = [task.created_by];
    }

    if (recipientIds.length === 0) return;

    const title = kind === 'due' ? `Task due today: ${task.title}` : `New task: ${task.title}`;
    const rows = recipientIds.map((user_id) => ({
      user_id,
      title,
      body: task.body,
      entity_type: 'task',
      entity_id: task.id,
    }));

    await admin.from('notifications').insert(rows);
  } catch (err) {
    // Never break the request that triggered it.
    console.error('sendTaskNotification error:', err);
  }
}
