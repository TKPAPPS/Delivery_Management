import type { DeliveryCardWithCustomers } from '@/types';
import { formatDate, statusLabel } from '@/lib/utils';

/**
 * Build an .xlsx from the given cards and trigger a browser download. `xlsx` is
 * imported dynamically so it only loads on the Export page.
 *
 * One row PER CUSTOMER (a card with N customers => N rows; card-level fields
 * repeat). This keeps every customer's sale orders and the planned time visible
 * in their own row instead of crammed into a single cell. Cards with no customers
 * still emit one row so nothing is lost.
 */
export async function exportCardsToXlsx(cards: DeliveryCardWithCustomers[]): Promise<void> {
  const XLSX = await import('xlsx');

  const cardCols = (card: DeliveryCardWithCustomers) => ({
    'Delivery Ref': card.delivery_ref,
    Status: statusLabel(card.status),
    Destination: card.destination,
    'Card Priority': card.priority,
    'Planned Date': card.planned_date ? formatDate(card.planned_date) : '',
    'Planned Time': card.planned_time ? card.planned_time.slice(0, 5) : '',
    'Shipping Type': card.shipping_type ?? '',
  });

  const rows = cards.flatMap((card) => {
    const customers = [...(card.customers ?? [])].sort((a, b) => {
      const ap = a.loading_priority ?? Infinity;
      const bp = b.loading_priority ?? Infinity;
      if (ap !== bp) return ap - bp;
      return a.sort_order - b.sort_order;
    });

    const tail = {
      'Created At': card.created_at ? formatDate(card.created_at) : '',
      'Delivered At': card.delivered_at ? formatDate(card.delivered_at) : '',
    };

    if (customers.length === 0) {
      return [{
        ...cardCols(card),
        Customer: '',
        'Loading Priority': '',
        'Customer Email': '',
        'Delivery Location': '',
        'Sale Orders': '',
        'Extra Items': '',
        ...tail,
      }];
    }

    return customers.map((c) => ({
      ...cardCols(card),
      Customer: c.customer_name,
      'Loading Priority': c.loading_priority ?? '',
      'Customer Email': c.customer_email ?? '',
      'Delivery Location': c.delivery_location ?? '',
      'Sale Orders': (c.sale_orders ?? []).map((s) => s.sale_order_number).join('; '),
      'Extra Items': (c.extra_items ?? []).map((e) => (e.quantity ? `${e.item_name} (${e.quantity})` : e.item_name)).join('; '),
      ...tail,
    }));
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Delivery Cards');
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `delivery-cards-${today}.xlsx`);
}
