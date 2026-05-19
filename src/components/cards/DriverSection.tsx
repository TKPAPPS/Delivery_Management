'use client';

import { useState } from 'react';
import type { DeliveryCard, Driver } from '@/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { Truck, Edit, Check, X, ExternalLink } from 'lucide-react';
import { useToastStore } from '@/store/toastStore';

interface DriverSectionProps {
  card: DeliveryCard;
  drivers: Driver[];
  onUpdated: (data: Partial<DeliveryCard>) => void;
}

export default function DriverSection({ card, drivers, onUpdated }: DriverSectionProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    driver_id: card.driver_id ?? '',
    driver_name_manual: card.driver_name_manual ?? '',
    driver_phone_manual: card.driver_phone_manual ?? '',
    vehicle_type_manual: card.vehicle_type_manual ?? '',
    license_plate_manual: card.license_plate_manual ?? '',
  });

  const save = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver_id: form.driver_id || null,
          driver_name_manual: form.driver_name_manual || null,
          driver_phone_manual: form.driver_phone_manual || null,
          vehicle_type_manual: form.vehicle_type_manual || null,
          license_plate_manual: form.license_plate_manual || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to save driver details');
      onUpdated({
        driver_id: form.driver_id || null,
        driver_name_manual: form.driver_name_manual || null,
        driver_phone_manual: form.driver_phone_manual || null,
        vehicle_type_manual: form.vehicle_type_manual || null,
        license_plate_manual: form.license_plate_manual || null,
      });
      addToast('Driver details saved', 'success');
      setEditing(false);
    } catch {
      addToast('Failed to save driver details', 'error');
    } finally {
      setLoading(false);
    }
  };

  const selectedDriver = drivers.find((d) => d.id === card.driver_id);
  const driverName = selectedDriver?.name ?? card.driver_name_manual;
  const driverPhone = selectedDriver?.phone ?? card.driver_phone_manual;
  const vehicleType = selectedDriver?.vehicle_type ?? card.vehicle_type_manual;
  const licensePlate = selectedDriver?.license_plate ?? card.license_plate_manual;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-slate-500" />
          <h3 className="font-semibold text-slate-900 text-sm">Driver Details</h3>
        </div>
        {!editing && driverName ? (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Edit className="w-3.5 h-3.5" /> Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => {
              setForm({
                driver_id: card.driver_id ?? '',
                driver_name_manual: card.driver_name_manual ?? '',
                driver_phone_manual: card.driver_phone_manual ?? '',
                vehicle_type_manual: card.vehicle_type_manual ?? '',
                license_plate_manual: card.license_plate_manual ?? '',
              });
              setEditing(false);
            }} disabled={loading}>
              <X className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" onClick={save} loading={loading}>
              <Check className="w-3.5 h-3.5" /> Save
            </Button>
          </div>
        )}
      </div>

      {!editing ? (
        <div className="space-y-1.5">
          {driverName ? (
            <>
              <div className="flex gap-4 text-sm">
                <span className="text-slate-500 w-24 flex-shrink-0">Driver</span>
                <span className="text-slate-900 font-medium">{driverName}</span>
              </div>
              {driverPhone && (
                <div className="flex gap-4 text-sm">
                  <span className="text-slate-500 w-24 flex-shrink-0">Phone</span>
                  <span className="text-slate-900">{driverPhone}</span>
                </div>
              )}
              {vehicleType && (
                <div className="flex gap-4 text-sm">
                  <span className="text-slate-500 w-24 flex-shrink-0">Vehicle</span>
                  <span className="text-slate-900">{vehicleType}</span>
                </div>
              )}
              {licensePlate && (
                <div className="flex gap-4 text-sm">
                  <span className="text-slate-500 w-24 flex-shrink-0">Plate</span>
                  <span className="text-slate-900 font-mono">{licensePlate}</span>
                </div>
              )}
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-lg py-3 text-sm text-slate-500 hover:border-crimson-400 hover:text-crimson-600 transition-colors"
            >
              <Truck className="w-4 h-4" />
              Assign Driver
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {drivers.length > 0 ? (
            <Select
              label="Select from roster"
              value={form.driver_id}
              onChange={(e) => setForm((f) => ({ ...f, driver_id: e.target.value }))}
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
                Add drivers in Admin <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          )}

          {form.driver_id ? (
            // Show read-only preview of the selected roster driver's details
            (() => {
              const d = drivers.find((dr) => dr.id === form.driver_id);
              if (!d) return null;
              return (
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 space-y-1">
                  {d.phone && (
                    <div className="flex gap-4 text-sm">
                      <span className="text-slate-500 w-20 flex-shrink-0">Phone</span>
                      <span className="text-slate-700">{d.phone}</span>
                    </div>
                  )}
                  {d.vehicle_type && (
                    <div className="flex gap-4 text-sm">
                      <span className="text-slate-500 w-20 flex-shrink-0">Vehicle</span>
                      <span className="text-slate-700">{d.vehicle_type}</span>
                    </div>
                  )}
                  {d.license_plate && (
                    <div className="flex gap-4 text-sm">
                      <span className="text-slate-500 w-20 flex-shrink-0">Plate</span>
                      <span className="text-slate-700 font-mono">{d.license_plate}</span>
                    </div>
                  )}
                  {!d.phone && !d.vehicle_type && !d.license_plate && (
                    <p className="text-xs text-slate-400">No additional details on file for this driver.</p>
                  )}
                </div>
              );
            })()
          ) : (
            <>
              <Input
                label="Driver Name"
                value={form.driver_name_manual}
                onChange={(e) => setForm((f) => ({ ...f, driver_name_manual: e.target.value }))}
                placeholder="Driver's name"
              />
              <Input
                label="Phone"
                value={form.driver_phone_manual}
                onChange={(e) => setForm((f) => ({ ...f, driver_phone_manual: e.target.value }))}
                placeholder="+66 XX XXXX XXXX"
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Vehicle Type"
                  value={form.vehicle_type_manual}
                  onChange={(e) => setForm((f) => ({ ...f, vehicle_type_manual: e.target.value }))}
                  placeholder="e.g. 6-wheel truck"
                />
                <Input
                  label="License Plate"
                  value={form.license_plate_manual}
                  onChange={(e) => setForm((f) => ({ ...f, license_plate_manual: e.target.value }))}
                  placeholder="กข-1234"
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
