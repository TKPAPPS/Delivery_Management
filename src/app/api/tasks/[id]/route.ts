import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { parseBody } from '@/lib/parse-body';
import { logActivity, ACTIONS } from '@/lib/activity';
import { sanitizeLinks, writeTaskLinks } from '@/lib/task-links';

const EDITABLE_KEYS = ['title', 'body', 'due_date', 'assigned_all', 'assigned_to', 'links'];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = await parseBody(req);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  const admin = createSupabaseAdminClient();
  const { data: task } = await admin.from('tasks').select('*').eq('id', params.id).is('deleted_at', null).single();
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  // Editing fields needs creator/assignee/admin. Completing is looser: a shared
  // "Everyone" task can be ticked off by any active user.
  const isPrivileged = ctx.profile.role === 'admin' || task.created_by === ctx.user.id || task.assigned_to === ctx.user.id;
  const touchesFields = EDITABLE_KEYS.some((k) => k in body);
  const allowed = touchesFields ? isPrivileged : (isPrivileged || task.assigned_all);
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const update: Record<string, unknown> = {};

  if (typeof body.completed === 'boolean') {
    update.completed_at = body.completed ? new Date().toISOString() : null;
  }
  if (typeof body.title === 'string') {
    const t = body.title.trim();
    if (!t) return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
    update.title = t;
  }
  if ('body' in body) update.body = (body.body as string)?.trim() || null;
  if ('due_date' in body) update.due_date = (body.due_date as string) || null;
  if (typeof body.assigned_all === 'boolean') {
    update.assigned_all = body.assigned_all;
    if (body.assigned_all) update.assigned_to = null;
  }
  if ('assigned_to' in body && update.assigned_all !== true) {
    update.assigned_to = (body.assigned_to as string) || null;
  }

  const hasLinks = 'links' in body;
  if (Object.keys(update).length === 0 && !hasLinks) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  let updated = task;
  if (Object.keys(update).length > 0) {
    const { data, error } = await admin.from('tasks').update(update).eq('id', params.id).select('*').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    updated = data;
  }
  if (hasLinks) {
    await writeTaskLinks(admin, params.id, sanitizeLinks(body.links));
  }

  const action = 'completed' in body ? (body.completed ? ACTIONS.TASK_COMPLETED : ACTIONS.TASK_UPDATED) : ACTIONS.TASK_UPDATED;
  await logActivity(null, ctx.user.id, action, { title: updated.title }, { entity_type: 'task', entity_id: params.id });

  return NextResponse.json({ task: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: task } = await admin.from('tasks').select('*').eq('id', params.id).is('deleted_at', null).single();
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  if (ctx.profile.role !== 'admin' && task.created_by !== ctx.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await admin.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(null, ctx.user.id, ACTIONS.TASK_DELETED, { title: task.title }, { entity_type: 'task', entity_id: params.id });
  return NextResponse.json({ success: true });
}
