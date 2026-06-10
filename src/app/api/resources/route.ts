import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { parseBody } from '@/lib/parse-body';

export async function GET() {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: resources, error } = await ctx.supabase
    .from('resources')
    .select('*')
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ resources });
}

export async function POST(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = await parseBody<{ name: string; url: string; description?: string; category?: string }>(req);
  if ('error' in parsed) return parsed.error;
  const { name, url, description, category } = parsed.data;
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  if (!url?.trim()) return NextResponse.json({ error: 'URL is required' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: resource, error } = await admin
    .from('resources')
    .insert({
      name: name.trim(),
      url: url.trim(),
      description: description?.trim() || null,
      category: category?.trim() || 'Other',
      created_by: ctx.user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ resource }, { status: 201 });
}
