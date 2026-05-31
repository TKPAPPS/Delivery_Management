import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { parseBody } from '@/lib/parse-body';
import { logActivity, ACTIONS } from '@/lib/activity';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user } = ctx;

  const parsed = await parseBody<{ to: string; subject?: string }>(req);
  if ('error' in parsed) return parsed.error;
  const { to, subject: customSubject } = parsed.data;

  if (!to?.trim()) {
    return NextResponse.json({ error: 'Recipient email address required' }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured', status: 'skipped' }, { status: 200 });
  }
  if (!fromEmail) {
    return NextResponse.json({ error: 'RESEND_FROM_EMAIL not configured', status: 'skipped' }, { status: 200 });
  }

  const admin = createSupabaseAdminClient();

  // Fetch card with customers and their sale orders
  const { data: card, error: cardError } = await admin
    .from('delivery_cards')
    .select(`
      *,
      driver:drivers(name, phone, vehicle_type, license_plate),
      customers:delivery_customers(
        *,
        sale_orders:customer_sale_orders(sale_order_number),
        extra_items:extra_delivery_items(item_name, quantity)
      )
    `)
    .eq('id', params.id)
    .single();

  if (cardError || !card) {
    return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  }

  // Fetch attachments and generate signed URLs
  const { data: attachments } = await admin
    .from('attachments')
    .select('file_name, storage_path')
    .eq('delivery_card_id', params.id)
    .order('created_at');

  const attachmentLinks: Array<{ name: string; url: string | null }> = await Promise.all(
    (attachments ?? []).map(async (att) => {
      const { data: signed } = await admin.storage
        .from('delivery-attachments')
        .createSignedUrl(att.storage_path, 86400);
      return { name: att.file_name, url: signed?.signedUrl ?? null };
    })
  );

  const subject = customSubject?.trim() || `Delivery Summary — ${card.delivery_ref}`;
  const body = buildSummaryText(card, attachmentLinks);

  // Log to communication_events before sending
  const { data: event } = await admin
    .from('communication_events')
    .insert({
      delivery_card_id: params.id,
      channel: 'email',
      recipient: to.trim(),
      subject,
      body,
      status: 'skipped',
      sent_by: user.id,
    })
    .select()
    .single();

  let status: 'sent' | 'failed' | 'skipped' = 'skipped';
  let error: string | null = null;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to.trim()],
        subject,
        text: body,
      }),
    });

    if (res.ok) {
      status = 'sent';
    } else {
      const txt = await res.text();
      error = `Resend error ${res.status}: ${txt}`;
      status = 'failed';
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    status = 'failed';
  }

  if (event) {
    await admin.from('communication_events').update({ status, error }).eq('id', event.id);
  }

  await logActivity(params.id, user.id, ACTIONS.CARD_UPDATED, {
    action: 'email_summary_sent',
    recipient: to.trim(),
    status,
  });

  if (status === 'failed') {
    return NextResponse.json({ error, status }, { status: 502 });
  }

  return NextResponse.json({ status, attachments_linked: attachmentLinks.length });
}

type CardRow = Record<string, unknown> & {
  delivery_ref: string;
  destination: string;
  planned_date: string | null;
  status: string;
  delivery_method: string;
  priority: string;
  internal_notes: string | null;
  delivery_notes: string | null;
  driver_name_manual: string | null;
  driver_phone_manual: string | null;
  courier_company_name: string | null;
  tracking_number: string | null;
  cargo_company_name: string | null;
  mawb_number: string | null;
  hawb_number: string | null;
  flight_number: string | null;
  cargo_etd: string | null;
  cargo_eta: string | null;
  other_method_name: string | null;
  other_tracking_ref: string | null;
  driver: { name: string; phone: string | null; vehicle_type: string | null; license_plate: string | null } | null;
  customers: Array<{
    customer_name: string;
    delivery_location: string | null;
    notes: string | null;
    sale_orders: Array<{ sale_order_number: string }>;
    extra_items: Array<{ item_name: string; quantity: string | null }>;
  }>;
};

