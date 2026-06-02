import crypto from 'crypto';

/**
 * Central LINE Messaging API client.
 *
 * Auth strategy (2026): a LINE bot uses a single *channel access token* (a bot credential), not a
 * per-user session. We prefer **stateless tokens** — minted on demand from the stable
 * `LINE_CHANNEL_ID` + `LINE_CHANNEL_SECRET`, valid 15 min, cached in module memory (~14 min). If
 * those aren't set we fall back to a long-lived `LINE_CHANNEL_ACCESS_TOKEN` so existing setups keep
 * working. Nothing configured → callers skip gracefully (null), exactly like before.
 *
 * Never throws — LINE problems must never crash a delivery workflow.
 */

const LINE_API = 'https://api.line.me';

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}
let cache: CachedToken | null = null;

/** Mint-and-cache a stateless token, or return the long-lived token, or null if unconfigured. */
export async function getLineToken(): Promise<string | null> {
  const channelId = process.env.LINE_CHANNEL_ID;
  const channelSecret = process.env.LINE_CHANNEL_SECRET;

  // Preferred: stateless token minted from channel id + secret.
  if (channelId && channelSecret) {
    if (cache && Date.now() < cache.expiresAt) return cache.token;
    try {
      const res = await fetch(`${LINE_API}/oauth2/v3/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: channelId,
          client_secret: channelSecret,
        }),
      });
      if (!res.ok) {
        console.warn('[line] stateless token mint failed:', res.status, await res.text().catch(() => ''));
        // Fall through to long-lived token if present.
      } else {
        const data = (await res.json()) as { access_token: string; expires_in: number };
        // Refresh 60s before actual expiry to avoid edge-of-window 401s.
        cache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
        return cache.token;
      }
    } catch (err) {
      console.warn('[line] stateless token mint exception:', err instanceof Error ? err.message : String(err));
      // Fall through.
    }
  }

  // Fallback: long-lived console token.
  return process.env.LINE_CHANNEL_ACCESS_TOKEN ?? null;
}

export interface PushResult {
  ok: boolean;
  status: 'sent' | 'failed' | 'skipped';
  error: string | null;
}

type LineMessage = { type: 'text'; text: string } | Record<string, unknown>;

/** Push messages to a LINE target (user/group/room). Retries once on 401 with a fresh token. */
export async function pushLineMessage(to: string, messages: LineMessage[]): Promise<PushResult> {
  let token = await getLineToken();
  if (!token) return { ok: false, status: 'skipped', error: 'LINE not configured' };

  const doPush = (t: string) =>
    fetch(`${LINE_API}/v2/bot/message/push`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, messages }),
    });

  try {
    let res = await doPush(token);

    // Token rejected/expired — drop cache, re-mint once, retry.
    if (res.status === 401) {
      cache = null;
      token = await getLineToken();
      if (!token) return { ok: false, status: 'skipped', error: 'LINE not configured' };
      res = await doPush(token);
    }

    if (res.ok) return { ok: true, status: 'sent', error: null };

    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false, status: 'failed', error: `LINE API error: ${res.status}${body.message ? ` — ${body.message}` : ''}` };
  } catch (err) {
    return { ok: false, status: 'failed', error: `LINE API exception: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Verify a LINE webhook request: base64(HMAC-SHA256(rawBody, channelSecret)) must equal the
 * `x-line-signature` header. Uses the raw (unparsed) body. Returns false if secret is missing.
 */
export function verifyLineSignature(rawBody: string, signature: string | null): boolean {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelSecret || !signature) return false;
  const expected = crypto.createHmac('SHA256', channelSecret).update(rawBody).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Maps internal NotificationType values to the trigger tokens used in /admin/communications. */
export const NOTIFICATION_TRIGGER_MAP: Record<string, string> = {
  status_pending_booking: 'pending_booking',
  status_booked: 'booked',
  status_in_transit: 'in_transit',
  status_delivered: 'delivered',
  card_created: 'card_created',
  urgent_card_created: 'urgent_card_created',
};
