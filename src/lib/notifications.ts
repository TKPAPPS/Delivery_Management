import { createSupabaseAdminClient } from './supabase-server';

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
    console.error('Failed to insert notification event:', insertError);
    return;
  }

  const message = buildMessage(type, payload);
  let status: 'sent' | 'failed' | 'skipped' = 'skipped';
  let error: string | null = null;

  const lineToken = process.env.LINE_NOTIFY_TOKEN;
  const resendKey = process.env.RESEND_API_KEY;
  const resendFrom = process.env.RESEND_FROM_EMAIL ?? 'notifications@delivery.local';
  const resendTo = process.env.NOTIFICATION_EMAIL;

  if (!lineToken && !resendKey) {
    console.warn(
      '[notifications] No LINE_NOTIFY_TOKEN or RESEND_API_KEY configured — notification skipped.'
    );
  }

  // Primary: LINE Notify
  if (lineToken) {
    try {
      const res = await fetch('https://notify-api.line.me/api/notify', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${lineToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ message }),
      });
      if (res.ok) {
        status = 'sent';
      } else {
        const text = await res.text();
        error = `LINE Notify error: ${res.status} ${text}`;
        status = 'failed';
      }
    } catch (err) {
      error = `LINE Notify exception: ${err instanceof Error ? err.message : String(err)}`;
      status = 'failed';
    }
  }

  // Fallback: Resend email (only if LINE was not sent successfully)
  if (status !== 'sent' && resendKey && resendTo) {
    try {
      const subject = buildSubject(type, payload);
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: resendFrom,
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
      return `\nNew delivery card created\n${ref} - ${dest}${date}`;
    case 'urgent_card_created':
      return `\n[URGENT] New urgent delivery card\n${ref} - ${dest}${date}`;
    case 'status_pending_booking':
      return `\nPending booking\n${ref} - ${dest}${date}`;
    case 'status_booked':
      return `\nBooked and confirmed\n${ref} - ${dest}${date}`;
    case 'status_in_transit':
      return `\nIn transit\n${ref} - ${dest}${date}`;
    case 'status_delivered':
      return `\nDelivery completed\n${ref} - ${dest}${date}`;
    case 'driver_assigned':
      return `\nDriver assigned\n${ref} - ${dest}\nDriver: ${payload.driverName ?? 'Unknown'}`;
    default:
      return `\nDelivery update: ${type}\n${ref} - ${dest}`;
  }
}
