import type { createSupabaseAdminClient } from '@/lib/supabase-server';
import type { OrderListItem } from '@/types';

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Orders Pool page size. Server-side paginated so we never load all 1,000s of orders at once. */
export const ORDERS_PAGE_SIZE = 50;

// Statuses hidden under the default "Active (unassigned)" view.
const HANDLED_STATUSES = '("assigned","completed","cancelled")';

export interface OrdersQueryOpts {
  status?: string | null;   // '' / null = all; 'active' = not handled; else exact status
  priority?: string | null;
  source?: string | null;
  q?: string | null;
  page?: number;
  limit?: number;
}

export interface OrdersPage {
  orders: OrderListItem[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Single source of truth for the Orders Pool query — used by both the SSR page and
 * `GET /api/orders`. Filters + paginates server-side, and counts lines only for the
 * returned page (not all order_lines). All Odoo orders carry customer_name_manual /
 * destination_manual, so base-column search covers the data.
 */
export async function queryOrdersPage(admin: Admin, opts: OrdersQueryOpts): Promise<OrdersPage> {
  const limit = opts.limit ?? ORDERS_PAGE_SIZE;
  const page = Math.max(1, opts.page ?? 1);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // Apply the shared filter set to a query builder (reused for the data fetch and,
  // on an out-of-range page, the fallback count).
  // The admin client is untyped (see createSupabaseAdminClient), so the builder is `any` here.
  const applyFilters = (q: any) => {
    let query = q;
    if (opts.status === 'active') {
      query = query.not('status', 'in', HANDLED_STATUSES);
    } else if (opts.status) {
      query = query.eq('status', opts.status);
    }
    if (opts.priority) query = query.eq('priority', parseInt(opts.priority, 10));
    if (opts.source) query = query.eq('source', opts.source);
    if (opts.q && opts.q.trim()) {
      // Strip characters that have meaning in the PostgREST .or() filter grammar
      // (comma separates conditions; () group; * is the ilike wildcard; \ escapes).
      const term = opts.q.trim().replace(/[,()*\\]/g, ' ').trim();
      if (term) {
        const like = `*${term}*`;
        query = query.or(
          `order_ref.ilike.${like},odoo_order_ref.ilike.${like},customer_name_manual.ilike.${like},destination_manual.ilike.${like},notes.ilike.${like}`,
        );
      }
    }
    return query;
  };

  const query = applyFilters(
    admin
      .from('orders')
      .select(
        `*,
         customer:customer_directory!orders_customer_id_fkey(id, name),
         destination:destinations!orders_destination_id_fkey(id, name),
         creator:profiles!orders_created_by_fkey(id, name, email)`,
        { count: 'exact' },
      )
      .is('deleted_at', null),
  )
    .order('priority', { ascending: false })
    .order('order_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(from, to);

  const { data, count, error } = await query;
  if (error) {
    // Page past the end (e.g. rows removed underneath a stale page): return an empty
    // page with the real total rather than a 500.
    if (error.code === 'PGRST103' || /range not satisfiable/i.test(error.message)) {
      const { count: total } = await applyFilters(
        admin.from('orders').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      );
      return { orders: [], total: total ?? 0, page, limit };
    }
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Array<{ id: string }>;
  let lineCountMap: Record<string, number> = {};
  if (rows.length) {
    const ids = rows.map((o) => o.id);
    const { data: lineRows } = await admin
      .from('order_lines')
      .select('order_id')
      .in('order_id', ids)
      .is('deleted_at', null);
    lineCountMap = (lineRows ?? []).reduce<Record<string, number>>((acc, l) => {
      acc[l.order_id] = (acc[l.order_id] ?? 0) + 1;
      return acc;
    }, {});
  }

  const orders = rows.map((o) => ({ ...o, _count: { lines: lineCountMap[o.id] ?? 0 } })) as unknown as OrderListItem[];
  return { orders, total: count ?? 0, page, limit };
}
