import { createSupabaseAdminClient } from './supabase-server';
import { pushLineMessage, NOTIFICATION_TRIGGER_MAP } from './line';
import { getLineMasterEnabled } from './settings';
import { emailFrom } from './email';

export type NotificationType =
  | 'card_created'
  | 'status_pending_booking'
  | 'status_booked'
  | 'status_in_transit'
  | 'status_delivered'
  | 'driver_assigned'
  | 'urgent_card_created';

interface NotificationPayload {
  deliveryRef?: string;
  destination?: string;
  status?: string;
  priority?: string;
  plannedDate?: string;
  driverName?: string;
  [key: string]: unknown;
}

export async function sendNotification(
  type: NotificationType,
  deliveryCardId: string | null,
  payload: NotificationPayload
): Promise<void> {
  const supabase = createSupabaseAdminClient();

  const { data: event, error: insertError } = await supabase
    .from('notification_events')
    .insert({
      type,
      delivery_card_id: deliveryCardId,
      payload: payload as Record<string, unknown>,
      status: 'pending',
    })
    .select()
    .single();

  if (insertError || !event) {
    console.error('[notifications] Failed to insert notification event:', insertError);
    return;
  }

  const message = buildMessage(type, payload);
  let status: 'sent' | 'failed' | 'skipped' = 'skipped';
  let error: string | null = null;

  const lineConfigured = !!(
    (process.env.LINE_CHANNEL_ID && process.env.LINE_CHANNEL_SECRET) ||
    process.env.LINE_CHANNEL_ACCESS_TOKEN
  );
  const resendKey = process.env.RESEND_API_KEY;
  const resendFrom = process.env.RESEND_FROM_EMAIL;
  const resendTo = process.env.NOTIFICATION_EMAIL;

  // Warn when nothing is configured at all
  if (!lineConfigured && !resendKey) {
    console.warn('[notifications] No LINE credentials or RESEND_API_KEY configured — notification skipped.');
  }

  // Master kill switch — when off, mute the whole internal notification (no LINE, no fallback email).
  const masterEnabled = await getLineMasterEnabled(supabase);
  if (!masterEnabled) {
    await supabase
      .from('notification_events')
      .update({ status: 'skipped', error: 'LINE notifications disabled (master switch)', processed_at: new Date().toISOString() })
      .eq('id', event.id);
    return;
  }

  // Primary: LINE Messaging API. Routing is driven entirely by per-group auto_triggers on ACTIVE
  // groups — no hidden catch-all. An event no active group subscribes to is intentionally silent.
  let lineFailed = false;
  if (lineConfigured) {
    const trigger = NOTIFICATION_TRIGGER_MAP[type];
    let targets: string[] = [];

    if (trigger) {
      const { data: groups } = await supabase
        .from('line_groups')
        .select('line_target_id')
        .eq('active', true)
        .contains('auto_triggers', [trigger])
        .not('line_target_id', 'is', null);
      targets = ((groups ?? []) as { line_target_id: string | null }[])
        .map((g) => g.line_target_id)
        .filter((id): id is string => !!id);
    }

    if (targets.length === 0) {
      // No active group subscribes → silent by design (status stays 'skipped', no email fallback).
      console.warn(`[notifications] No active LINE group subscribes to '${trigger ?? type}' — skipped.`);
    } else {
      const errors: string[] = [];
      let anySent = false;
      for (const to of Array.from(new Set(targets))) {
        const r = await pushLineMessage(to, [{ type: 'text', text: message }]);
        if (r.ok) anySent = true;
        else if (r.error) errors.push(`${to}: ${r.error}`);
      }
      if (anySent) {
        status = 'sent';
      } else {
        status = 'failed';
        lineFailed = true;
        error = errors.join(' | ') || 'LINE send failed';
      }
    }
  }

  // Fallback email fires only when a LINE send was attempted and failed, OR when LINE isn't
  // configured at all. A deliberately-silent event (no subscribed group) does NOT trigger email.
  if ((lineFailed || !lineConfigured) && status !== 'sent' && resendKey) {
    if (!resendFrom) {
      console.warn('[notifications] RESEND_API_KEY set but RESEND_FROM_EMAIL missing — email skipped.');
    } else if (!resendTo) {
      console.warn('[notifications] RESEND_API_KEY set but NOTIFICATION_EMAIL missing — email skipped.');
    } else {
      try {
        const subject = buildSubject(type, payload);
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: emailFrom(resendFrom),
            to: [resendTo],
            subject,
            text: message,
          }),
        });
        if (res.ok) {
          status = 'sent';
          error = null;
        } else {
          const text = await res.text();
          const resendError = `Resend error: ${res.status} ${text}`;
          error = error ? `${error} | ${resendError}` : resendError;
          status = 'failed';
        }
      } catch (err) {
        const resendError = `Resend exception: ${err instanceof Error ? err.message : String(err)}`;
        error = error ? `${error} | ${resendError}` : resendError;
        status = 'failed';
      }
    }
  }

  await supabase
    .from('notification_events')
    .update({
      status,
      error,
      processed_at: new Date().toISOString(),
    })
    .eq('id', event.id);
}

function buildSubject(type: NotificationType, payload: NotificationPayload): string {
  const ref = payload.deliveryRef ?? 'Unknown';
  switch (type) {
    case 'card_created': return `New delivery card: ${ref}`;
    case 'urgent_card_created': return `[URGENT] New delivery card: ${ref}`;
    case 'status_pending_booking': return `Pending booking: ${ref}`;
    case 'status_booked': return `Booked: ${ref}`;
    case 'status_in_transit': return `In transit: ${ref}`;
    case 'status_delivered': return `Delivered: ${ref}`;
    case 'driver_assigned': return `Driver assigned: ${ref}`;
    default: return `Delivery update: ${ref}`;
  }
}

function buildMessage(type: NotificationType, payload: NotificationPayload): string {
  const ref = payload.deliveryRef ?? 'Unknown';
  const dest = payload.destination ?? 'Unknown destination';
  const date = payload.plannedDate ? ` | Planned: ${payload.plannedDate}` : '';

  switch (type) {
    case 'card_created':
      return `New delivery card created\n${ref} - ${dest}${date}`;
    case 'urgent_card_created':
      return `[URGENT] New urgent delivery card\n${ref} - ${dest}${date}`;
    case 'status_pending_booking':
      return `Pending booking\n${ref} - ${dest}${date}`;
    case 'status_booked':
      return `Booked and confirmed\n${ref} - ${dest}${date}`;
    case 'status_in_transit':
      return `In transit\n${ref} - ${dest}${date}`;
    case 'status_delivered':
      return `Delivery completed\n${ref} - ${dest}${date}`;
    case 'driver_assigned':
      return `Driver assigned\n${ref} - ${dest}\nDriver: ${payload.driverName ?? 'Unknown'}`;
    default:
      return `Delivery update: ${type}\n${ref} - ${dest}`;
  }
}
