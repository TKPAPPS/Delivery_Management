import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { logActivity, ACTIONS } from '@/lib/activity';
import { parseBody } from '@/lib/parse-body';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user } = ctx;

  const parsed = await parseBody<{ item_name: string; quantity?: string; notes?: string }>(req);
  if ('error' in parsed) return parsed.error;
  const { item_name, quantity, notes } = parsed.data;
  if (!item_name) return NextResponse.json({ error: 'Item name required' }, { status: 400 });

  const admin = createSupabaseAdminClient();

  const { data: customer } = await admin.from('delivery_customers').select('delivery_card_id').eq('id', params.id).single();

  const { data: item, error } = await admin
    .from('extra_delivery_items')
    .insert({ delivery_customer_id: params.id, item_name, quantity: quantity || null, notes: notes || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (customer) {
    await logActivity(customer.delivery_card_id, user.id, ACTIONS.EXTRA_ITEM_ADDED, { item_name });
  }

  return NextResponse.json({ item }, { status: 201 });
}
