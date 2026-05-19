'use client';

import { useState, useEffect } from 'react';
import type { DeliveryCard, Driver, CourierCompany, CargoCompany, DeliveryMethod } from '@/types';
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

export default function LogisticsSection({ card, drivers, onUpdated }: LogisticsSectionProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [courierCompanies, setCourierCompanies] = useState<CourierCompany[]>([]);
  const [cargoCompanies, setCargoCompanies] = useState<CargoCompany[]>([]);

  const [form, setForm] = useState<FormState>({
    delivery_method: card.delivery_method ?? 'car',
    // Car
    driver_id: card.driver_id ?? '',
    driver_name_manual: card.driver_name_manual ?? '',
    driver_phone_manual: card.driver_phone_manual ?? '',
    vehicle_type_manual: card.vehicle_type_manual ?? '',
    license_plate_manual: card.license_plate_manual ?? '',
    // Post
    courier_name: card.courier_name ?? '',
    tracking_number: card.tracking_number ?? '',
    // Air
    cargo_company_name: card.cargo_company_name ?? '',
    mawb: card.mawb ?? '',
    hawb: card.hawb ?? '',
    flight_number: card.flight_number ?? '',
    etd: card.etd ?? '',
    eta: card.eta ?? '',
    // Other
    other_method_name: card.other_method_name ?? '',
    other_reference: card.other_reference ?? '',
  });

  useEffect(() => {
    fetch('/api/courier-companies').then(r => r.json()).then(d => setCourierCompanies(d.companies ?? [])).catch(() => {});
    fetch('/api/cargo-companies').then(r => r.json()).then(d => setCargoCompanies(d.companies ?? [])).catch(() => {});
  }, []);

  const resetForm = () => setForm({
    delivery_method: card.delivery_method ?? 'car',
    driver_id: card.driver_id ?? '',
    driver_name_manual: card.driver_name_manual ?? '',
    driver_phone_manual: card.driver_phone_manual ?? '',
    vehicle_type_manual: card.vehicle_type_manual ?? '',
    license_plate_manual: card.license_plate_manual ?? '',
    courier_name: card.courier_name ?? '',
    tracking_number: card.tracking_number ?? '',
    cargo_company_name: card.cargo_company_name ?? '',
    mawb: card.mawb ?? '',
    hawb: card.hawb ?? '',
    flight_number: card.flight_number ?? '',
    etd: card.etd ?? '',
    eta: card.eta ?? '',
    other_method_name: card.other_method_name ?? '',
    other_reference: card.other_reference ?? '',
  });

  const save = async () => {
    setLoading(true);
    try {
      const payload: Partial<DeliveryCard> = {
        delivery_method: form.delivery_method as DeliveryMethod,
        driver_id: form.driver_id || null,
        driver_name_manual: form.driver_name_manual || null,
        driver_phone_manual: form.driver_phone_manual || null,
        vehicle_type_manual: form.vehicle_type_manual || null,
        license_plate_manual: form.license_plate_manual || null,
        courier_name: form.courier_name || null,
        tracking_number: form.tracking_number || null,
        cargo_company_name: form.cargo_company_name || null,
        mawb: form.mawb || null,
        hawb: form.hawb || null,
        flight_number: form.flight_number || null,
        etd: form.etd || null,
        eta: form.eta || null,
        other_method_name: form.other_method_name || null,
        other_reference: form.other_reference || null,
      };
      const res = await fetch(`/api/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to save');
      onUpdated(payload);
      addToast('Logistics details saved', 'success');
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
    if (method === 'post') return !!(card.courier_name || card.tracking_number);
    if (method === 'air') return !!(card.cargo_company_name || card.mawb);
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
      </div>
    );
  }
  if (method === 'post') {
    return (
      <div className="space-y-1.5">
        <Row label="Courier" value={card.courier_name} />
        <Row label="Tracking #" value={card.tracking_number} />
      </div>
    );
  }
  if (method === 'air') {
    return (
      <div className="space-y-1.5">
        <Row label="Cargo Co." value={card.cargo_company_name} />
        <Row label="MAWB" value={card.mawb} />
        <Row label="HAWB" value={card.hawb} />
        <Row label="Flight #" value={card.flight_number} />
        <Row label="ETD" value={card.etd} />
        <Row label="ETA" value={card.eta} />
      </div>
    );
  }
  if (method === 'other') {
    return (
      <div className="space-y-1.5">
        <Row label="Method" value={card.other_method_name} />
        <Row label="Reference" value={card.other_reference} />
      </div>
    );
  }
  return null;
}

type FormState = {
  delivery_method: string; driver_id: string; driver_name_manual: string;
  driver_phone_manual: string; vehicle_type_manual: string; license_plate_manual: string;
  courier_name: string; tracking_number: string; cargo_company_name: string;
  mawb: string; hawb: string; flight_number: string; etd: string; eta: string;
  other_method_name: string; other_reference: string;
};

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
        onChange={f('delivery_method')}
        options={[
          { value: 'car', label: 'Car / Truck' },
          { value: 'post', label: 'Post / Courier' },
          { value: 'air', label: 'Air Freight' },
          { value: 'other', label: 'Other' },
        ]}
      />

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
        </>
      )}

      {method === 'post' && (
        <>
          {courierCompanies.length > 0 ? (
            <Select
              label="Courier"
              value={form.courier_name}
              onChange={f('courier_name')}
              options={[
                { value: '', label: '— Select courier —' },
                ...courierCompanies.filter((c) => c.active).map((c) => ({ value: c.name, label: c.name })),
                { value: '__manual__', label: '— Enter manually —' },
              ]}
            />
          ) : null}
          {(form.courier_name === '__manual__' || courierCompanies.length === 0) && (
            <Input label="Courier Name" value={form.courier_name === '__manual__' ? '' : form.courier_name} onChange={f('courier_name')} placeholder="e.g. Kerry Express" />
          )}
          <Input label="Tracking Number" value={form.tracking_number} onChange={f('tracking_number')} placeholder="e.g. TH123456789" />
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
            <Input label="MAWB" value={form.mawb} onChange={f('mawb')} placeholder="Master Airway Bill" />
            <Input label="HAWB" value={form.hawb} onChange={f('hawb')} placeholder="House Airway Bill" />
          </div>
          <Input label="Flight Number" value={form.flight_number} onChange={f('flight_number')} placeholder="e.g. TG401" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="ETD" value={form.etd} onChange={f('etd')} type="date" />
            <Input label="ETA" value={form.eta} onChange={f('eta')} type="date" />
          </div>
        </>
      )}

      {method === 'other' && (
        <>
          <Input label="Method Name" value={form.other_method_name} onChange={f('other_method_name')} placeholder="e.g. Sea Freight, Motorbike, Self-collect" />
          <Input label="Reference Number" value={form.other_reference} onChange={f('other_reference')} placeholder="e.g. booking ref or container #" />
        </>
      )}
    </div>
  );
}
