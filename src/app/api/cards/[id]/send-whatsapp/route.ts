import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createSupabaseAdminClient } from '@/lib/supabase-server';
import { parseBody } from '@/lib/parse-body';
import { formatDate } from '@/lib/utils';
import {
  isWhatsAppConfigured, getWhatsAppTemplateName, getWhatsAppTemplateLang,
  normalizePhoneTH, sendWhatsAppTemplate,
} from '@/lib/whatsapp';
import { buildAndUploadDeliveryNote, type DeliveryNoteCard, type DeliveryNoteCustomer } from '@/lib/delivery-note-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Admin = ReturnType<typeof createSupabaseAdminClient>;

function methodLabel(method: string | null, type: string | null): string {
  switch (method) {
    case 'car': return 'Car';
    case 'post': return 'Courier';
    case 'air': return 'Air cargo';
    case 'other': return type === 'our_motorcycle' || type === 'company_motorcycle' ? 'Motorcycle' : 'Other';
    default: return method || '';
  }
}

function maskPhone(p: string): string {
  const d = p.replace(/\D/g, '');
  return d.length <= 4 ? d : `••• ••• ${d.slice(-4)}`;
}

interface RawCustomer {
  id: string;
  customer_name: string;
  directory: { contact_number: string | null } | null;
  orders: Array<{ customer_phone: string | null }> | null;
  sale_orders: Array<{ sale_order_number: string }> | null;
  extra_items: Array<{ item_name: string; quantity: string | null }> | null;
}

const CARD_SELECT = `
  delivery_ref, destination, planned_date, delivery_method, delivery_type,
  driver_name_manual, driver_phone_manual,
  driver:drivers(name, phone),
  customers:delivery_customers!delivery_card_id(
    id, customer_name, customer_directory_id,
    directory:customer_directory(contact_number),
    orders(customer_phone),
    sale_orders:customer_sale_orders(sale_order_number),
    extra_items:extra_delivery_items(item_name, quantity)
  )
`;

function resolvePhone(c: RawCustomer): string | null {
  const dir = c.directory?.contact_number?.trim();
  if (dir) return dir;
  const fromOrder = (c.orders ?? []).map((o) => o.customer_phone?.trim()).find((p) => !!p);
  return fromOrder || null;
}

