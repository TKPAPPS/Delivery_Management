import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server';
import { logActivity, ACTIONS } from '@/lib/activity';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('active').eq('id', user.id).single();
  if (!profile?.active) return NextResponse.json({ error: 'Account not active' }, { status: 403 });

  const { data: comments, error } = await supabase
    .from('comments')
    .select('*, profile:profiles(id, name, email)')
    .eq('delivery_card_id', params.id)
    .order('created_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comments });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('active').eq('id', user.id).single();
  if (!profile?.active) return NextResponse.json({ error: 'Account not active' }, { status: 403 });

  const { body } = await req.json();
  if (!body?.trim()) return NextResponse.json({ error: 'Comment body is required' }, { status: 400 });

  const admin = createSupabaseAdminClient();

  const { data: comment, error } = await admin
    .from('comments')
    .insert({ delivery_card_id: params.id, user_id: user.id, body })
    .select('*, profile:profiles(id, name, email)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(params.id, user.id, ACTIONS.COMMENT_ADDED);

  return NextResponse.json({ comment }, { status: 201 });
}
