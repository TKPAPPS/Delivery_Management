import { redirect } from 'next/navigation';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import TasksClient from './TasksClient';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  const ctx = await getSessionUser();
  if (!ctx) redirect('/login');

  // Admin client: any active user needs to see the full team + customer list for the pickers.
  const admin = createSupabaseAdminClient();
  const [{ data: users }, { data: customers }] = await Promise.all([
    admin.from('profiles').select('id, name, email').eq('active', true).order('name'),
    admin.from('customer_directory').select('id, name').eq('active', true).order('name'),
  ]);

  return (
    <TasksClient
      currentUserId={ctx.user.id}
      currentRole={ctx.profile.role}
      users={users ?? []}
      customers={customers ?? []}
    />
  );
}
