import { createSupabaseAdminClient } from './supabase-server';
import { formatDate } from './utils';
import type { DeliveryStatus } from '@/types';

/**
 * Status-based customer email dispatch.
 *
 * On a card status change we look up the (global) active message_templates row for
 * that status and email every customer on the card who (a) has an email address and
 * (b) has receive_auto_emails = true. Each attempt is logged to communication_events.
 *
 * Email-only by design (no LINE). Never throws — failures are logged per-recipient so
 * a bad template or missing email never blocks the status change.
 */

interface TemplateVars {
  customer_name: string;
  driver_name: string;
  driver_phone: string;
  destination: string;
  delivery_ref: string;
  planned_date: string;
}

function render(tpl: string, vars: TemplateVars): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) =>
    key in vars ? String(vars[key as keyof TemplateVars] ?? '') : ''
  );
}

export async function sendStatusCustomerEmails(
  deliveryCardId: string,
  status: DeliveryStatus
): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();

    // 1. Active template for this status (one per status). No template → nothing to do.
    const { data: template } = await admin
      .from('message_templates')
      .select('subject, body, active')
      .eq('status', status)
      .eq('active', true)
      .maybeSingle();

    if (!template) return;

    // 2. Card + driver + customers
    const { data: card } = await admin
      .from('delivery_cards')
      .select(`
        delivery_ref, destination, planned_date, driver_name_manual, driver_phone_manual,
        driver:drivers(name, phone),
        customers:delivery_customers!delivery_card_id(customer_name, customer_email, receive_auto_emails)
      `)
      .eq('id', deliveryCardId)
      .single();

    if (!card) return;

    const driver = (card.driver ?? null) as { name?: string; phone?: string } | null;
    const driverName = driver?.name ?? card.driver_name_manual ?? '';
    const driverPhone = driver?.phone ?? card.driver_phone_manual ?? '';

    const recipients = ((card.customers ?? []) as Array<{
      customer_name: string; customer_email: string | null; receive_auto_emails: boolean;
    }>).filter((c) => c.receive_auto_emails && c.customer_email && c.customer_email.trim());

    if (recipients.length === 0) return;

    const resendKey = process.env.RESEND_API_KEY;
    const resendFrom = process.env.RESEND_FROM_EMAIL;

    for (const r of recipients) {
      const vars: TemplateVars = {
        customer_name: r.customer_name,
        driver_name: driverName,
        driver_phone: driverPhone,
        destination: card.destination ?? '',
        delivery_ref: card.delivery_ref ?? '',
        planned_date: card.planned_date ? formatDate(card.planned_date) : '',
      };
      const subject = render(template.subject, vars);
      const body = render(template.body, vars);
      // A customer's email field can hold several addresses (e.g. from Odoo: "a@x.com, b@y.com").
      // Split on commas/semicolons/whitespace and send to all of them.
      const addresses = (r.customer_email ?? '')
        .split(/[,;\s]+/)
        .map((a) => a.trim())
        .filter((a) => a.includes('@'));
      const recipient = addresses.join(', ') || (r.customer_email ?? '').trim();

      let sendStatus: 'sent' | 'failed' | 'skipped' = 'skipped';
      let error: string | null = null;

      if (addresses.length === 0) {
        error = 'No valid email address';
      } else if (!resendKey || !resendFrom) {
        error = 'Resend not configured (RESEND_API_KEY / RESEND_FROM_EMAIL missing)';
      } else {
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: resendFrom, to: addresses, subject, text: body }),
          });
          if (res.ok) {
            sendStatus = 'sent';
          } else {
            sendStatus = 'failed';
            error = `Resend error: ${res.status} ${await res.text().catch(() => '')}`;
          }
        } catch (err) {
          sendStatus = 'failed';
          error = `Resend exception: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      await admin.from('communication_events').insert({
        delivery_card_id: deliveryCardId,
        channel: 'email',
        recipient,
        subject,
        body,
        status: sendStatus,
        error,
        triggered_by: `auto_status:${status}`,
        sent_at: sendStatus === 'sent' ? new Date().toISOString() : null,
      });
    }
  } catch (err) {
    // Never let customer-messaging break the status change.
    console.error('[customer-messages] dispatch failed:', err);
  }
}
