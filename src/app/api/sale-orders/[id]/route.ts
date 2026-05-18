import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server';
import { logActivity, ACTIONS } from '@/lib/activity';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('active').eq('id', user.id).single();
  if (!profile?.active) return NextResponse.json({ error: 'Account not active' }, { status: 403 });

  const admin = createSupabaseAdminClient();

  const { data: so } = await admin
    .from('customer_sale_orders')
    .select('*, customer:delivery_customers(delivery_card_id)')
    .eq('id', params.id)
    .single();

  if (!so) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error } = await admin.from('customer_sale_orders').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const cardId = (so.customer as { delivery_card_id: string } | null)?.delivery_card_id;
  if (cardId) {
    await logActivity(cardId, user.id, ACTIONS.SALE_ORDER_REMOVED, { sale_order_number: so.sale_order_number });
  }

  return NextResponse.json({ success: true });
}
