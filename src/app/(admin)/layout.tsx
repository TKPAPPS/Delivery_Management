import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import AppShell from '@/components/layout/AppShell';
import type { Profile } from '@/types';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile?.active) {
    redirect('/pending');
  }

  if (profile.role !== 'admin' && profile.role !== 'logistics') {
    redirect('/dashboard');
  }

  return <AppShell profile={profile as Profile}>{children}</AppShell>;
}
