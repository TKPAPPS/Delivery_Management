import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { logActivity, ACTIONS } from '@/lib/activity';
import { parseBody } from '@/lib/parse-body';

const CAN_WRITE_ROLES = ['admin', 'sales'];

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();

  const { data: order, error } = await admin
    .from('orders')
    .select(`
      *,
      customer:customer_directory!orders_customer_id_fkey(id, name),
      destination:destinations!orders_destination_id_fkey(id, name),
      creator:profiles!orders_created_by_fkey(id, name, email)
    `)
    .eq('id', params.id)
    .is('deleted_at', null)
    .single();

  if (error || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  // Lines and activity in parallel
  const [{ data: lines }, { data: activityLog }] = await Promise.all([
    admin.from('order_lines').select('*').eq('order_id', params.id).is('deleted_at', null).order('created_at'),
    admin
      .from('activity_log')
      .select('*, profile:profiles(id, name, email)')
      .eq('entity_type', 'order')
      .eq('entity_id', params.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  return NextResponse.json({ order: { ...order, lines: lines ?? [], activity_log: activityLog ?? [] } });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user, profile } = ctx;

  // Logistics and warehouse are read-only in Phase 2
  if (!CAN_WRITE_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = await parseBody(req);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin.from('orders').select('*').eq('id', params.id).is('deleted_at', null).single();
  if (!existing) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  // Whitelist editable fields.
  // status is intentionally excluded: no workflow exists yet to drive status transitions.
  const allowed: Record<string, unknown> = {};
  const editableFields = [
    'customer_id', 'customer_name_manual',
    'destination_id', 'destination_manual',
    'notes',
  ];
  for (const field of editableFields) {
    if (field in body) allowed[field] = (body[field] as unknown) ?? null;
  }

  // Priority validation
  if ('priority' in body) {
    const p = Number(body.priority);
    if (!Number.isInteger(p) || p < 1 || p > 5) {
      return NextResponse.json({ error: 'Priority must be an integer between 1 and 5' }, { status: 400 });
    }
    allowed.priority = p;
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 });
  }

  const { data: updated, error } = await admin.from('orders').update(allowed).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(
    null,
    user.id,
    ACTIONS.ORDER_UPDATED,
    { changed: Object.keys(allowed) },
    { entity_type: 'order', entity_id: params.id }
  );

  return NextResponse.json({ order: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user, profile } = ctx;

  // Soft delete is admin-only
  if (profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin.from('orders').select('id').eq('id', params.id).is('deleted_at', null).single();
  if (!existing) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const { error } = await admin.from('orders').update({ deleted_at: new Date().toISOString() }).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(
    null,
    user.id,
    ACTIONS.ORDER_DELETED,
    {},
    { entity_type: 'order', entity_id: params.id }
  );

  return NextResponse.json({ success: true });
}
