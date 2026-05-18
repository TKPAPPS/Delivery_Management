import { createSupabaseAdminClient } from './supabase-server';

export type NotificationType =
  | 'card_created'
  | 'status_driver_needed'
  | 'status_driver_booked'
  | 'status_loaded'
  | 'urgent_card_created';

interface NotificationPayload {
  deliveryRef?: string;
  destination?: string;
  status?: string;
  priority?: string;
  plannedDate?: string;
  [key: string]: unknown;
}

export async function sendNotification(
  type: NotificationType,
  deliveryCardId: string | null,
  payload: NotificationPayload
): Promise<void> {
  const supabase = createSupabaseAdminClient();

  // Insert notification event
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

  // Attempt LINE Notify
  const lineToken = process.env.LINE_NOTIFY_TOKEN;
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

  // Update event status
  await supabase
    .from('notification_events')
    .update({
      status,
      error,
      processed_at: new Date().toISOString(),
    })
    .eq('id', event.id);
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
    case 'status_driver_needed':
      return `\nDriver needed\n${ref} - ${dest}${date}`;
    case 'status_driver_booked':
      return `\nDriver booked\n${ref} - ${dest}${date}`;
    case 'status_loaded':
      return `\nLoaded and ready\n${ref} - ${dest}${date}`;
    default:
      return `\nDelivery update: ${type}\n${ref} - ${dest}`;
  }
}
