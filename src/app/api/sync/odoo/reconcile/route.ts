export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { parseBody } from '@/lib/parse-body';
import { odooConfigured, odooAuthenticate, odooExecuteKw, isOrderHandledInOdoo } from '@/lib/odoo';
import type { OdooSaleOrder } from '@/lib/odoo';

/**
 * Reconcile the open Orders Pool against Odoo's current state.
 *
 * The incremental sync only refetches orders changed since the last run and only in
 * state sale/done, so it can't clear the historical backlog of already-handled orders
 * (invoiced/delivered) nor catch cancellations. This pass looks up the *current* Odoo
 * status of every order still sitting `pending` in our pool and soft-deletes the ones
 * that are handled (invoice_status='invoiced' or state='cancel'). Reversible.
 *
 * POST body: { dry_run?: boolean } — dry_run reports what would be removed without writing.
 * Admin only. Read-only against Odoo; the only writes are local soft-deletes.
 */
export async function POST(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (ctx.profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!odooConfigured()) return NextResponse.json({ error: 'Odoo integration not configured' }, { status: 503 });

  const parsed = await parseBody(req);
  if ('error' in parsed) return parsed.error;
  const { dry_run } = parsed.data as { dry_run?: boolean };

  const admin = createSupabaseAdminClient();

  // Every order still sitting as an unstarted pending Odoo order in our pool. Paginate:
  // PostgREST caps a select at 1000 rows, and the backlog is larger than that.
  const rows: { id: string; odoo_order_ref: string }[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error: fetchErr } = await admin
      .from('orders')
      .select('id, odoo_order_ref')
      .eq('source', 'odoo')
      .eq('status', 'pending')
      .is('deleted_at', null)
      .not('odoo_order_ref', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    const batch = (data ?? []) as { id: string; odoo_order_ref: string }[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  const idByRef = new Map(rows.map((r) => [r.odoo_order_ref, r.id]));
  const refs = Array.from(idByRef.keys());

  if (refs.length === 0) {
    return NextResponse.json({ pending_total: 0, checked: 0, handled: 0, deleted: 0, not_found: 0, dry_run: !!dry_run });
  }

  const uid = await odooAuthenticate();

  // Read current Odoo state for those refs (no state filter so cancelled orders are visible too).
  const CHUNK = 200;
  const handledIds: string[] = [];
  const handledSample: string[] = [];
  let seen = 0;
  for (let i = 0; i < refs.length; i += CHUNK) {
    const chunk = refs.slice(i, i + CHUNK);
    const orders = (await odooExecuteKw(uid, 'sale.order', 'search_read', [[['name', 'in', chunk]]], {
      fields: ['name', 'state', 'invoice_status'],
    })) as Pick<OdooSaleOrder, 'name' | 'state' | 'invoice_status'>[];
    for (const o of orders) {
      seen++;
      if (typeof o.name === 'string' && isOrderHandledInOdoo(o)) {
        const id = idByRef.get(o.name);
        if (id) {
          handledIds.push(id);
          if (handledSample.length < 10) handledSample.push(o.name);
        }
      }
    }
  }

  let deleted = 0;
  if (!dry_run && handledIds.length > 0) {
    const now = new Date().toISOString();
    // Soft-delete in chunks (orders + their lines).
    for (let i = 0; i < handledIds.length; i += CHUNK) {
      const chunk = handledIds.slice(i, i + CHUNK);
      const { error, count } = await admin
        .from('orders')
        .update({ deleted_at: now }, { count: 'exact' })
        .in('id', chunk)
        .is('deleted_at', null);
      if (error) return NextResponse.json({ error: error.message, deleted }, { status: 500 });
      deleted += count ?? chunk.length;
      await admin.from('order_lines').update({ deleted_at: now }).in('order_id', chunk).is('deleted_at', null);
    }
  }

  return NextResponse.json({
    pending_total: refs.length,
    checked: seen,
    not_found: refs.length - seen,
    handled: handledIds.length,
    deleted,
    dry_run: !!dry_run,
    handled_sample: handledSample,
  });
}
