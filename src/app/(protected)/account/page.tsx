import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase-server';
import AccountClient from './AccountClient';

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  logistics: 'Logistics',
  sales: 'Staff',
  stock_manager: 'Staff',
  warehouse: 'Staff',
};

export default async function AccountPage() {
  const ctx = await getSessionUser();
  if (!ctx) redirect('/login');
  const { data: profile } = await ctx.supabase
    .from('profiles')
    .select('name')
    .eq('id', ctx.user.id)
    .single();
  return (
    <AccountClient
      email={ctx.user.email ?? ''}
      name={(profile as { name: string | null } | null)?.name ?? ''}
      roleLabel={ROLE_LABEL[ctx.profile.role] ?? ctx.profile.role}
    />
  );
}
