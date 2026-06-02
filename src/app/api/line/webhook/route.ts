import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { verifyLineSignature } from '@/lib/line';

// Needs Node crypto + the raw request body for HMAC signature verification.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface LineSource {
  type?: 'user' | 'group' | 'room';
  groupId?: string;
  roomId?: string;
  userId?: string;
}
interface LineEvent {
  type?: string;
  source?: LineSource;
}

/**
 * LINE Messaging API webhook.
 *
 * The X-Line-Signature HMAC *is* the authentication (middleware bypasses /api/*). On `join` or
 * `message` events from a group/room we auto-record the target ID into `line_groups` so admins
 * never have to hand-copy IDs. The LINE console "Verify" button sends a signed request with an
 * empty events array — that passes the signature check and returns 200.
 *
 * Always returns 200 on valid signatures (LINE retries non-2xx); capture is best-effort.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get('x-line-signature');

  if (!verifyLineSignature(raw, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  try {
    const body = JSON.parse(raw || '{}') as { events?: LineEvent[] };
    const events = body.events ?? [];

    // Collect distinct group/room target IDs from join/message events (ignore 1:1 users).
    const captured = new Map<string, 'group' | 'room'>();
    for (const ev of events) {
      if (ev.type !== 'join' && ev.type !== 'message') continue;
      const src = ev.source;
      if (src?.type === 'group' && src.groupId) captured.set(src.groupId, 'group');
      else if (src?.type === 'room' && src.roomId) captured.set(src.roomId, 'room');
    }

    if (captured.size > 0) {
      const admin = createSupabaseAdminClient();
      const ids = Array.from(captured.keys());

      // Skip ones already recorded (dedupe on line_target_id).
      const { data: existing } = await admin
        .from('line_groups')
        .select('line_target_id')
        .in('line_target_id', ids);
      const known = new Set(((existing ?? []) as { line_target_id: string | null }[]).map((g) => g.line_target_id));

      const today = new Date().toISOString().slice(0, 10);
      const rows = ids
        .filter((id) => !known.has(id))
        .map((id) => ({
          name: `LINE ${captured.get(id)} (captured ${today})`,
          line_target_id: id,
          auto_triggers: [] as string[],
        }));

      if (rows.length > 0) {
        await admin.from('line_groups').insert(rows);
      }
    }
  } catch (err) {
    // Never let a parse/DB hiccup turn into a non-200 (LINE would retry).
    console.error('[line/webhook] capture failed:', err instanceof Error ? err.message : String(err));
  }

  return NextResponse.json({ ok: true });
}
