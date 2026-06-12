import type { DeliveryCardWithCustomers } from '@/types';
import { formatDate, statusLabel } from '@/lib/utils';

/**
 * Build an .xlsx from the given cards (one row per card) and trigger a browser
 * download. `xlsx` is imported dynamically so it only loads on the Export page.
 * Columns: card basics + status, and customers + sale orders (per user's choice).
 */
export async function exportCardsToXlsx(cards: DeliveryCardWithCustomers[]): Promise<void> {
  const XLSX = await import('xlsx');

  const rows = cards.map((card) => {
    const customers = card.customers ?? [];
    const saleOrders = customers.flatMap((c) => (c.sale_orders ?? []).map((s) => s.sale_order_number));
    const extras = customers.flatMap((c) =>
      (c.extra_items ?? []).map((e) => (e.quantity ? `${e.item_name} (${e.quantity})` : e.item_name)),
    );
    return {
      'Delivery Ref': card.delivery_ref,
      Status: statusLabel(card.status),
      Destination: card.destination,
      Priority: card.priority,
      'Loading Priority': card.loading_priority ?? '',
      'Planned Date': card.planned_date ? formatDate(card.planned_date) : '',
      'Planned Time': card.planned_time ? card.planned_time.slice(0, 5) : '',
      'Shipping Type': card.shipping_type ?? '',
      Customers: customers.map((c) => c.customer_name).join('; '),
      'Customer Emails': customers.map((c) => c.customer_email).filter(Boolean).join('; '),
      'Delivery Locations': customers.map((c) => c.delivery_location).filter(Boolean).join('; '),
      'Sale Orders': saleOrders.join('; '),
      'Extra Items': extras.join('; '),
      'Created At': card.created_at ? formatDate(card.created_at) : '',
      'Delivered At': card.delivered_at ? formatDate(card.delivered_at) : '',
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Delivery Cards');
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `delivery-cards-${today}.xlsx`);
}
