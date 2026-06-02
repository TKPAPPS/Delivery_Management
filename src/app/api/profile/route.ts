import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { parseBody } from '@/lib/parse-body';

// PATCH: a user updates their OWN profile (display name only). Scoped to the caller's row;
// role/active are never changeable here (those are admin-only via /api/admin/users).
export async function PATCH(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = await parseBody<{ name?: string }>(req);
  if ('error' in parsed) return parsed.error;
  const name = (parsed.data.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('profiles').update({ name }).eq('id', ctx.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, name });
}
