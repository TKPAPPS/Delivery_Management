'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, ChevronDown, ChevronRight, Check, X, Clock, ListChecks } from 'lucide-react';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToastStore } from '@/store/toastStore';
import { formatDateTime } from '@/lib/utils';
import type { OdooSyncLog, OdooSyncErrorEntry } from '@/types';

interface ConfigStatus {
  url: boolean;
  db: boolean;
  username: boolean;
  apiKey: boolean;
}

interface SyncResult {
  sync_log_id: string;
  fetched_count: number;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  duration_ms: number;
}

interface ReconcileResult {
  pending_total: number;
  checked: number;
  not_found: number;
  handled: number;
  deleted: number;
  dry_run: boolean;
  handled_sample: string[];
}

interface Props {
  configured: boolean;
  configStatus: ConfigStatus;
  initialLogs: OdooSyncLog[];
}

function StatusBadge({ status }: { status: OdooSyncLog['status'] }) {
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700 font-medium">
        <Check className="w-3 h-3" /> completed
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 font-medium">
        <X className="w-3 h-3" /> failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700 font-medium">
      <Clock className="w-3 h-3" /> running
    </span>
  );
}

function ConfigRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-slate-700">{label}</span>
      {ok ? (
        <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
          <Check className="w-3.5 h-3.5" /> configured
        </span>
      ) : (
        <span className="text-xs font-medium text-red-500 flex items-center gap-1">
          <X className="w-3.5 h-3.5" /> missing
        </span>
      )}
    </div>
  );
}

