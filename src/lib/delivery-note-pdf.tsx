import React from 'react';
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import type { createSupabaseAdminClient } from './supabase-server';

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export interface DeliveryNoteCard {
  delivery_ref: string;
  destination: string;
  delivery_method_label: string;
  planned_date: string; // pre-formatted (e.g. dd/mm/yyyy) or ''
  driver_name: string;
  driver_phone: string;
}

export interface DeliveryNoteCustomer {
  id: string;
  customer_name: string;
  sale_orders: string[];
  items: Array<{ name: string; qty: string }>;
}

const CRIMSON = '#7d1535';
const GOLD = '#c4963a';
const INK = '#22262e';
const MUTED = '#6b7280';

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 44, paddingHorizontal: 44, fontSize: 10, color: INK, fontFamily: 'Helvetica' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 2, borderBottomColor: CRIMSON, paddingBottom: 10 },
  brandKosher: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: CRIMSON, letterSpacing: 1 },
  brandDelivery: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: GOLD, letterSpacing: 3, marginTop: 2 },
  docTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: INK, textAlign: 'right' },
  docRef: { fontSize: 10, color: MUTED, textAlign: 'right', marginTop: 2 },

  customerName: { fontSize: 15, fontFamily: 'Helvetica-Bold', marginTop: 20 },
  destination: { fontSize: 10, color: MUTED, marginTop: 2 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16 },
  field: { width: '50%', marginBottom: 10 },
  label: { fontSize: 8, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  value: { fontSize: 11 },

  sectionTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: CRIMSON, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 6 },
  soRow: { fontSize: 11 },

  tableHead: { flexDirection: 'row', backgroundColor: '#f4ecec', paddingVertical: 4, paddingHorizontal: 6, borderRadius: 3 },
  th: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: CRIMSON, textTransform: 'uppercase' },
  tr: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: '#e6e8ec' },
  tdItem: { width: '82%', fontSize: 10 },
  tdQty: { width: '18%', fontSize: 10, textAlign: 'right' },

  footer: { position: 'absolute', bottom: 26, left: 44, right: 44, borderTopWidth: 0.5, borderTopColor: '#e6e8ec', paddingTop: 8, fontSize: 8, color: MUTED, flexDirection: 'row', justifyContent: 'space-between' },
});

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value || '-'}</Text>
    </View>
  );
}

function DeliveryNoteDoc({ card, customer }: { card: DeliveryNoteCard; customer: DeliveryNoteCustomer }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.brandKosher}>THE KOSHER PLACE</Text>
            <Text style={s.brandDelivery}>DELIVERY</Text>
          </View>
          <View>
            <Text style={s.docTitle}>Delivery Note</Text>
            <Text style={s.docRef}>{card.delivery_ref}</Text>
          </View>
        </View>

        <Text style={s.customerName}>{customer.customer_name}</Text>
        <Text style={s.destination}>{card.destination}</Text>

        <View style={s.grid}>
          <Field label="Estimated arrival" value={card.planned_date} />
          <Field label="Delivery method" value={card.delivery_method_label} />
          <Field label="Driver" value={card.driver_name} />
          <Field label="Driver phone" value={card.driver_phone} />
        </View>

        {customer.sale_orders.length > 0 && (
          <View>
            <Text style={s.sectionTitle}>Sale orders</Text>
            <Text style={s.soRow}>{customer.sale_orders.join(',  ')}</Text>
          </View>
        )}

        {customer.items.length > 0 && (
          <View>
            <Text style={s.sectionTitle}>Items</Text>
            <View style={s.tableHead}>
              <Text style={[s.th, { width: '82%' }]}>Item</Text>
              <Text style={[s.th, { width: '18%', textAlign: 'right' }]}>Qty</Text>
            </View>
            {customer.items.map((it, i) => (
              <View key={i} style={s.tr}>
                <Text style={s.tdItem}>{it.name}</Text>
                <Text style={s.tdQty}>{it.qty}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={s.footer} fixed>
          <Text>Your delivery is on the way. Thank you for choosing The Kosher Place.</Text>
          <Text>{card.delivery_ref}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function generateDeliveryNotePdf(card: DeliveryNoteCard, customer: DeliveryNoteCustomer): Promise<Buffer> {
  return renderToBuffer(<DeliveryNoteDoc card={card} customer={customer} />);
}

/**
 * Generate a per-customer delivery note, upload it to the attachments bucket, and return
 * a 24h signed URL for WhatsApp to fetch. `ts` must be passed in (callers stamp the time)
 * to keep this deterministic.
 */
export async function buildAndUploadDeliveryNote(
  admin: Admin,
  cardId: string,
  card: DeliveryNoteCard,
  customer: DeliveryNoteCustomer,
  ts: number,
): Promise<{ link: string; filename: string } | null> {
  const buf = await generateDeliveryNotePdf(card, customer);
  const objectPath = `generated/${cardId}/${customer.id}-${ts}.pdf`;
  const { error: upErr } = await admin.storage
    .from('delivery-attachments')
    .upload(objectPath, buf, { contentType: 'application/pdf', upsert: true });
  if (upErr) return null;
  const { data } = await admin.storage.from('delivery-attachments').createSignedUrl(objectPath, 86400);
  if (!data?.signedUrl) return null;
  return { link: data.signedUrl, filename: `Delivery Note ${card.delivery_ref}.pdf` };
}
