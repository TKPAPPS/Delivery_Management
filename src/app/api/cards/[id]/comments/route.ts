import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { logActivity, ACTIONS } from '@/lib/activity';
import { parseBody } from '@/lib/parse-body';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: comments, error } = await ctx.supabase
    .from('comments')
    .select('*, profile:profiles(id, name, email)')
    .eq('delivery_card_id', params.id)
    .order('created_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comments });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user } = ctx;

  const parsed = await parseBody<{ body: string }>(req);
  if ('error' in parsed) return parsed.error;
  const { body } = parsed.data;
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
