import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { parseBody } from '@/lib/parse-body';
import { logActivity, ACTIONS } from '@/lib/activity';
import { sendTaskNotification } from '@/lib/task-notifications';
import { resolveLinkLabels, sanitizeLinks, writeTaskLinks } from '@/lib/task-links';
import type { Task, TaskLink, TaskWithRelations } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const includeCompleted = params.get('include_completed') === 'true';
  const scope = params.get('scope'); // 'mine' | null (all)

  const admin = createSupabaseAdminClient();
  let query = admin
    .from('tasks')
    .select('*, creator:profiles!created_by(name, email), assignee:profiles!assigned_to(name, email), task_links(entity_type, entity_id)')
    .is('deleted_at', null)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1000);

  if (!includeCompleted) query = query.is('completed_at', null);
  if (scope === 'mine') {
    query = query.or(`assigned_to.eq.${ctx.user.id},created_by.eq.${ctx.user.id},assigned_all.eq.true`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as Array<Task & { task_links: TaskLink[] }>;
  const allLinks = rows.flatMap((r) => r.task_links ?? []);
  const labels = await resolveLinkLabels(admin, allLinks);

  const tasks: TaskWithRelations[] = rows.map((r) => ({
    ...r,
    links: (r.task_links ?? []).map((l) => ({ ...l, label: labels.get(`${l.entity_type}:${l.entity_id}`) ?? null })),
  }));

  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = await parseBody(req);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data as {
    title?: string;
    body?: string;
    assigned_all?: boolean;
    assigned_to?: string | null;
    links?: Array<{ entity_type?: string; entity_id?: string }>;
    due_date?: string | null;
  };

  const title = (body.title ?? '').trim();
  if (!title) return NextResponse.json({ error: 'Subject is required' }, { status: 400 });

  const assignedAll = !!body.assigned_all;
  const links = sanitizeLinks(body.links);

  const insert = {
    type: 'other',
    title,
    body: body.body?.trim() || null,
    assigned_all: assignedAll,
    assigned_to: assignedAll ? null : (body.assigned_to || null),
    due_date: body.due_date || null,
    created_by: ctx.user.id,
  };

  const admin = createSupabaseAdminClient();
  const { data: task, error } = await admin.from('tasks').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeTaskLinks(admin, task.id, links);
  await logActivity(null, ctx.user.id, ACTIONS.TASK_CREATED, { title }, { entity_type: 'task', entity_id: task.id });
  void sendTaskNotification(admin, task as Task, 'created');

  return NextResponse.json({ task }, { status: 201 });
}
