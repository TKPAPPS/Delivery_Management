import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server';
import { logActivity, ACTIONS } from '@/lib/activity';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role, active').eq('id', user.id).single();
  if (!profile?.active) return NextResponse.json({ error: 'Account not active' }, { status: 403 });

  const { data: card, error } = await supabase
    .from('delivery_cards')
    .select(`
      *,
      driver:drivers(*),
      creator:profiles!delivery_cards_created_by_fkey(id, name, email),
      customers:delivery_customers(
        *,
        sale_orders:customer_sale_orders(*),
        extra_items:extra_delivery_items(*)
      ),
      comments(
        *,
        profile:profiles(id, name, email)
      ),
      attachments(
        *,
        uploader:profiles!attachments_uploaded_by_fkey(id, name, email)
      ),
      activity_log(
        *,
        profile:profiles(id, name, email)
      )
    `)
    .eq('id', params.id)
    .single();

  if (error || !card) return NextResponse.json({ error: 'Card not found' }, { status: 404 });

  return NextResponse.json({ card });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role, active').eq('id', user.id).single();
  if (!profile?.active) return NextResponse.json({ error: 'Account not active' }, { status: 403 });

  const body = await req.json();
  const admin = createSupabaseAdminClient();

  // Get existing card for comparison
  const { data: existing } = await admin.from('delivery_cards').select('*').eq('id', params.id).single();
  if (!existing) return NextResponse.json({ error: 'Card not found' }, { status: 404 });

  const { data: card, error } = await admin
    .from('delivery_cards')
    .update(body)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log relevant activities
  if (body.is_archived) {
    await logActivity(params.id, user.id, ACTIONS.CARD_ARCHIVED);
  } else if (body.driver_id !== undefined || body.driver_name_manual !== undefined) {
    await logActivity(params.id, user.id, ACTIONS.DRIVER_UPDATED);
  } else {
    await logActivity(params.id, user.id, ACTIONS.CARD_UPDATED, { changes: Object.keys(body) });
  }

  return NextResponse.json({ card });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role, active').eq('id', user.id).single();
  if (!profile?.active || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('delivery_cards').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
