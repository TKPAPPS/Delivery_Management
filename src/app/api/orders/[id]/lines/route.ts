import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { logActivity, ACTIONS } from '@/lib/activity';
import { parseBody } from '@/lib/parse-body';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();

  // Verify order exists
  const { data: order } = await admin.from('orders').select('id').eq('id', params.id).is('deleted_at', null).single();
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const { data: lines, error } = await admin
    .from('order_lines')
    .select('*')
    .eq('order_id', params.id)
    .is('deleted_at', null)
    .order('created_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lines: lines ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user } = ctx;

  const parsed = await parseBody(req);
  if ('error' in parsed) return parsed.error;
  const { product_name, product_code, sale_order_number, qty_ordered, notes } = parsed.data as {
    product_name: string;
    product_code?: string;
    sale_order_number?: string;
    qty_ordered: number;
    notes?: string;
  };

  if (!product_name?.trim()) {
    return NextResponse.json({ error: 'Product name is required' }, { status: 400 });
  }
  const qty = Number(qty_ordered);
  if (!Number.isInteger(qty) || qty <= 0) {
    return NextResponse.json({ error: 'qty_ordered must be a positive integer' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  // Verify order exists and is not completed/cancelled
  const { data: order } = await admin.from('orders').select('id, status').eq('id', params.id).is('deleted_at', null).single();
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (order.status === 'completed' || order.status === 'cancelled') {
    return NextResponse.json({ error: 'Cannot add lines to a completed or cancelled order' }, { status: 409 });
  }

  const { data: line, error } = await admin
    .from('order_lines')
    .insert({
      order_id: params.id,
      product_name: product_name.trim(),
      product_code: product_code?.trim() || null,
      sale_order_number: sale_order_number?.trim() || null,
      qty_ordered: qty,
      notes: notes?.trim() || null,
    })
    .select()
    .single();

  if (error || !line) return NextResponse.json({ error: error?.message ?? 'Failed to create line' }, { status: 500 });

  await logActivity(
    null,
    user.id,
    ACTIONS.ORDER_LINE_ADDED,
    { product_name: line.product_name, qty_ordered: line.qty_ordered },
    { entity_type: 'order', entity_id: params.id }
  );

  return NextResponse.json({ line }, { status: 201 });
}
