import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { parseBody } from '@/lib/parse-body';

export async function GET() {
  const ctx = await getSessionUser();
  if (!ctx || ctx.profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = createSupabaseAdminClient();
  const [{ data: users, error }, { data: pending }] = await Promise.all([
    admin.from('profiles').select('*').order('created_at', { ascending: false }),
    admin.from('pre_approved_emails').select('*').order('created_at', { ascending: false }),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users, pending: pending ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx || ctx.profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const parsed = await parseBody<{ email: string; role?: string }>(req);
  if ('error' in parsed) return parsed.error;
  const { email, role } = parsed.data;
  if (!email?.trim()) return NextResponse.json({ error: 'Email is required' }, { status: 400 });

  const normalised = email.trim().toLowerCase();
  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin.from('profiles').select('id').eq('email', normalised).single();

  if (existing) {
    await admin.from('profiles').update({ active: true, role: role ?? 'sales' }).eq('id', existing.id);
    return NextResponse.json({ activated: true });
  }

  const { error } = await admin
    .from('pre_approved_emails')
    .upsert({ email: normalised, role: role ?? 'sales' }, { onConflict: 'email' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pre_approved: true }, { status: 201 });
}
