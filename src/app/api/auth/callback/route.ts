import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { pushLineMessage } from '@/lib/line';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: Record<string, unknown>) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: Record<string, unknown>) {
            cookieStore.set({ name, value: '', ...options });
          },
        },
      }
    );
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Fire-once LINE alert when a brand-new account is awaiting activation, so admins
      // notice it. Independent of the delivery master switch; never blocks login.
      try {
        const userId = data.session?.user?.id;
        const email = data.session?.user?.email;
        const target = process.env.LINE_DEFAULT_TARGET_ID;
        if (userId && target) {
          const admin = createSupabaseAdminClient();
          const { data: profile } = await admin
            .from('profiles')
            .select('active, pending_notified')
            .eq('id', userId)
            .single();
          if (profile && !profile.active && !profile.pending_notified) {
            const r = await pushLineMessage(target, [
              { type: 'text', text: `New account pending approval: ${email ?? userId}\nActivate at ${origin}/admin/users` },
            ]);
            // Only mark notified once the alert actually went out, so it isn't silently lost.
            if (r.ok) {
              await admin.from('profiles').update({ pending_notified: true }).eq('id', userId);
            }
          }
        }
      } catch (e) {
        console.error('[auth/callback] pending-signup alert failed:', e);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
