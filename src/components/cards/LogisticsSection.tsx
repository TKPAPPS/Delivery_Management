'use client';

import { useState, useEffect } from 'react';
import type { DeliveryCard, Driver, CourierCompany, CargoCompany, DeliveryMethod, DeliveryType } from '@/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { Truck, Mail, Plane, Package, Edit, Check, X, ExternalLink } from 'lucide-react';
import { useToastStore } from '@/store/toastStore';

interface LogisticsSectionProps {
  card: DeliveryCard;
  drivers: Driver[];
  onUpdated: (data: Partial<DeliveryCard>) => void;
}

const METHOD_LABELS: Record<DeliveryMethod, string> = {
  car: 'Car / Truck',
  post: 'Post / Courier',
  air: 'Air Freight',
  other: 'Other',
};

const METHOD_ICONS: Record<DeliveryMethod, React.ElementType> = {
  car: Truck,
  post: Mail,
  air: Plane,
  other: Package,
};

const DELIVERY_TYPE_LABELS: Record<DeliveryType, string> = {
  our_motorcycle: 'Our motorcycle',
  company_motorcycle: 'Delivery company motorcycle',
};

// Courier/cargo dropdowns use '__manual__' as the "enter manually" sentinel; it must
// never be saved as the actual company name.
const cleanName = (v: string): string | null => (!v || v === '__manual__' ? null : v);