function buildSummaryText(
  card: CardRow,
  attachmentLinks: Array<{ name: string; url: string | null }>
): string {
  const lines: string[] = [];

  lines.push(`DELIVERY SUMMARY`);
  lines.push(`================`);
  lines.push(`Reference:    ${card.delivery_ref}`);
  lines.push(`Destination:  ${card.destination}`);
  lines.push(`Status:       ${card.status}`);
  lines.push(`Priority:     ${card.priority}`);
  if (card.planned_date) lines.push(`Planned Date: ${card.planned_date}`);
  lines.push(``);

  // Logistics section
  lines.push(`LOGISTICS`);
  lines.push(`---------`);
  const method = card.delivery_method;
  if (method === 'car') {
    const driverName = card.driver?.name ?? card.driver_name_manual ?? 'Not assigned';
    const driverPhone = card.driver?.phone ?? card.driver_phone_manual ?? null;
    const vehicle = card.driver?.vehicle_type ?? null;
    const plate = card.driver?.license_plate ?? null;
    lines.push(`Method:  Car`);
    lines.push(`Driver:  ${driverName}${driverPhone ? ` (${driverPhone})` : ''}`);
    if (vehicle) lines.push(`Vehicle: ${vehicle}${plate ? ` — ${plate}` : ''}`);
  } else if (method === 'post') {
    lines.push(`Method:   Post / Courier`);
    if (card.courier_company_name) lines.push(`Courier:  ${card.courier_company_name}`);
    if (card.tracking_number) lines.push(`Tracking: ${card.tracking_number}`);
  } else if (method === 'air') {
    lines.push(`Method:   Air Freight`);
    if (card.cargo_company_name) lines.push(`Cargo Co: ${card.cargo_company_name}`);
    if (card.mawb_number) lines.push(`MAWB:     ${card.mawb_number}`);
    if (card.hawb_number) lines.push(`HAWB:     ${card.hawb_number}`);
    if (card.flight_number) lines.push(`Flight:   ${card.flight_number}`);
    if (card.cargo_etd) lines.push(`ETD:      ${card.cargo_etd}`);
    if (card.cargo_eta) lines.push(`ETA:      ${card.cargo_eta}`);
  } else if (method === 'other') {
    lines.push(`Method:    ${card.other_method_name ?? 'Other'}`);
    if (card.other_tracking_ref) lines.push(`Reference: ${card.other_tracking_ref}`);
  }
  lines.push(``);

  // Customers
  if (card.customers?.length > 0) {
    lines.push(`CUSTOMERS`);
    lines.push(`---------`);
    for (const c of card.customers) {
      const soList = c.sale_orders.map((s) => s.sale_order_number).join(', ');
      lines.push(`• ${c.customer_name}${c.delivery_location ? ` — ${c.delivery_location}` : ''}`);
      if (soList) lines.push(`  Sale Orders: ${soList}`);
      if (c.extra_items?.length > 0) {
        lines.push(`  Extra Items: ${c.extra_items.map((e) => `${e.item_name}${e.quantity ? ` (${e.quantity})` : ''}`).join(', ')}`);
      }
      if (c.notes) lines.push(`  Notes: ${c.notes}`);
    }
    lines.push(``);
  }

  // Notes
  if (card.internal_notes) {
    lines.push(`NOTES`);
    lines.push(`-----`);
    lines.push(card.internal_notes);
    lines.push(``);
  }
  if (card.delivery_notes) {
    lines.push(`DELIVERY NOTES`);
    lines.push(`--------------`);
    lines.push(card.delivery_notes);
    lines.push(``);
  }

  // Attachments
  if (attachmentLinks.length > 0) {
    lines.push(`ATTACHMENTS (links valid 24 hours)`);
    lines.push(`-----------------------------------`);
    for (const att of attachmentLinks) {
      if (att.url) {
        lines.push(`• ${att.name}`);
        lines.push(`  ${att.url}`);
      } else {
        lines.push(`• ${att.name} (link unavailable)`);
      }
    }
    lines.push(``);
  }

  lines.push(`---`);
  lines.push(`Sent from Delivery Board`);

  return lines.join('\n');
}
