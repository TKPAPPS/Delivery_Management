import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { logActivity, ACTIONS } from '@/lib/activity';
import { parseBody } from '@/lib/parse-body';

const CAN_WRITE_ROLES = ['admin', 'sales'];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user, profile } = ctx;

  if (!CAN_WRITE_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = await parseBody(req);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  const admin = createSupabaseAdminClient();

  const { data: line } = await admin
    .from('order_lines')
    .select('id, order_id')
    .eq('id', params.id)
    .is('deleted_at', null)
    .single();
  if (!line) return NextResponse.json({ error: 'Order line not found' }, { status: 404 });

  // Verify parent order is editable
  const { data: order } = await admin.from('orders').select('status').eq('id', line.order_id).is('deleted_at', null).single();
  if (!order) return NextResponse.json({ error: 'Parent order not found' }, { status: 404 });
  if (order.status === 'completed' || order.status === 'cancelled') {
    return NextResponse.json({ error: 'Cannot edit lines on a completed or cancelled order' }, { status: 409 });
  }

  // Whitelist editable fields — never allow order_id/qty_sent/status/deleted_at from client
  const allowed: Record<string, unknown> = {};
  const editableFields = ['product_name', 'product_code', 'sale_order_number', 'notes'];
  for (const field of editableFields) {
    if (field in body) allowed[field] = (body[field] as unknown) ?? null;
  }

  if ('qty_ordered' in body) {
    const qty = Number(body.qty_ordered);
    if (!Number.isInteger(qty) || qty <= 0) {
      return NextResponse.json({ error: 'qty_ordered must be a positive integer' }, { status: 400 });
    }
    allowed.qty_ordered = qty;
  }

  if ('product_name' in allowed && !String(allowed.product_name ?? '').trim()) {
    return NextResponse.json({ error: 'Product name cannot be empty' }, { status: 400 });
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 });
  }

  const { data: updated, error } = await admin.from('order_lines').update(allowed).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(
    null,
    user.id,
    ACTIONS.ORDER_LINE_UPDATED,
    { changed: Object.keys(allowed) },
    { entity_type: 'order', entity_id: line.order_id }
  );

  return NextResponse.json({ line: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user, profile } = ctx;

  if (!CAN_WRITE_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();

  const { data: line } = await admin
    .from('order_lines')
    .select('id, order_id')
    .eq('id', params.id)
    .is('deleted_at', null)
    .single();
  if (!line) return NextResponse.json({ error: 'Order line not found' }, { status: 404 });

  // Verify parent order is editable
  const { data: order } = await admin.from('orders').select('status').eq('id', line.order_id).is('deleted_at', null).single();
  if (!order) return NextResponse.json({ error: 'Parent order not found' }, { status: 404 });
  if (order.status === 'completed' || order.status === 'cancelled') {
    return NextResponse.json({ error: 'Cannot delete lines on a completed or cancelled order' }, { status: 409 });
  }

  const { error } = await admin.from('order_lines').update({ deleted_at: new Date().toISOString() }).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(
    null,
    user.id,
    ACTIONS.ORDER_LINE_DELETED,
    {},
    { entity_type: 'order', entity_id: line.order_id }
  );

  return NextResponse.json({ success: true });
}
