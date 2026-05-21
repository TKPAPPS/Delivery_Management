import { redirect } from 'next/navigation';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { odooConfigured } from '@/lib/odoo';
import SyncTrigger from '@/components/sync/SyncTrigger';
import type { OdooSyncLog } from '@/types';

export const dynamic = 'force-dynamic';

export default async function OdooSyncPage() {
  const ctx = await getSessionUser();
  if (!ctx) redirect('/login');
  if (ctx.profile.role !== 'admin') redirect('/dashboard');

  const admin = createSupabaseAdminClient();
  const { data: logs } = await admin
    .from('odoo_sync_logs')
    .select(
      'id, started_at, finished_at, status, fetched_count, created_count, updated_count, skipped_count, error_count, error, error_details, triggered_by',
    )
    .order('started_at', { ascending: false })
    .limit(20);

  const configStatus = {
    url: !!process.env.ODOO_URL,
    db: !!process.env.ODOO_DB,
    username: !!process.env.ODOO_USERNAME,
    apiKey: !!process.env.ODOO_API_KEY,
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Odoo Sync</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Read-only import of confirmed sale orders from Odoo 18
        </p>
      </div>
      <SyncTrigger
        configured={odooConfigured()}
        configStatus={configStatus}
        initialLogs={(logs ?? []) as OdooSyncLog[]}
      />
    </div>
  );
}
