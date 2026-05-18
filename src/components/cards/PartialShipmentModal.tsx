'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Textarea from '@/components/ui/Textarea';
import { useToastStore } from '@/store/toastStore';

interface PartialShipmentModalProps {
  open: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
  currentNote: string | null;
  onUpdated: () => void;
}

export default function PartialShipmentModal({
  open,
  onClose,
  customerId,
  customerName,
  currentNote,
  onUpdated,
}: PartialShipmentModalProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [note, setNote] = useState(currentNote ?? '');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partial_shipment: true, partial_shipment_note: note }),
      });
      if (!res.ok) throw new Error('Failed to mark partial shipment');
      addToast('Marked as partial shipment', 'success');
      onUpdated();
      onClose();
    } catch {
      addToast('Failed to mark partial shipment', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Mark Partial Shipment" size="sm">
      <p className="text-sm text-slate-600 mb-4">
        Mark <strong>{customerName}</strong> as a partial shipment.
      </p>
      <Textarea
        label="Partial shipment note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What is missing or deferred?"
        rows={3}
      />
      <div className="flex gap-3 justify-end mt-4">
        <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="primary" onClick={handleSave} loading={loading}>
          Confirm
        </Button>
      </div>
    </Modal>
  );
}
