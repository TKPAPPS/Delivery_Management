import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import AppShell from '@/components/layout/AppShell';
import type { Profile } from '@/types';

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createSupabaseServerClient();
  // Middleware already validated the session — use getSession() to avoid
  // a redundant network round-trip to Supabase auth on every page load.
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (!profile?.active) {
    redirect('/pending');
  }

  const p = profile as Profile;

  return (
    <AppShell
      userEmail={p.email}
      userName={p.name ?? undefined}
      role={p.role}
    >
      {children}
    </AppShell>
  );
}