function duration(log: OdooSyncLog): string {
  if (!log.finished_at) return '—';
  const ms = new Date(log.finished_at).getTime() - new Date(log.started_at).getTime();
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export default function SyncTrigger({ configured, configStatus, initialLogs }: Props) {
  const router = useRouter();
  const addToast = useToastStore((s) => s.addToast);
  const [syncing, setSyncing] = useState(false);
  const [since, setSince] = useState('');
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult | null>(null);
  const [confirmReconcile, setConfirmReconcile] = useState(false);

  const runReconcile = async (dryRun: boolean) => {
    setReconciling(true);
    try {
      const res = await fetch('/api/sync/odoo/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: dryRun }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Reconcile failed');
      setReconcileResult(data as ReconcileResult);
      if (dryRun) {
        addToast(`Preview: ${data.handled} of ${data.pending_total} open orders are already handled in Odoo`, 'success');
      } else {
        addToast(`Removed ${data.deleted} already-handled order${data.deleted === 1 ? '' : 's'} from the pool`, 'success');
        router.refresh();
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Reconcile failed', 'error');
    } finally {
      setReconciling(false);
    }
  };

  const handleSync = async (full = false) => {
    setSyncing(true);
    setLastResult(null);
    try {
      const body: Record<string, unknown> = {};
      if (full) body.full = true;
      else if (since.trim()) body.since = since.trim();
      const res = await fetch('/api/sync/odoo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Sync failed');
      setLastResult(data as SyncResult);
      addToast(
        `Sync complete — ${data.created_count} created, ${data.updated_count} updated${data.error_count > 0 ? `, ${data.error_count} errors` : ''}`,
        data.error_count > 0 ? 'error' : 'success',
      );
      router.refresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Configuration status */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Configuration</h2>
        <div className="divide-y divide-slate-100">
          <ConfigRow label="ODOO_URL" ok={configStatus.url} />
          <ConfigRow label="ODOO_DB" ok={configStatus.db} />
          <ConfigRow label="ODOO_USERNAME" ok={configStatus.username} />
          <ConfigRow label="ODOO_API_KEY" ok={configStatus.apiKey} />
        </div>
        {!configured && (
          <p className="mt-3 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
            One or more required environment variables are missing. Sync is disabled until all four are set.
          </p>
        )}
      </div>

      {/* Sync controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Manual Sync</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
              Sync since (optional)
            </label>
            <input
              type="datetime-local"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={syncing || !configured}
            />
            <p className="text-xs text-slate-400 mt-1">Leave blank to sync orders changed since the last sync. Use Full resync to re-pull everything.</p>
          </div>
          <Button
            onClick={() => handleSync(false)}
            loading={syncing}
            disabled={!configured}
          >
            <RefreshCw className="w-4 h-4" />
            {syncing ? 'Syncing…' : 'Sync Now'}
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSync(true)}
            disabled={syncing || !configured}
          >
            Full resync
          </Button>
        </div>

        {/* Last result */}
        {lastResult && (
          <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200 text-sm">
            <p className="font-medium text-slate-800 mb-2">Last sync result</p>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-center">
              {[
                { label: 'Fetched', value: lastResult.fetched_count },
                { label: 'Created', value: lastResult.created_count },
                { label: 'Updated', value: lastResult.updated_count },
                { label: 'Skipped', value: lastResult.skipped_count },
                { label: 'Errors', value: lastResult.error_count },
                { label: 'Duration', value: `${(lastResult.duration_ms / 1000).toFixed(1)}s` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white rounded-lg p-2 border border-slate-100">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="text-lg font-bold text-slate-800">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Reconcile open orders against Odoo */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-slate-500" /> Reconcile open orders
        </h2>
        <p className="text-xs text-slate-500 mb-4 max-w-2xl">
          Re-checks every order still sitting in the pool against Odoo and removes the ones already
          <span className="font-medium"> invoiced (delivery done) or cancelled</span>. Soft-delete only —
          removed orders are recoverable. Run <span className="font-medium">Preview</span> first to see how many would go.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => runReconcile(true)}
            loading={reconciling}
            disabled={!configured}
          >
            <ListChecks className="w-4 h-4" /> Preview (dry run)
          </Button>
          <Button
            variant="danger"
            onClick={() => setConfirmReconcile(true)}
            disabled={reconciling || !configured}
          >
            Reconcile now
          </Button>
        </div>

        {reconcileResult && (
          <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200 text-sm">
            <p className="font-medium text-slate-800 mb-2">
              {reconcileResult.dry_run ? 'Preview' : 'Reconcile'} result
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
              {[
                { label: 'Open checked', value: reconcileResult.pending_total },
                { label: 'Not found in Odoo', value: reconcileResult.not_found },
                { label: reconcileResult.dry_run ? 'Would remove' : 'Removed', value: reconcileResult.dry_run ? reconcileResult.handled : reconcileResult.deleted },
                { label: 'Remaining open', value: Math.max(0, reconcileResult.pending_total - (reconcileResult.dry_run ? reconcileResult.handled : reconcileResult.deleted)) },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white rounded-lg p-2 border border-slate-100">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="text-lg font-bold text-slate-800">{value}</p>
                </div>
              ))}
            </div>
            {reconcileResult.handled_sample?.length > 0 && (
              <p className="text-xs text-slate-400 mt-3 font-mono break-words">
                e.g. {reconcileResult.handled_sample.join(', ')}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Sync log history */}
      <div className="bg-white border border-slate-200 rounded-xl">
        <h2 className="text-sm font-semibold text-slate-900 px-5 py-4 border-b border-slate-100">
          Recent syncs ({initialLogs.length})
        </h2>
        {initialLogs.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">No sync history yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Started</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Duration</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Status</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Fetched</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Created</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Updated</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Errors</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {initialLogs.map((log) => (
                  <>
                    <tr
                      key={log.id}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() =>
                        setExpandedId(expandedId === log.id ? null : log.id)
                      }
                    >
                      <td className="px-4 py-3 text-slate-700 text-xs whitespace-nowrap">
                        {formatDateTime(log.started_at)}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{duration(log)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={log.status} />
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500">{log.fetched_count ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-500">{log.created_count ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-500">{log.updated_count ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        {(log.error_count ?? 0) > 0 ? (
                          <span className="text-red-600 font-medium">{log.error_count}</span>
                        ) : (
                          <span className="text-slate-400">{log.error_count ?? '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {(log.error || (log.error_details ?? []).length > 0) && (
                          expandedId === log.id
                            ? <ChevronDown className="w-4 h-4 text-slate-400" />
                            : <ChevronRight className="w-4 h-4 text-slate-400" />
                        )}
                      </td>
                    </tr>

                    {/* Expanded error details */}
                    {expandedId === log.id && (log.error || (log.error_details ?? []).length > 0) && (
                      <tr key={`${log.id}-details`}>
                        <td colSpan={8} className="px-4 pb-4 bg-red-50">
                          {log.error && (
                            <p className="text-xs text-red-700 font-medium mb-2 pt-3">{log.error}</p>
                          )}
                          {(log.error_details ?? []).length > 0 && (
                            <div className="space-y-1 pt-2">
                              {(log.error_details as OdooSyncErrorEntry[]).map((e, i) => (
                                <p key={i} className="text-xs text-red-700 font-mono">
                                  {e.order_ref ? `[${e.order_ref}]` : ''}
                                  {e.odoo_line_id != null ? ` line ${e.odoo_line_id}` : ''}
                                  {' — '}
                                  {e.reason}
                                </p>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmReconcile}
        onClose={() => setConfirmReconcile(false)}
        onConfirm={() => { setConfirmReconcile(false); void runReconcile(false); }}
        title="Reconcile open orders?"
        message={
          reconcileResult?.dry_run
            ? `This will remove ${reconcileResult.handled} already-handled order(s) from the pool (soft-delete, recoverable).`
            : 'This removes every open order that is already invoiced or cancelled in Odoo (soft-delete, recoverable). Run Preview first if you want a count.'
        }
        confirmLabel="Reconcile now"
        loading={reconciling}
      />
    </div>
  );
}
