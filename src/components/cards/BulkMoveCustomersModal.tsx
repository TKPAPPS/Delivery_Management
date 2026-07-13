'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import { useToastStore } from '@/store/toastStore';
import type { DeliveryCard } from '@/types';

interface BulkMoveCustomersModalProps {
  open: boolean;
  onClose: () => void;
  customerIds: string[];
  activeCards: Array<Pick<DeliveryCard, 'id' | 'delivery_ref' | 'destination'>>;
  onDone: () => void;
}

export default function BulkMoveCustomersModal({
  open,
  onClose,
  customerIds,
  activeCards,
  onDone,
}: BulkMoveCustomersModalProps) {
  const addToast = useToastStore((s) => s.addToast);
  const router = useRouter();
  const [targetCardId, setTargetCardId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!targetCardId) {
      addToast('Please select a card', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/customers/bulk-move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_ids: customerIds, target_card_id: targetCardId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to move customers');
      const n = data.moved ?? customerIds.length;
      addToast(`Moved ${n} customer${n > 1 ? 's' : ''} to the card`, 'success');
      onDone();
      onClose();
      // If this card lost its last customer it was discarded, so follow the customers to the target.
      if (data.source_card_discarded) router.push(`/cards/${data.target_card_id}`);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to move customers', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Move customers to a card" size="md">
      <p className="text-sm text-slate-600 mb-4">
        Move the <strong>{customerIds.length} selected customer{customerIds.length > 1 ? 's' : ''}</strong> to
        another active delivery card. Their orders follow, and this card is discarded if it becomes empty.
      </p>

      <Select
        label="Target delivery card"
        value={targetCardId}
        onChange={(e) => setTargetCardId(e.target.value)}
        placeholder="Select a card..."
        options={activeCards.map((c) => ({ value: c.id, label: `${c.delivery_ref} - ${c.destination}` }))}
      />

      <div className="flex gap-3 justify-end mt-4">
        <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button onClick={handleSubmit} loading={submitting} disabled={!targetCardId}>Move to card</Button>
      </div>
    </Modal>
  );
}