export default function LogisticsSection({ card, drivers, onUpdated }: LogisticsSectionProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [courierCompanies, setCourierCompanies] = useState<CourierCompany[]>([]);
  const [cargoCompanies, setCargoCompanies] = useState<CargoCompany[]>([]);

  const [form, setForm] = useState<FormState>({
    delivery_method: card.delivery_method ?? 'car',
    delivery_type: card.delivery_type ?? '',
    // Car
    driver_id: card.driver_id ?? '',
    driver_name_manual: card.driver_name_manual ?? '',
    driver_phone_manual: card.driver_phone_manual ?? '',
    vehicle_type_manual: card.vehicle_type_manual ?? '',
    license_plate_manual: card.license_plate_manual ?? '',
    planned_time: card.planned_time ?? '',
    shipping_type: card.shipping_type ?? '',
    // Post
    courier_company_name: card.courier_company_name ?? '',
    tracking_number: card.tracking_number ?? '',
    // Air
    cargo_company_name: card.cargo_company_name ?? '',
    mawb_number: card.mawb_number ?? '',
    hawb_number: card.hawb_number ?? '',
    flight_number: card.flight_number ?? '',
    cargo_etd: card.cargo_etd ?? '',
    cargo_eta: card.cargo_eta ?? '',
    // Other
    other_method_name: card.other_method_name ?? '',
    other_tracking_ref: card.other_tracking_ref ?? '',
  });

  useEffect(() => {
    fetch('/api/courier-companies').then(r => r.json()).then(d => setCourierCompanies(d.companies ?? [])).catch(() => {});
    fetch('/api/cargo-companies').then(r => r.json()).then(d => setCargoCompanies(d.companies ?? [])).catch(() => {});
  }, []);

  const resetForm = () => setForm({
    delivery_method: card.delivery_method ?? 'car',
    delivery_type: card.delivery_type ?? '',
    driver_id: card.driver_id ?? '',
    driver_name_manual: card.driver_name_manual ?? '',
    driver_phone_manual: card.driver_phone_manual ?? '',
    vehicle_type_manual: card.vehicle_type_manual ?? '',
    license_plate_manual: card.license_plate_manual ?? '',
    planned_time: card.planned_time ?? '',
    shipping_type: card.shipping_type ?? '',
    courier_company_name: card.courier_company_name ?? '',
    tracking_number: card.tracking_number ?? '',
    cargo_company_name: card.cargo_company_name ?? '',
    mawb_number: card.mawb_number ?? '',
    hawb_number: card.hawb_number ?? '',
    flight_number: card.flight_number ?? '',
    cargo_etd: card.cargo_etd ?? '',
    cargo_eta: card.cargo_eta ?? '',
    other_method_name: card.other_method_name ?? '',
    other_tracking_ref: card.other_tracking_ref ?? '',
  });

  const save = async () => {
    setLoading(true);
    try {
      const payload: Partial<DeliveryCard> = {
        delivery_method: form.delivery_method as DeliveryMethod,
        // Delivery Type (motorcycle) only applies to the "other" method. Force-clear it for
        // any other method so a stale value (e.g. legacy data) can't persist on a Car/Truck card.
        delivery_type: (form.delivery_method === 'other' ? form.delivery_type || null : null) as DeliveryType | null,
        driver_id: form.driver_id || null,
        driver_name_manual: form.driver_name_manual || null,
        driver_phone_manual: form.driver_phone_manual || null,
        vehicle_type_manual: form.vehicle_type_manual || null,
        license_plate_manual: form.license_plate_manual || null,
        // Time applies to Car/Truck only; shipping type to Car/Truck + Post/Courier.
        // Force-clear when the method doesn't apply so stale values can't linger.
        planned_time: (form.delivery_method === 'car' ? form.planned_time || null : null),
        shipping_type: ((form.delivery_method === 'car' || form.delivery_method === 'post')
          ? (form.shipping_type || null) : null) as DeliveryCard['shipping_type'],
        // '__manual__' is the dropdown sentinel for "enter manually" — never persist it.
        courier_company_name: cleanName(form.courier_company_name),
        tracking_number: form.tracking_number || null,
        cargo_company_name: cleanName(form.cargo_company_name),
        mawb_number: form.mawb_number || null,
        hawb_number: form.hawb_number || null,
        flight_number: form.flight_number || null,
        cargo_etd: form.cargo_etd || null,
        cargo_eta: form.cargo_eta || null,
        other_method_name: form.other_method_name || null,
        other_tracking_ref: form.other_tracking_ref || null,
      };
      const res = await fetch(`/api/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to save');
      const data = await res.json().catch(() => null);
      // Assigning a driver may auto-advance the card to "booked" server-side — reflect it.
      const updated: Partial<DeliveryCard> =
        data?.card?.status && data.card.status !== card.status
          ? { ...payload, status: data.card.status }
          : payload;
      onUpdated(updated);
      if (updated.status && updated.status !== card.status) {
        addToast('Driver assigned — card moved to Booked', 'success');
      } else {
        addToast('Logistics details saved', 'success');
      }
      setEditing(false);
    } catch {
      addToast('Failed to save logistics details', 'error');
    } finally {
      setLoading(false);
    }
  };

  const method = card.delivery_method ?? 'car';
  const MethodIcon = METHOD_ICONS[method];

  const hasDetails = (() => {
    if (method === 'car') return !!(card.driver_name_manual || card.driver_id);
    if (method === 'post') return !!(card.courier_company_name || card.tracking_number);
    if (method === 'air') return !!(card.cargo_company_name || card.mawb_number);
    if (method === 'other') return !!(card.other_method_name);
    return false;
  })();

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MethodIcon className="w-4 h-4 text-slate-500" />
          <h3 className="font-semibold text-slate-900 text-sm">
            Logistics — <span className="text-slate-500 font-normal">{METHOD_LABELS[method]}</span>
            {method === 'other' && card.delivery_type && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gold-50 text-gold-700 border border-gold-200">
                {DELIVERY_TYPE_LABELS[card.delivery_type]}
              </span>
            )}
          </h3>
        </div>
        {!editing ? (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Edit className="w-3.5 h-3.5" /> Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => { resetForm(); setEditing(false); }} disabled={loading}>
              <X className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" onClick={save} loading={loading}>
              <Check className="w-3.5 h-3.5" /> Save
            </Button>
          </div>
        )}
      </div>

      {!editing ? (
        <ReadView card={card} drivers={drivers} method={method} hasDetails={hasDetails} onEdit={() => setEditing(true)} />
      ) : (
        <EditForm
          form={form}
          setForm={setForm}
          drivers={drivers}
          courierCompanies={courierCompanies}
          cargoCompanies={cargoCompanies}
        />
      )}
    </div>
  );
}

function ReadView({ card, drivers, method, hasDetails, onEdit }: {
  card: DeliveryCard & { driver?: Driver | null };
  drivers: Driver[];
  method: DeliveryMethod;
  hasDetails: boolean;
  onEdit: () => void;
}) {
  if (!hasDetails) {
    return (
      <button
        onClick={onEdit}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-lg py-3 text-sm text-slate-500 hover:border-crimson-400 hover:text-crimson-600 transition-colors"
      >
        Assign logistics details
      </button>
    );
  }

  const Row = ({ label, value }: { label: string; value: string | null | undefined }) =>
    value ? (
      <div className="flex gap-4 text-sm">
        <span className="text-slate-500 w-28 flex-shrink-0">{label}</span>
        <span className="text-slate-900 font-medium">{value}</span>
      </div>
    ) : null;

  if (method === 'car') {
    const selectedDriver = drivers.find((d) => d.id === card.driver_id);
    const driverName = (card.driver as Driver | null)?.name ?? selectedDriver?.name ?? card.driver_name_manual;
    const driverPhone = (card.driver as Driver | null)?.phone ?? selectedDriver?.phone ?? card.driver_phone_manual;
    const vehicleType = (card.driver as Driver | null)?.vehicle_type ?? selectedDriver?.vehicle_type ?? card.vehicle_type_manual;
    const licensePlate = (card.driver as Driver | null)?.license_plate ?? selectedDriver?.license_plate ?? card.license_plate_manual;
    return (
      <div className="space-y-1.5">
        <Row label="Driver" value={driverName} />
        <Row label="Phone" value={driverPhone} />
        <Row label="Vehicle" value={vehicleType} />
        <Row label="Plate" value={licensePlate} />
        <Row label="Time" value={card.planned_time?.slice(0, 5)} />
        <Row label="Shipping" value={card.shipping_type} />
      </div>
    );
  }
  if (method === 'post') {
    return (
      <div className="space-y-1.5">
        <Row label="Courier" value={card.courier_company_name} />
        <Row label="Tracking #" value={card.tracking_number} />
        <Row label="Shipping" value={card.shipping_type} />
      </div>
    );
  }
  if (method === 'air') {
    return (
      <div className="space-y-1.5">
        <Row label="Cargo Co." value={card.cargo_company_name} />
        <Row label="MAWB" value={card.mawb_number} />
        <Row label="HAWB" value={card.hawb_number} />
        <Row label="Flight #" value={card.flight_number} />
        <Row label="ETD" value={card.cargo_etd} />
        <Row label="ETA" value={card.cargo_eta} />
      </div>
    );
  }
  if (method === 'other') {
    return (
      <div className="space-y-1.5">
        <Row label="Method" value={card.other_method_name} />
        <Row label="Reference" value={card.other_tracking_ref} />
      </div>
    );
  }
  return null;
}

type FormState = {
  delivery_method: string; delivery_type: string; driver_id: string; driver_name_manual: string;
  driver_phone_manual: string; vehicle_type_manual: string; license_plate_manual: string;
  planned_time: string; shipping_type: string;
  courier_company_name: string; tracking_number: string; cargo_company_name: string;
  mawb_number: string; hawb_number: string; flight_number: string; cargo_etd: string; cargo_eta: string;
  other_method_name: string; other_tracking_ref: string;
};

const SHIPPING_TYPE_OPTIONS = [
  { value: '', label: '— Not specified —' },
  { value: 'Dry', label: 'Dry' },
  { value: 'Frozen', label: 'Frozen' },
  { value: 'Chilled', label: 'Chilled' },
];

function EditForm({ form, setForm, drivers, courierCompanies, cargoCompanies }: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  drivers: Driver[];
  courierCompanies: CourierCompany[];
  cargoCompanies: CargoCompany[];
}) {
  const f = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const method = form.delivery_method as DeliveryMethod;

  return (
    <div className="space-y-3">
      <Select
        label="Delivery Method"
        value={form.delivery_method}
        onChange={(e) => setForm((prev) => ({
          ...prev,
          delivery_method: e.target.value,
          // Delivery Type (motorcycle) only applies to the "other" method — clear it otherwise.
          delivery_type: e.target.value === 'other' ? prev.delivery_type : '',
        }))}
        options={[
          { value: 'car', label: 'Car / Truck' },
          { value: 'post', label: 'Post / Courier' },
          { value: 'air', label: 'Air Freight' },
          { value: 'other', label: 'Other' },
        ]}
      />

      {method === 'other' && (
        <Select
          label="Delivery Type"
          value={form.delivery_type}
          onChange={f('delivery_type')}
          options={[
            { value: '', label: '— Not specified —' },
            { value: 'our_motorcycle', label: 'Our motorcycle' },
            { value: 'company_motorcycle', label: 'Delivery company motorcycle' },
          ]}
        />
      )}

      {method === 'car' && (
        <>
          {drivers.length > 0 ? (
            <Select
              label="Select from roster"
              value={form.driver_id}
              onChange={f('driver_id')}
              options={[
                { value: '', label: '— Manual entry —' },
                ...drivers.filter((d) => d.active).map((d) => ({
                  value: d.id,
                  label: `${d.name}${d.license_plate ? ` (${d.license_plate})` : ''}`,
                })),
              ]}
            />
          ) : (
            <p className="text-xs text-slate-400 flex items-center gap-1">
              No drivers in roster.{' '}
              <a href="/admin/drivers" className="text-crimson-600 hover:underline flex items-center gap-0.5">
                Add drivers <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          )}

          {form.driver_id ? (
            (() => {
              const d = drivers.find((dr) => dr.id === form.driver_id);
              if (!d) return null;
              return (
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm space-y-1">
                  {d.phone && <p className="text-slate-600">Phone: {d.phone}</p>}
                  {d.vehicle_type && <p className="text-slate-600">Vehicle: {d.vehicle_type}</p>}
                  {d.license_plate && <p className="text-slate-600 font-mono">Plate: {d.license_plate}</p>}
                </div>
              );
            })()
          ) : (
            <>
              <Input label="Driver Name" value={form.driver_name_manual} onChange={f('driver_name_manual')} placeholder="Driver's name" />
              <Input label="Phone" value={form.driver_phone_manual} onChange={f('driver_phone_manual')} placeholder="+66 XX XXXX XXXX" />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Vehicle Type" value={form.vehicle_type_manual} onChange={f('vehicle_type_manual')} placeholder="e.g. 6-wheel truck" />
                <Input label="License Plate" value={form.license_plate_manual} onChange={f('license_plate_manual')} placeholder="กข-1234" />
              </div>
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Time" type="time" value={form.planned_time} onChange={f('planned_time')} />
            <Select label="Shipping Type" value={form.shipping_type} onChange={f('shipping_type')} options={SHIPPING_TYPE_OPTIONS} />
          </div>
        </>
      )}

      {method === 'post' && (
        <>
          {courierCompanies.length > 0 ? (
            <Select
              label="Courier"
              value={form.courier_company_name}
              onChange={f('courier_company_name')}
              options={[
                { value: '', label: '— Select courier —' },
                ...courierCompanies.filter((c) => c.active).map((c) => ({ value: c.name, label: c.name })),
                { value: '__manual__', label: '— Enter manually —' },
              ]}
            />
          ) : null}
          {(form.courier_company_name === '__manual__' || courierCompanies.length === 0) && (
            <Input label="Courier Name" value={form.courier_company_name === '__manual__' ? '' : form.courier_company_name} onChange={f('courier_company_name')} placeholder="e.g. Kerry Express" />
          )}
          <Input label="Tracking Number" value={form.tracking_number} onChange={f('tracking_number')} placeholder="e.g. TH123456789" />
          <Select label="Shipping Type" value={form.shipping_type} onChange={f('shipping_type')} options={SHIPPING_TYPE_OPTIONS} />
        </>
      )}

      {method === 'air' && (
        <>
          {cargoCompanies.length > 0 ? (
            <Select
              label="Cargo Company"
              value={form.cargo_company_name}
              onChange={f('cargo_company_name')}
              options={[
                { value: '', label: '— Select cargo company —' },
                ...cargoCompanies.filter((c) => c.active).map((c) => ({ value: c.name, label: c.name })),
                { value: '__manual__', label: '— Enter manually —' },
              ]}
            />
          ) : null}
          {(form.cargo_company_name === '__manual__' || cargoCompanies.length === 0) && (
            <Input label="Cargo Company" value={form.cargo_company_name === '__manual__' ? '' : form.cargo_company_name} onChange={f('cargo_company_name')} placeholder="e.g. Thai Airways Cargo" />
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input label="MAWB" value={form.mawb_number} onChange={f('mawb_number')} placeholder="Master Airway Bill" />
            <Input label="HAWB" value={form.hawb_number} onChange={f('hawb_number')} placeholder="House Airway Bill" />
          </div>
          <Input label="Flight Number" value={form.flight_number} onChange={f('flight_number')} placeholder="e.g. TG401" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="ETD" value={form.cargo_etd} onChange={f('cargo_etd')} type="date" />
            <Input label="ETA" value={form.cargo_eta} onChange={f('cargo_eta')} type="date" />
          </div>
        </>
      )}

      {method === 'other' && (
        <>
          <Input label="Method Name" value={form.other_method_name} onChange={f('other_method_name')} placeholder="e.g. Sea Freight, Motorbike, Self-collect" />
          <Input label="Reference Number" value={form.other_tracking_ref} onChange={f('other_tracking_ref')} placeholder="e.g. booking ref or container #" />
        </>
      )}
    </div>
  );
}
