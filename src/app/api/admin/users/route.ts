import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server';

async function getAdminContext() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('role, active').eq('id', user.id).single();
  if (!profile?.active || profile.role !== 'admin') return null;
  return { user, admin: createSupabaseAdminClient() };
}

export async function GET() {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [{ data: users, error }, { data: pending }] = await Promise.all([
    ctx.admin.from('profiles').select('*').order('created_at', { ascending: false }),
    ctx.admin.from('pre_approved_emails').select('*').order('created_at', { ascending: false }),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users, pending: pending ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { email, role } = await req.json();
  if (!email?.trim()) return NextResponse.json({ error: 'Email is required' }, { status: 400 });

  const normalised = email.trim().toLowerCase();

  // If user already exists, just activate them
  const { data: existing } = await ctx.admin
    .from('profiles').select('id').eq('email', normalised).single();

  if (existing) {
    await ctx.admin.from('profiles').update({ active: true, role: role ?? 'sales' }).eq('id', existing.id);
    return NextResponse.json({ activated: true });
  }

  // Otherwise pre-approve so they're auto-activated on first sign-in
  const { error } = await ctx.admin
    .from('pre_approved_emails')
    .upsert({ email: normalised, role: role ?? 'sales' }, { onConflict: 'email' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pre_approved: true }, { status: 201 });
}
