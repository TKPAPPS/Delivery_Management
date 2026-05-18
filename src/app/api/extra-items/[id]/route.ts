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

  const { data: item } = await admin
    .from('extra_delivery_items')
    .select('*, customer:delivery_customers(delivery_card_id)')
    .eq('id', params.id)
    .single();

  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error } = await admin.from('extra_delivery_items').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const cardId = (item.customer as { delivery_card_id: string } | null)?.delivery_card_id;
  if (cardId) {
    await logActivity(cardId, user.id, ACTIONS.EXTRA_ITEM_REMOVED, { item_name: item.item_name });
  }

  return NextResponse.json({ success: true });
}
