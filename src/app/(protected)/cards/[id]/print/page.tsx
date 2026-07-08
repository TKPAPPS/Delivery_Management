import { createSupabaseServerClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { formatDate } from '@/lib/utils';
import PrintButton from './PrintButton';

export const dynamic = 'force-dynamic';

export default async function PrintPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: card } = await supabase
    .from('delivery_cards')
    .select(`
      *,
      driver:drivers(name, phone, vehicle_type, license_plate),
      customers:delivery_customers!delivery_card_id(
        *,
        sale_orders:customer_sale_orders(*),
        extra_items:extra_delivery_items(*)
      )
    `)
    .eq('id', params.id)
    .single();

  if (!card) notFound();

  const driverName = (card.driver as { name?: string } | null)?.name ?? card.driver_name_manual ?? null;
  const driverPhone = (card.driver as { phone?: string } | null)?.phone ?? card.driver_phone_manual ?? null;
  const vehicleType = (card.driver as { vehicle_type?: string } | null)?.vehicle_type ?? card.vehicle_type_manual ?? null;
  const licensePlate = (card.driver as { license_plate?: string } | null)?.license_plate ?? card.license_plate_manual ?? null;

  const customers = (card.customers ?? []) as Array<{
    id: string;
    customer_name: string;
    delivery_location: string | null;
    notes: string | null;
    partial_shipment: boolean;
    partial_shipment_note: string | null;
    sale_orders: Array<{ sale_order_number: string }>;
    extra_items: Array<{ item_name: string; quantity: string | null }>;
  }>;

  return (
    <div className="min-h-screen bg-white">
      {/* Screen-only controls */}
      <div className="print:hidden flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-3">
          <a href={`/cards/${params.id}`} className="text-sm text-slate-500 hover:text-slate-700">
            ← Back to Card
          </a>
          <span className="text-slate-300">|</span>
          <span className="text-sm font-mono text-crimson-700">{card.delivery_ref}</span>
        </div>
        <PrintButton />
      </div>

      {/* Printable content */}
      <div className="max-w-2xl mx-auto p-8 print:p-6 print:max-w-none">
        {/* Header */}
        <div className="border-b-2 border-slate-900 pb-4 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-slate-500 font-mono mb-1">{card.delivery_ref}</p>
              <h1 className="text-2xl font-bold text-slate-900">{card.destination}</h1>
              {card.planned_date && (
                <p className="text-sm text-slate-600 mt-1">Planned: <strong>{formatDate(card.planned_date)}</strong></p>
              )}
            </div>
            <div className="text-right text-xs text-slate-400">
              <p>Printed: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
              {card.priority === 'urgent' && (
                <p className="text-red-600 font-bold text-sm mt-1">⚠ URGENT</p>
              )}
            </div>
          </div>
        </div>

        {/* Driver info */}
        {(driverName || vehicleType || licensePlate) && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Driver</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {driverName && (
                <>
                  <span className="text-slate-500">Name</span>
                  <span className="font-semibold">{driverName}</span>
                </>
              )}
              {driverPhone && (
                <>
                  <span className="text-slate-500">Phone</span>
                  <span>{driverPhone}</span>
                </>
              )}
              {vehicleType && (
                <>
                  <span className="text-slate-500">Vehicle</span>
                  <span>{vehicleType}</span>
                </>
              )}
              {licensePlate && (
                <>
                  <span className="text-slate-500">Plate</span>
                  <span className="font-mono font-semibold">{licensePlate}</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Internal notes */}
        {card.internal_notes && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 text-sm text-amber-900">
            <strong>Notes:</strong> {card.internal_notes}
          </div>
        )}

        {/* Customers */}
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
          Deliveries ({customers.length})
        </h2>
        <div className="space-y-4">
          {customers.map((cust, i) => (
            <div key={cust.id} className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="text-xs text-slate-400 font-mono mr-2">{i + 1}.</span>
                  <span className="font-bold text-slate-900">{cust.customer_name}</span>
                  {cust.partial_shipment && (
                    <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Partial</span>
                  )}
                </div>
              </div>

              {cust.delivery_location && (
                <p className="text-sm text-slate-600 mb-2">
                  <span className="font-medium">Location:</span> {cust.delivery_location}
                </p>
              )}

              {cust.sale_orders.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Sale Orders</p>
                  <div className="flex flex-wrap gap-1">
                    {cust.sale_orders.map((so, j) => (
                      <span key={j} className="text-xs font-mono bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded">
                        {so.sale_order_number}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {cust.extra_items.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Extra Items</p>
                  <ul className="text-sm text-slate-700 space-y-0.5">
                    {cust.extra_items.map((item, j) => (
                      <li key={j}>• {item.item_name}{item.quantity ? ` (${item.quantity})` : ''}</li>
                    ))}
                  </ul>
                </div>
              )}

              {cust.notes && (
                <p className="text-xs text-slate-500 italic">{cust.notes}</p>
              )}

              {cust.partial_shipment && cust.partial_shipment_note && (
                <p className="text-xs text-amber-700 mt-1">Partial: {cust.partial_shipment_note}</p>
              )}

              {/* Signature line */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-400">
                <span>Received by: ________________________</span>
                <span>Time: ____________</span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-slate-200 text-xs text-slate-400 text-center">
          {card.delivery_ref} · {card.destination} · TKP Delivery Board
        </div>
      </div>
    </div>
  );
}
