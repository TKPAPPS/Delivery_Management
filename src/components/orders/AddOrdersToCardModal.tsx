'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import { useToastStore } from '@/store/toastStore';

interface ActiveCard {
  id: string;
  delivery_ref: string;
  destination: string;
}

interface AddOrdersToCardModalProps {
  open: boolean;
  onClose: () => void;
  orderIds: string[];
  onDone: () => void;
}

export default function AddOrdersToCardModal({ open, onClose, orderIds, onDone }: AddOrdersToCardModalProps) {
  const addToast = useToastStore((s) => s.addToast);
  const router = useRouter();
  const [cards, setCards] = useState<ActiveCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const [targetCardId, setTargetCardId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Load the current active cards each time the modal opens (fresh, no stale prop).
  useEffect(() => {
    if (!open) return;
    setTargetCardId('');
    setLoadingCards(true);
    fetch('/api/cards')
      .then((r) => r.json())
      .then((d) => setCards((d.cards ?? []).map((c: ActiveCard) => ({ id: c.id, delivery_ref: c.delivery_ref, destination: c.destination }))))
      .catch(() => setCards([]))
      .finally(() => setLoadingCards(false));
  }, [open]);

  const handleSubmit = async () => {
    if (!targetCardId) {
      addToast('Please select a card', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/deliveries/from-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_ids: orderIds, target_card_id: targetCardId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to add orders to card');
      const n = data.assigned?.length ?? orderIds.length;
      const skippedNote = data.skipped?.length ? `, ${data.skipped.length} skipped` : '';
      addToast(`Added ${n} order${n > 1 ? 's' : ''} to the card${skippedNote}`, 'success');
      onDone();
      onClose();
      router.push(`/cards/${data.card_id}`);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to add orders to card', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add orders to a delivery card" size="md">
      <p className="text-sm text-slate-600 mb-4">
        Add the <strong>{orderIds.length} selected order{orderIds.length > 1 ? 's' : ''}</strong> to an existing
        active delivery card. Orders for a customer already on that card are combined into it.
      </p>

      <Select
        label="Delivery card"
        value={targetCardId}
        onChange={(e) => setTargetCardId(e.target.value)}
        placeholder={loadingCards ? 'Loading cards...' : 'Select a card...'}
        disabled={loadingCards}
        options={cards.map((c) => ({ value: c.id, label: `${c.delivery_ref} - ${c.destination}` }))}
      />

      <div className="flex gap-3 justify-end mt-4">
        <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button onClick={handleSubmit} loading={submitting} disabled={loadingCards || !targetCardId}>Add to card</Button>
      </div>
    </Modal>
  );
}