async function loadCard(admin: Admin, cardId: string) {
  const { data } = await admin.from('delivery_cards').select(CARD_SELECT).eq('id', cardId).single();
  return data as null | {
    delivery_ref: string; destination: string | null; planned_date: string | null;
    delivery_method: string | null; delivery_type: string | null;
    driver_name_manual: string | null; driver_phone_manual: string | null;
    driver: { name?: string; phone?: string } | null;
    customers: RawCustomer[] | null;
  };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const card = await loadCard(admin, params.id);
  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 });

  const recipients = (card.customers ?? []).map((c) => {
    const phone = resolvePhone(c);
    return {
      id: c.id,
      name: c.customer_name,
      phone_present: !!phone,
      phone_masked: phone ? maskPhone(phone) : null,
      sale_orders: (c.sale_orders ?? []).map((s) => s.sale_order_number),
    };
  });

  const { data: atts } = await admin
    .from('attachments')
    .select('id, file_name, file_type')
    .eq('delivery_card_id', params.id)
    .eq('file_type', 'application/pdf')
    .order('created_at', { ascending: false });

  return NextResponse.json({
    recipients,
    pdfs: (atts ?? []).map((a) => ({ id: a.id, file_name: a.file_name })),
    configured: isWhatsAppConfigured(),
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSessionUser();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = await parseBody(req);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data as { customer_ids?: string[]; pdf?: string; source?: string };
  const customerIds = new Set(body.customer_ids ?? []);
  const pdfChoice = body.pdf || 'auto';
  const source = body.source === 'transit' ? 'transit' : 'manual';
  if (customerIds.size === 0) return NextResponse.json({ error: 'No recipients selected' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const card = await loadCard(admin, params.id);
  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 });

  const driverName = card.driver?.name ?? card.driver_name_manual ?? '';
  const driverPhone = card.driver?.phone ?? card.driver_phone_manual ?? '';
  const destination = card.destination ?? '';
  const methodStr = methodLabel(card.delivery_method, card.delivery_type);
  const plannedStr = card.planned_date ? formatDate(card.planned_date) : '';

  // Shared custom PDF (same file to everyone) resolved once.
  let sharedDoc: { link: string; filename: string } | null = null;
  if (pdfChoice !== 'auto') {
    const { data: att } = await admin
      .from('attachments')
      .select('storage_path, file_name, file_type')
      .eq('id', pdfChoice)
      .eq('delivery_card_id', params.id)
      .single();
    if (!att || att.file_type !== 'application/pdf') {
      return NextResponse.json({ error: 'Selected PDF not found on this card' }, { status: 400 });
    }
    const { data: signed } = await admin.storage.from('delivery-attachments').createSignedUrl(att.storage_path, 86400);
    if (!signed?.signedUrl) return NextResponse.json({ error: 'Could not prepare the PDF' }, { status: 500 });
    sharedDoc = { link: signed.signedUrl, filename: att.file_name };
  }

  const templateName = getWhatsAppTemplateName();
  const lang = getWhatsAppTemplateLang();
  const ts = Date.now();
  const selected = (card.customers ?? []).filter((c) => customerIds.has(c.id));

  const results: Array<{ customer_id: string; name: string; status: 'sent' | 'failed' | 'skipped'; error: string | null }> = [];

  for (const c of selected) {
    const phoneRaw = resolvePhone(c);
    const to = normalizePhoneTH(phoneRaw);
    const saleOrders = (c.sale_orders ?? []).map((s) => s.sale_order_number);
    const bodyParams = [
      c.customer_name || '',
      saleOrders.join(', '),
      destination,
      methodStr,
      driverName,
      driverPhone,
      plannedStr,
    ];

    let status: 'sent' | 'failed' | 'skipped' = 'skipped';
    let error: string | null = null;

    if (!to) {
      error = 'No phone number';
    } else {
      // Resolve the document for this recipient.
      let doc: { link: string; filename: string } | null = sharedDoc;
      if (pdfChoice === 'auto') {
        const noteCard: DeliveryNoteCard = {
          delivery_ref: card.delivery_ref, destination, delivery_method_label: methodStr,
          planned_date: plannedStr, driver_name: driverName, driver_phone: driverPhone,
        };
        const noteCustomer: DeliveryNoteCustomer = {
          id: c.id, customer_name: c.customer_name, sale_orders: saleOrders,
          items: (c.extra_items ?? []).map((it) => ({ name: it.item_name, qty: it.quantity ?? '' })),
        };
        doc = await buildAndUploadDeliveryNote(admin, params.id, noteCard, noteCustomer, ts);
      }
      if (!doc) {
        error = 'Could not prepare the delivery-note PDF';
      } else {
        const r = await sendWhatsAppTemplate(to, templateName, lang, bodyParams, doc);
        if (r.ok) { status = 'sent'; }
        else { status = r.skipped ? 'skipped' : 'failed'; error = r.error; }
      }
    }

    await admin.from('communication_events').insert({
      delivery_card_id: params.id,
      channel: 'whatsapp',
      recipient: to ?? phoneRaw ?? c.customer_name,
      subject: `WhatsApp: ${templateName}`,
      body: `On the way -> ${c.customer_name} | SOs: ${saleOrders.join(', ') || '-'} | ${methodStr} | ${plannedStr}`,
      status,
      error,
      triggered_by: `whatsapp_${source}`,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
    });

    results.push({ customer_id: c.id, name: c.customer_name, status, error });
  }

  return NextResponse.json({
    results,
    sent: results.filter((r) => r.status === 'sent').length,
    failed: results.filter((r) => r.status === 'failed').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
  });
}
