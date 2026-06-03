import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { logActivity, ACTIONS } from '@/lib/activity';
import { parseBody } from '@/lib/parse-body';
import { queryOrdersPage } from '@/lib/orders-query';

// Only admin and sales may create or mutate orders in Phase 2.
// Logistics and warehouse are read-only.
const CAN_WRITE_ROLES = ['admin', 'sales'];

export async function GET(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const pageParam = searchParams.get('page');

  const admin = createSupabaseAdminClient();

  try {
    const result = await queryOrdersPage(admin, {
      status: searchParams.get('status'),
      priority: searchParams.get('priority'),
      source: searchParams.get('source'),
      q: searchParams.get('q'),
      page: pageParam ? parseInt(pageParam, 10) : 1,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load orders' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user, profile } = ctx;

  if (!CAN_WRITE_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = await parseBody(req);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  const {
    customer_id,
    customer_name_manual,
    destination_id,
    destination_manual,
    notes,
    lines,
  } = body as {
    customer_id?: string;
    customer_name_manual?: string;
    destination_id?: string;
    destination_manual?: string;
    notes?: string;
    lines?: Array<{
      product_name: string;
      product_code?: string;
      sale_order_number?: string;
      qty_ordered: number;
      notes?: string;
    }>;
  };

  // Validate priority
  const rawPriority = body.priority !== undefined ? Number(body.priority) : 3;
  if (!Number.isInteger(rawPriority) || rawPriority < 1 || rawPriority > 5) {
    return NextResponse.json({ error: 'Priority must be an integer between 1 and 5' }, { status: 400 });
  }

  // Require at least one customer identifier
  if (!customer_id?.trim() && !customer_name_manual?.trim()) {
    return NextResponse.json({ error: 'Customer is required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { data: order, error: orderError } = await admin
    .from('orders')
    .insert({
      source: 'manual',
      customer_id: customer_id?.trim() || null,
      customer_name_manual: customer_name_manual?.trim() || null,
      destination_id: destination_id?.trim() || null,
      destination_manual: destination_manual?.trim() || null,
      priority: rawPriority,
      notes: notes?.trim() || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: orderError?.message ?? 'Failed to create order' }, { status: 500 });
  }

  // Insert lines
  if (Array.isArray(lines) && lines.length > 0) {
    for (const line of lines) {
      if (!line.product_name?.trim()) continue;
      const qty = Number(line.qty_ordered);
      if (!Number.isInteger(qty) || qty <= 0) continue;
      await admin.from('order_lines').insert({
        order_id: order.id,
        product_name: line.product_name.trim(),
        product_code: line.product_code?.trim() || null,
        sale_order_number: line.sale_order_number?.trim() || null,
        qty_ordered: qty,
        notes: line.notes?.trim() || null,
      });
    }
  }

  await logActivity(
    null,
    user.id,
    ACTIONS.ORDER_CREATED,
    { order_ref: order.order_ref },
    { entity_type: 'order', entity_id: order.id }
  );

  return NextResponse.json({ order }, { status: 201 });
}
