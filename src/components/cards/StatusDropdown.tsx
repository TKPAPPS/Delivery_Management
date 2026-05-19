'use client';

import { useState } from 'react';
import type { DeliveryStatus } from '@/types';
import { statusLabel } from '@/lib/utils';
import { useToastStore } from '@/store/toastStore';

interface StatusDropdownProps {
  cardId: string;
  currentStatus: DeliveryStatus;
  onStatusChange: (status: DeliveryStatus) => void;
}

const STATUSES: DeliveryStatus[] = ['draft', 'driver_needed', 'driver_booked', 'loaded', 'delivered'];

export default function StatusDropdown({ cardId, currentStatus, onStatusChange }: StatusDropdownProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [loading, setLoading] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value as DeliveryStatus;
    setLoading(true);
    try {
      const res = await fetch(`/api/cards/${cardId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      onStatusChange(newStatus);
      addToast('Status updated', 'success');
    } catch {
      addToast('Failed to update status', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <select
      value={currentStatus}
      onChange={handleChange}
      disabled={loading}
      className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:opacity-50"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {statusLabel(s)}
        </option>
      ))}
    </select>
  );
}
