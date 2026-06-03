import xmlrpc from 'xmlrpc';

// ---------------------------------------------------------------------------
// Odoo raw API response shapes
// ---------------------------------------------------------------------------

export interface OdooSaleOrder {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  partner_shipping_id: [number, string] | false;
  note: string | false;
  date_order: string | false;
}

export interface OdooOrderLine {
  id: number;
  order_id: [number, string];
  product_id: [number, string] | false;
  name: string;
  product_uom_qty: number;
}

export interface OdooProduct {
  id: number;
  default_code: string | false;
  display_name: string;
}

export interface OdooPartner {
  id: number;
  email: string | false;
  phone: string | false;
  mobile: string | false;
  street: string | false;
  street2: string | false;
  city: string | false;
  zip: string | false;
}

// ---------------------------------------------------------------------------
// Configurable sync filter — edit here to adjust which Odoo orders are synced
// ---------------------------------------------------------------------------

export const ODOO_SYNC_STATES = ['sale', 'done'] as const;

const ODOO_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Config check
// ---------------------------------------------------------------------------

export function odooConfigured(): boolean {
  return !!(
    process.env.ODOO_URL &&
    process.env.ODOO_DB &&
    process.env.ODOO_USERNAME &&
    process.env.ODOO_API_KEY
  );
}

// ---------------------------------------------------------------------------
// XML-RPC client factory
// ---------------------------------------------------------------------------

function makeClient(path: string): xmlrpc.Client {
  const base = process.env.ODOO_URL!;
  const url = new URL(path, base);
  const isHttps = url.protocol === 'https:';
  const port = url.port ? parseInt(url.port, 10) : (isHttps ? 443 : 80);
  const options = { host: url.hostname, port, path: url.pathname };
  return isHttps ? xmlrpc.createSecureClient(options) : xmlrpc.createClient(options);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Odoo request timed out after ${ms}ms`)), ms),
  );
  return Promise.race([promise, timeout]);
}

function callRpc(client: xmlrpc.Client, method: string, params: unknown[]): Promise<unknown> {
  return withTimeout(
    new Promise((resolve, reject) => {
      client.methodCall(method, params as any[], (err: Object, value: unknown) => {
        if (err) reject(err);
        else resolve(value);
      });
    }),
    ODOO_TIMEOUT_MS,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function odooAuthenticate(): Promise<number> {
  const client = makeClient('/xmlrpc/2/common');
  const uid = await callRpc(client, 'authenticate', [
    process.env.ODOO_DB!,
    process.env.ODOO_USERNAME!,
    process.env.ODOO_API_KEY!,
    {},
  ]);
  if (typeof uid !== 'number' || uid === 0) {
    throw new Error('Odoo authentication failed: check credentials');
  }
  return uid;
}

// Hard guarantee: this integration is READ-ONLY. Only these Odoo methods may be
// called via execute_kw. Any write method (create, write, unlink, copy, action_*,
// button_*, etc.) is rejected here before it can reach Odoo — there is no code
// path that can mutate Odoo, regardless of caller.
const ODOO_READ_ONLY_METHODS = [
  'search', 'search_read', 'read', 'search_count', 'read_group',
  'fields_get', 'name_get', 'name_search', 'default_get', 'check_access_rights',
] as const;

export async function odooExecuteKw(
  uid: number,
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {},
): Promise<unknown> {
  if (!ODOO_READ_ONLY_METHODS.includes(method as (typeof ODOO_READ_ONLY_METHODS)[number])) {
    throw new Error(
      `Odoo integration is read-only: method "${method}" on "${model}" is not permitted. ` +
      `Allowed methods: ${ODOO_READ_ONLY_METHODS.join(', ')}.`,
    );
  }
  const client = makeClient('/xmlrpc/2/object');
  return callRpc(client, 'execute_kw', [
    process.env.ODOO_DB!,
    uid,
    process.env.ODOO_API_KEY!,
    model,
    method,
    args,
    kwargs,
  ]);
}
