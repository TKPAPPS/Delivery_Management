export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { parseBody } from '@/lib/parse-body';
import {
  odooConfigured,
  odooAuthenticate,
  odooExecuteKw,
  ODOO_SYNC_STATES,
} from '@/lib/odoo';
import type { OdooSaleOrder, OdooOrderLine, OdooProduct } from '@/lib/odoo';

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
  const { since } = parsed.data as { since?: string };

  const admin = createSupabaseAdminClient();

  // Reject if a sync is already running (within last 10 minutes)
  const { data: runningSyncs } = await admin
    .from('odoo_sync_logs')
    .select('id')
    .eq('status', 'running')
    .gte('started_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
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
  const errorDetails: ErrorEntry[] = [];

  try {
    const uid = await odooAuthenticate();

    const domain: unknown[] = [['state', 'in', [...ODOO_SYNC_STATES]]];
    if (since) domain.push(['write_date', '>=', since]);

    const odooOrders = (await odooExecuteKw(uid, 'sale.order', 'search_read', [domain], {
      fields: ['id', 'name', 'partner_id', 'partner_shipping_id', 'note', 'date_order'],
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

      // Group lines by Odoo order id
      const linesByOrderId = new Map<number, OdooOrderLine[]>();
      for (const line of odooLines) {
        const oid = Array.isArray(line.order_id)
          ? line.order_id[0]
          : (line.order_id as unknown as number);
        if (!linesByOrderId.has(oid)) linesByOrderId.set(oid, []);
        linesByOrderId.get(oid)!.push(line);
      }

      for (const odooOrder of odooOrders) {
        try {
          const customerName = Array.isArray(odooOrder.partner_id)
            ? odooOrder.partner_id[1]
            : null;
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

          const { data: existing } = await admin
            .from('orders')
            .select('id')
            .eq('odoo_order_ref', odooOrder.name)
            .is('deleted_at', null)
            .maybeSingle();

          let orderId: string;

          if (!existing) {
            const { data: newOrder, error } = await admin
              .from('orders')
              .insert({
                source: 'odoo',
                odoo_order_ref: odooOrder.name,
                odoo_sync_log_id: syncLogId,
                customer_name_manual: customerName,
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
            const { error } = await admin
              .from('orders')
              .update({
                customer_name_manual: customerName,
                destination_manual: destinationName,
                notes,
                order_date: orderDate,
                odoo_sync_log_id: syncLogId,
              })
              .eq('id', existing.id);
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
        skipped_count: 0,
        error_count: errorCount,
        error_details: errorDetails.length > 0 ? errorDetails : null,
        records_imported: createdCount + updatedCount,
        records_skipped: 0,
      })
      .eq('id', syncLogId);

    return NextResponse.json({
      sync_log_id: syncLogId,
      fetched_count: fetchedCount,
      created_count: createdCount,
      updated_count: updatedCount,
      skipped_count: 0,
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
