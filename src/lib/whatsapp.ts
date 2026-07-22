// WhatsApp Business Cloud API client. Native fetch, no SDK (mirrors src/lib/line.ts).
// Sends approved templates. Never throws; returns a small result object.

const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';

export interface WhatsAppResult {
  ok: boolean;
  status: number;
  error: string | null;
  messageId: string | null;
  skipped?: boolean; // true when not configured (so callers log 'skipped', not 'failed')
}

export function isWhatsAppConfigured(): boolean {
  return !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
}

export function getWhatsAppTemplateName(): string {
  return process.env.WHATSAPP_TEMPLATE_ON_THE_WAY || 'delivery_on_the_way';
}

export function getWhatsAppTemplateLang(): string {
  return process.env.WHATSAPP_TEMPLATE_LANG || 'en';
}

/**
 * Normalize a Thai phone number to WhatsApp's expected E.164 digits (no '+').
 * - strips spaces/dashes/parens and a leading '+'
 * - local '0XXXXXXXXX' -> '66XXXXXXXXX'
 * - already '66...' kept as-is
 * Returns null if it doesn't look like a usable number.
 */
export function normalizePhoneTH(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/[^\d+]/g, '');
  d = d.replace(/^\+/, '');
  if (d.startsWith('0')) d = '66' + d.slice(1);
  // bare 9-digit Thai mobile without country code or leading 0
  else if (d.length === 9 && d.startsWith('6') === false) d = '66' + d;
  if (d.length < 10 || d.length > 15) return null;
  return d;
}

/**
 * Send an approved template message. `bodyParams` fills the body {{1}}..{{n}} in order.
 * `doc` (optional) fills a document header (required if the template has one).
 */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  lang: string,
  bodyParams: string[],
  doc?: { link: string; filename: string },
): Promise<WhatsAppResult> {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneId || !token) {
    return { ok: false, status: 0, error: 'WhatsApp not configured (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN missing)', messageId: null, skipped: true };
  }

  const components: unknown[] = [];
  if (doc) {
    components.push({ type: 'header', parameters: [{ type: 'document', document: { link: doc.link, filename: doc.filename } }] });
  }
  components.push({ type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text: text || ' ' })) });

  try {
    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: { name: templateName, language: { code: lang }, components },
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      return { ok: true, status: res.status, error: null, messageId: json?.messages?.[0]?.id ?? null };
    }
    const errMsg = json?.error?.message || `WhatsApp error ${res.status}`;
    return { ok: false, status: res.status, error: errMsg, messageId: null };
  } catch (err) {
    return { ok: false, status: 0, error: `WhatsApp exception: ${err instanceof Error ? err.message : String(err)}`, messageId: null };
  }
}
