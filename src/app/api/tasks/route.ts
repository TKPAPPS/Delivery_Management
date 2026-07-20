import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { parseBody } from '@/lib/parse-body';
import { logActivity, ACTIONS } from '@/lib/activity';
import { sendTaskNotification } from '@/lib/task-notifications';
import type { Task, TaskEntityType } from '@/types';

export const dynamic = 'force-dynamic';

const ENTITY_TYPES: TaskEntityType[] = ['customer', 'order', 'delivery_card'];

// Resolve a human label for each task's linked entity (customer / order / card).
async function attachEntityLabels(admin: ReturnType<typeof createSupabaseAdminClient>, tasks: Task[]) {
  const byType: Record<string, Set<string>> = { customer: new Set(), order: new Set(), delivery_card: new Set() };
  for (const t of tasks) {
    if (t.entity_type && t.entity_id && byType[t.entity_type]) byType[t.entity_type].add(t.entity_id);
  }
  const labels = new Map<string, string>(); // `${type}:${id}` -> label

  if (byType.customer.size) {
    const { data } = await admin.from('customer_directory').select('id, name').in('id', Array.from(byType.customer));
    for (const r of data ?? []) labels.set(`customer:${r.id}`, r.name);
  }
  if (byType.order.size) {
    const { data } = await admin.from('orders').select('id, order_ref, odoo_order_ref').in('id', Array.from(byType.order));
    for (const r of data ?? []) labels.set(`order:${r.id}`, r.odoo_order_ref || r.order_ref);
  }
  if (byType.delivery_card.size) {
    const { data } = await admin.from('delivery_cards').select('id, delivery_ref, destination').in('id', Array.from(byType.delivery_card));
    for (const r of data ?? []) labels.set(`delivery_card:${r.id}`, `${r.delivery_ref} — ${r.destination}`);
  }

  return tasks.map((t) => ({
    ...t,
    entity_label: t.entity_type && t.entity_id ? labels.get(`${t.entity_type}:${t.entity_id}`) ?? null : null,
  }));
}

export async function GET(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const includeCompleted = params.get('include_completed') === 'true';
  const scope = params.get('scope'); // 'mine' | null (all)

  const admin = createSupabaseAdminClient();
  let query = admin
    .from('tasks')
    .select('*, creator:profiles!created_by(name, email), assignee:profiles!assigned_to(name, email)')
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

  const tasks = await attachEntityLabels(admin, (data ?? []) as unknown as Task[]);
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
    entity_type?: string | null;
    entity_id?: string | null;
    due_date?: string | null;
  };

  const title = (body.title ?? '').trim();
  if (!title) return NextResponse.json({ error: 'Subject is required' }, { status: 400 });

  const assignedAll = !!body.assigned_all;
  const entityType = body.entity_type && ENTITY_TYPES.includes(body.entity_type as TaskEntityType)
    ? (body.entity_type as TaskEntityType)
    : null;
  const entityId = entityType ? (body.entity_id || null) : null;

  const insert = {
    type: 'other',
    title,
    body: body.body?.trim() || null,
    assigned_all: assignedAll,
    assigned_to: assignedAll ? null : (body.assigned_to || null),
    entity_type: entityType,
    entity_id: entityId,
    due_date: body.due_date || null,
    created_by: ctx.user.id,
  };

  const admin = createSupabaseAdminClient();
  const { data: task, error } = await admin.from('tasks').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(null, ctx.user.id, ACTIONS.TASK_CREATED, { title }, { entity_type: 'task', entity_id: task.id });
  void sendTaskNotification(admin, task as Task, 'created');

  return NextResponse.json({ task }, { status: 201 });
}
