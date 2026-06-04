export const runtime = 'nodejs';
// Sync iterates all confirmed orders sequentially; give it room so it doesn't get killed
// mid-run (which left logs stuck "running"). Capped by the Vercel plan's max.
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { parseBody } from '@/lib/parse-body';
import {
  odooConfigured,
  odooAuthenticate,
  odooExecuteKw,
  isOrderHandledInOdoo,
  ODOO_SYNC_STATES,
} from '@/lib/odoo';
import type { OdooSaleOrder, OdooOrderLine, OdooProduct, OdooPartner } from '@/lib/odoo';

// Compose a one-line address from Odoo partner fields (skips empty parts).
function composeAddress(p: OdooPartner): string | null {
  const parts = [p.street, p.street2, p.city, p.zip]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

type ErrorEntry = { order_ref?: string; odoo_line_id?: number; reason: string };
type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

// ---------------------------------------------------------------------------
// Line upsert
// ---------------------------------------------------------------------------

async function syncLines(
  admin: AdminClient,
  orderId: string,
  odooOrderRef: string,
  odooLines: OdooOrderLine[],
  productMap: Map<number, { code: string | null; name: string }>,
  errorDetails: ErrorEntry[],
): Promise<void> {
  const { data: existingLines } = await admin
    .from('order_lines')
    .select('id, odoo_line_id, qty_sent')
    .eq('order_id', orderId)
    .is('deleted_at', null);

  const existingByOdooId = new Map(
    (existingLines ?? [])
      .filter((l): l is typeof l & { odoo_line_id: number } => l.odoo_line_id != null)
      .map((l) => [l.odoo_line_id, l]),
  );
  const odooLineIds = new Set(odooLines.map((l) => l.id));

  for (const odooLine of odooLines) {
    const productId = Array.isArray(odooLine.product_id) ? odooLine.product_id[0] : null;
    const product = productId != null ? productMap.get(productId) : null;
    const productName =
      product?.name ?? (odooLine.name.split('\n')[0].trim() || 'Unknown Product');
    const productCode = product?.code ?? null;
    const qtyOrdered = Math.max(1, Math.round(odooLine.product_uom_qty));

    const existing = existingByOdooId.get(odooLine.id);

    if (!existing) {
      await admin.from('order_lines').insert({
        order_id: orderId,
        odoo_line_id: odooLine.id,
        odoo_product_id: productId,
        product_name: productName,
        product_code: productCode,
        qty_ordered: qtyOrdered,
        sale_order_number: odooOrderRef,
      });
    } else if (existing.qty_sent === 0) {
      await admin
        .from('order_lines')
        .update({
          product_name: productName,
          product_code: productCode,
          qty_ordered: qtyOrdered,
          odoo_product_id: productId,
        })
        .eq('id', existing.id);
    } else {
      errorDetails.push({
        order_ref: odooOrderRef,
        odoo_line_id: odooLine.id,
        reason: 'qty_sent > 0, line update skipped',
      });
    }
  }

  // Soft-delete lines that are no longer in Odoo
  for (const line of existingLines ?? []) {
    if (line.odoo_line_id != null && !odooLineIds.has(line.odoo_line_id)) {
      if (line.qty_sent === 0) {
        await admin
          .from('order_lines')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', line.id);
      } else {
        errorDetails.push({
          order_ref: odooOrderRef,
          odoo_line_id: line.odoo_line_id,
          reason: 'line removed from Odoo but qty_sent > 0, deletion skipped',
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// POST — trigger manual sync
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (ctx.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!odooConfigured()) {
    return NextResponse.json({ error: 'Odoo integration not configured' }, { status: 503 });
  }

  const parsed = await parseBody(req);
  if ('error' in parsed) return parsed.error;
  const { since, full } = parsed.data as { since?: string; full?: boolean };

  const admin = createSupabaseAdminClient();

  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  // Mark older "running" logs as failed — they were killed mid-run (e.g. function timeout) and
  // never wrote a result, so they'd otherwise sit "running" forever.
  await admin
    .from('odoo_sync_logs')
    .update({ status: 'failed', finished_at: new Date().toISOString(), error: 'Timed out or interrupted (auto-closed)' })
    .eq('status', 'running')
    .lt('started_at', tenMinAgo);

  // Reject if a sync is genuinely running (started within the last 10 minutes)
  const { data: runningSyncs } = await admin
    .from('odoo_sync_logs')
    .select('id')
    .eq('status', 'running')
    .gte('started_at', tenMinAgo)
    .limit(1);
  if ((runningSyncs ?? []).length > 0) {
    return NextResponse.json({ error: 'A sync is already running' }, { status: 409 });
  }

  // Create sync log
  const { data: logRow } = await admin
    .from('odoo_sync_logs')
    .insert({ status: 'running', triggered_by: ctx.user.id })
    .select('id')
    .single();
  if (!logRow) return NextResponse.json({ error: 'Failed to create sync log' }, { status: 500 });

  const syncLogId: string = logRow.id;
  const startTime = Date.now();
  let fetchedCount = 0;
  let createdCount = 0;
  let updatedCount = 0;
  let errorCount = 0;
  // Orders that are already handled in Odoo (invoiced/cancelled): skipped on create,
  // soft-deleted if they were still sitting as a pending order in our pool.
  let skippedCount = 0;
  let closedCount = 0;
  const errorDetails: ErrorEntry[] = [];

  try {
    const uid = await odooAuthenticate();

    // Incremental window: an explicit `since` wins; otherwise default to just before the last
    // successful sync (1h overlap to catch edge writes). `full: true` forces a complete pull.
    // First run (no completed sync yet) also pulls everything.
    let effectiveSince: string | null = since ?? null;
    if (!effectiveSince && !full) {
      const { data: lastOk } = await admin
        .from('odoo_sync_logs')
        .select('started_at')
        .eq('status', 'completed')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastOk?.started_at) {
        effectiveSince = new Date(new Date(lastOk.started_at).getTime() - 60 * 60 * 1000).toISOString();
      } else {
        // No completed sync yet — bootstrap with a bounded window so the first run finishes
        // (a full historical pull exceeds the function time limit). Older orders are already in
        // the DB from prior runs; use "Full resync" to re-pull everything.
        effectiveSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      }
    }
    // Odoo wants 'YYYY-MM-DD HH:MM:SS' (UTC, no zone marker).
    const odooSince = effectiveSince ? new Date(effectiveSince).toISOString().slice(0, 19).replace('T', ' ') : null;

    const domain: unknown[] = [['state', 'in', [...ODOO_SYNC_STATES]]];
    if (odooSince) domain.push(['write_date', '>=', odooSince]);

    const odooOrders = (await odooExecuteKw(uid, 'sale.order', 'search_read', [domain], {
      fields: ['id', 'name', 'partner_id', 'partner_shipping_id', 'note', 'date_order', 'state', 'invoice_status'],
      limit: 0,
    })) as OdooSaleOrder[];

    fetchedCount = odooOrders.length;

    if (odooOrders.length > 0) {
      const odooOrderIds = odooOrders.map((o) => o.id);

      const odooLines = (await odooExecuteKw(
        uid,
        'sale.order.line',
        'search_read',
        [[['order_id', 'in', odooOrderIds]]],
        { fields: ['id', 'order_id', 'product_id', 'name', 'product_uom_qty'] },
      )) as OdooOrderLine[];

      const productIds = Array.from(
        new Set(
          odooLines
            .map((l) => (Array.isArray(l.product_id) ? l.product_id[0] : null))
            .filter((id): id is number => id !== null),
        ),
      );

      const productMap = new Map<number, { code: string | null; name: string }>();
      if (productIds.length > 0) {
        const odooProducts = (await odooExecuteKw(uid, 'product.product', 'read', [productIds], {
          fields: ['id', 'default_code', 'display_name'],
        })) as OdooProduct[];
        for (const p of odooProducts) {
          productMap.set(p.id, { code: p.default_code || null, name: p.display_name });
        }
      }

      // Batch-read partner email + address (read-only) to snapshot onto each order.
      const partnerIds = Array.from(
        new Set(
          odooOrders
            .map((o) => (Array.isArray(o.partner_id) ? o.partner_id[0] : null))
            .filter((id): id is number => id !== null),
        ),
      );
      const partnerMap = new Map<number, { email: string | null; phone: string | null; address: string | null }>();
      if (partnerIds.length > 0) {
        const partners = (await odooExecuteKw(uid, 'res.partner', 'read', [partnerIds], {
          fields: ['id', 'email', 'phone', 'mobile', 'street', 'street2', 'city', 'zip'],
        })) as OdooPartner[];
        const str = (v: string | false) => (typeof v === 'string' && v.trim() ? v.trim() : null);
        // Odoo phone fields are often junk placeholders ("-", "0", "n/a"). Treat anything with
        // fewer than 5 digits as empty so it doesn't become a contact number.
        const phoneStr = (v: string | false) => {
          const s = typeof v === 'string' ? v.trim() : '';
          return s && (s.match(/\d/g) ?? []).length >= 5 ? s : null;
        };
        for (const p of partners) {
          partnerMap.set(p.id, {
            email: str(p.email),
            // Prefer mobile; `phone` is the landline (rarely used) and is only a fallback.
            phone: phoneStr(p.mobile) ?? phoneStr(p.phone),
            address: composeAddress(p),
          });
        }
      }

      // Group lines by Odoo order id
      const linesByOrderId = new Map<number, OdooOrderLine[]>();
      for (const line of odooLines) {
        const oid = Array.isArray(line.order_id)
          ? line.order_id[0]
          : (line.order_id as unknown as number);
        if (!linesByOrderId.has(oid)) linesByOrderId.set(oid, []);
        linesByOrderId.get(oid)!.push(line);
      }

      // Pre-fetch existing orders by ref in ONE query (was a SELECT per order). Includes
      // soft-deleted rows (the odoo_order_ref unique index is NOT partial, so a deleted row
      // keeps its ref): carries `status` so a now-handled order is only closed while it's an
      // unstarted `pending` order, and `deleted` so an order that became open again in Odoo
      // can be resurrected instead of hitting a unique-violation on re-insert.
      const existingByRef = new Map<string, { id: string; status: string; deleted: boolean }>();
      {
        // Chunk the ref list: a single .in() over all refs would exceed PostgREST's
        // 1000-row result cap on a full resync, silently dropping existing matches
        // (which would then look "new" and collide on the unique odoo_order_ref).
        const allRefs = odooOrders.map((o) => o.name);
        const REF_CHUNK = 500;
        for (let i = 0; i < allRefs.length; i += REF_CHUNK) {
          const { data: existingOrders } = await admin
            .from('orders')
            .select('id, odoo_order_ref, status, deleted_at')
            .in('odoo_order_ref', allRefs.slice(i, i + REF_CHUNK));
          for (const eo of (existingOrders ?? []) as { id: string; odoo_order_ref: string | null; status: string; deleted_at: string | null }[]) {
            if (eo.odoo_order_ref) existingByRef.set(eo.odoo_order_ref, { id: eo.id, status: eo.status, deleted: eo.deleted_at !== null });
          }
        }
      }

      // Process orders in small concurrent batches so a full sync finishes well within the
      // function limit (sequential per-order round-trips were timing out).
      const CONCURRENCY = 8;
      for (let start = 0; start < odooOrders.length; start += CONCURRENCY) {
        await Promise.all(odooOrders.slice(start, start + CONCURRENCY).map(async (odooOrder) => {
        try {
          const customerName = Array.isArray(odooOrder.partner_id)
            ? odooOrder.partner_id[1]
            : null;
          const partnerId = Array.isArray(odooOrder.partner_id) ? odooOrder.partner_id[0] : null;
          const partner = partnerId != null ? partnerMap.get(partnerId) : null;
          const customerEmail = partner?.email ?? null;
          const customerAddress = partner?.address ?? null;
          const customerPhone = partner?.phone ?? null;
          const destinationName = Array.isArray(odooOrder.partner_shipping_id)
            ? odooOrder.partner_shipping_id[1]
            : null;
          const notes = odooOrder.note || null;
          // Odoo returns datetimes as UTC "YYYY-MM-DD HH:MM:SS" with no zone marker.
          // Parse defensively: a malformed value becomes null, never an exception
          // that would abort this order's whole import.
          let orderDate: string | null = null;
          if (odooOrder.date_order) {
            const parsed = new Date(odooOrder.date_order.replace(' ', 'T') + 'Z');
            if (!isNaN(parsed.getTime())) orderDate = parsed.toISOString();
          }

          const existing = existingByRef.get(odooOrder.name) ?? null;
          const handled = isOrderHandledInOdoo(odooOrder);

          // Already invoiced/cancelled in Odoo => not an open delivery for us.
          if (handled) {
            if (!existing) {
              // Don't import handled history at all (keeps the pool clean on a full resync).
              skippedCount++;
            } else if (!existing.deleted && existing.status === 'pending') {
              // Soft-delete only while it's still an unstarted pending order; if it's already
              // on a delivery (assigned/etc.) the normal delivery flow owns its lifecycle, and
              // if it's already soft-deleted there's nothing to do.
              const now = new Date().toISOString();
              await admin.from('orders').update({ deleted_at: now, odoo_sync_log_id: syncLogId }).eq('id', existing.id);
              await admin.from('order_lines').update({ deleted_at: now }).eq('order_id', existing.id).is('deleted_at', null);
              closedCount++;
            }
            return;
          }

          let orderId: string;

          if (!existing) {
            const { data: newOrder, error } = await admin
              .from('orders')
              .insert({
                source: 'odoo',
                odoo_order_ref: odooOrder.name,
                odoo_sync_log_id: syncLogId,
                customer_name_manual: customerName,
                customer_email: customerEmail,
                customer_address: customerAddress,
                customer_phone: customerPhone,
                destination_manual: destinationName,
                notes,
                order_date: orderDate,
                priority: 3,
                status: 'pending',
              })
              .select('id')
              .single();
            if (error || !newOrder) throw new Error(error?.message ?? 'Insert failed');
            orderId = newOrder.id;
            createdCount++;
          } else {
            const patch: Record<string, unknown> = {
              customer_name_manual: customerName,
              customer_email: customerEmail,
              customer_address: customerAddress,
              customer_phone: customerPhone,
              destination_manual: destinationName,
              notes,
              order_date: orderDate,
              odoo_sync_log_id: syncLogId,
            };
            // It was soft-deleted (we'd closed it as handled) but is open again in Odoo:
            // bring it back as a pending order rather than leaving it stuck deleted.
            if (existing.deleted) {
              patch.deleted_at = null;
              patch.status = 'pending';
            }
            const { error } = await admin.from('orders').update(patch).eq('id', existing.id);
            if (error) throw new Error(error.message);
            orderId = existing.id;
            updatedCount++;
          }

          const orderLines = linesByOrderId.get(odooOrder.id) ?? [];
          await syncLines(admin, orderId, odooOrder.name, orderLines, productMap, errorDetails);
        } catch (err) {
          errorCount++;
          errorDetails.push({
            order_ref: odooOrder.name,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
        }));
      }
    }

    await admin
      .from('odoo_sync_logs')
      .update({
        status: 'completed',
        finished_at: new Date().toISOString(),
        fetched_count: fetchedCount,
        created_count: createdCount,
        updated_count: updatedCount,
        skipped_count: skippedCount,
        error_count: errorCount,
        error_details: errorDetails.length > 0 ? errorDetails : null,
        records_imported: createdCount + updatedCount,
        records_skipped: skippedCount,
      })
      .eq('id', syncLogId);

    return NextResponse.json({
      sync_log_id: syncLogId,
      fetched_count: fetchedCount,
      created_count: createdCount,
      updated_count: updatedCount,
      skipped_count: skippedCount,
      closed_count: closedCount,
      error_count: errorCount,
      duration_ms: Date.now() - startTime,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from('odoo_sync_logs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: message,
        error_count: errorCount,
        error_details: errorDetails.length > 0 ? errorDetails : null,
      })
      .eq('id', syncLogId);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
