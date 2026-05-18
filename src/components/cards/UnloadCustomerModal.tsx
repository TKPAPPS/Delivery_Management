'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { useToastStore } from '@/store/toastStore';
import type { DeliveryCard } from '@/types';

type UnloadAction = 'planning_queue' | 'move_to_card' | 'create_card' | 'delayed';

interface UnloadCustomerModalProps {
  open: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
  activeCards: Array<Pick<DeliveryCard, 'id' | 'delivery_ref' | 'destination'>>;
  onDone: () => void;
}

export default function UnloadCustomerModal({
  open,
  onClose,
  customerId,
  customerName,
  activeCards,
  onDone,
}: UnloadCustomerModalProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [action, setAction] = useState<UnloadAction>('planning_queue');
  const [loading, setLoading] = useState(false);
  const [targetCardId, setTargetCardId] = useState('');
  const [notes, setNotes] = useState('');
  const [newCardDest, setNewCardDest] = useState('');

  const handleSubmit = async () => {
    setLoading(true);
    try {
      let body: Record<string, unknown> = {};

      if (action === 'planning_queue') {
        body = { action: 'unload', destination: 'planning_queue', notes };
      } else if (action === 'move_to_card') {
        if (!targetCardId) {
          addToast('Please select a target card', 'error');
          setLoading(false);
          return;
        }
        body = { action: 'move', target_card_id: targetCardId, notes };
      } else if (action === 'create_card') {
        if (!newCardDest.trim()) {
          addToast('Please enter a destination', 'error');
          setLoading(false);
          return;
        }
        body = { action: 'create_card', new_destination: newCardDest, notes };
      } else if (action === 'delayed') {
        body = { action: 'unload', destination: 'planning_queue', reason: 'delayed', notes };
      }

      const res = await fetch(`/api/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unload: true, ...body }),
      });
      if (!res.ok) throw new Error('Failed to unload customer');
      addToast('Customer unloaded', 'success');
      onDone();
      onClose();
    } catch {
      addToast('Failed to unload customer', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Unload / Move Customer" size="md">
      <p className="text-sm text-slate-600 mb-4">
        Choose what to do with <strong>{customerName}</strong>:
      </p>

      <div className="space-y-3 mb-4">
        {([
          { value: 'planning_queue', label: 'Move to planning queue', desc: 'Add to the queue for future scheduling' },
          { value: 'move_to_card', label: 'Move to another delivery card', desc: 'Transfer to an existing active card' },
          { value: 'create_card', label: 'Create a new delivery card', desc: 'Create a new card for this customer' },
          { value: 'delayed', label: 'Mark as delayed / waiting', desc: 'Move to planning queue with delayed reason' },
        ] as Array<{ value: UnloadAction; label: string; desc: string }>).map((opt) => (
          <label
            key={opt.value}
            className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
              action === opt.value ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <input
              type="radio"
              name="action"
              value={opt.value}
              checked={action === opt.value}
              onChange={() => setAction(opt.value)}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm font-medium text-slate-900">{opt.label}</p>
              <p className="text-xs text-slate-500">{opt.desc}</p>
            </div>
          </label>
        ))}
      </div>

      {action === 'move_to_card' && (
        <div className="mb-4">
          <Select
            label="Target delivery card"
            value={targetCardId}
            onChange={(e) => setTargetCardId(e.target.value)}
            placeholder="Select a card..."
            options={activeCards.map((c) => ({
              value: c.id,
              label: `${c.delivery_ref} — ${c.destination}`,
            }))}
          />
        </div>
      )}

      {action === 'create_card' && (
        <div className="mb-4">
          <Input
            label="New card destination"
            value={newCardDest}
            onChange={(e) => setNewCardDest(e.target.value)}
            placeholder="Destination for new card"
          />
        </div>
      )}

      <Textarea
        label="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Any notes..."
        rows={2}
      />

      <div className="flex gap-3 justify-end mt-4">
        <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
        <Button onClick={handleSubmit} loading={loading}>Confirm</Button>
      </div>
    </Modal>
  );
}
