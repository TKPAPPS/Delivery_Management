import { createSupabaseAdminClient } from './supabase-server';
import type { TaskEntityType, TaskLink } from '@/types';

type Admin = ReturnType<typeof createSupabaseAdminClient>;

const ENTITY_TYPES: TaskEntityType[] = ['customer', 'order', 'delivery_card'];

/** Validate + dedupe an incoming links array from a request body. */
export function sanitizeLinks(input: unknown): Array<{ entity_type: TaskEntityType; entity_id: string }> {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: Array<{ entity_type: TaskEntityType; entity_id: string }> = [];
  for (const raw of input) {
    const et = (raw as { entity_type?: string })?.entity_type;
    const id = (raw as { entity_id?: string })?.entity_id;
    if (!et || !id || !ENTITY_TYPES.includes(et as TaskEntityType)) continue;
    const key = `${et}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ entity_type: et as TaskEntityType, entity_id: id });
  }
  return out;
}

/** Replace all of a task's links with the given set (delete-then-insert). */
export async function writeTaskLinks(
  admin: Admin,
  taskId: string,
  links: Array<{ entity_type: TaskEntityType; entity_id: string }>,
): Promise<void> {
  await admin.from('task_links').delete().eq('task_id', taskId);
  if (links.length > 0) {
    await admin.from('task_links').insert(links.map((l) => ({ task_id: taskId, entity_type: l.entity_type, entity_id: l.entity_id })));
  }
}

/** Resolve display labels for a batch of links -> Map keyed by `${type}:${id}`. */
export async function resolveLinkLabels(admin: Admin, links: TaskLink[]): Promise<Map<string, string>> {
  const byType: Record<TaskEntityType, Set<string>> = { customer: new Set(), order: new Set(), delivery_card: new Set() };
  for (const l of links) if (byType[l.entity_type]) byType[l.entity_type].add(l.entity_id);
  const labels = new Map<string, string>();

  if (byType.customer.size) {
    const { data } = await admin.from('customer_directory').select('id, name').in('id', Array.from(byType.customer));
    for (const r of data ?? []) labels.set(`customer:${r.id}`, r.name);
  }
  if (byType.order.size) {
    const { data } = await admin.from('orders').select('id, order_ref, odoo_order_ref, customer_name_manual').in('id', Array.from(byType.order));
    for (const r of data ?? []) labels.set(`order:${r.id}`, r.odoo_order_ref || r.order_ref);
  }
  if (byType.delivery_card.size) {
    const { data } = await admin.from('delivery_cards').select('id, delivery_ref, destination').in('id', Array.from(byType.delivery_card));
    for (const r of data ?? []) labels.set(`delivery_card:${r.id}`, `${r.delivery_ref} — ${r.destination}`);
  }
  return labels;
}
