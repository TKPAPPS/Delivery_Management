'use client';

import { useState, useCallback } from 'react';
import type { DeliveryCardFull, DeliveryCard, Driver, DeliveryStatus } from '@/types';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import StatusDropdown from '@/components/cards/StatusDropdown';
import DriverSection from '@/components/cards/DriverSection';
import CustomerSection from '@/components/cards/CustomerSection';
import AddCustomerForm from '@/components/cards/AddCustomerForm';
import CommentThread from '@/components/cards/CommentThread';
import ActivityLogSection from '@/components/cards/ActivityLogSection';
import AttachmentSection from '@/components/cards/AttachmentSection';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToastStore } from '@/store/toastStore';
import { formatDate, statusColor, statusLabel } from '@/lib/utils';
import DestinationInput from '@/components/ui/DestinationInput';
import { ArrowLeft, AlertTriangle, Archive, Plus, Pencil, X, Check } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface CardDetailClientProps {
  card: DeliveryCardFull;
  drivers: Driver[];
  activeCards: Array<Pick<DeliveryCard, 'id' | 'delivery_ref' | 'destination'>>;
}

export default function CardDetailClient({ card: initialCard, drivers, activeCards }: CardDetailClientProps) {
  const addToast = useToastStore((s) => s.addToast);
  const router = useRouter();
  const [card, setCard] = useState(initialCard);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editFields, setEditFields] = useState({
    destination: card.destination,
    planned_date: card.planned_date ?? '',
    priority: card.priority as 'normal' | 'urgent',
    internal_notes: card.internal_notes ?? '',
  });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/cards/${card.id}`);
      const data = await res.json();
      if (data.card) setCard(data.card);
    } catch {
      // ignore
    }
  }, [card.id]);

  const handleStatusChange = (status: DeliveryStatus) => {
    setCard((c) => ({ ...c, status }));
  };

  const handleCardUpdated = (data: Partial<DeliveryCard>) => {
    setCard((c) => ({ ...c, ...data }));
  };

  const handleArchive = async () => {
    setArchiving(true);
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_archived: true, archived_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error('Failed to archive card');
      addToast('Card archived', 'success');
      router.push('/board');
    } catch {
      addToast('Failed to archive card', 'error');
    } finally {
      setArchiving(false);
      setArchiveOpen(false);
    }
  };

  const handleEditSave = async () => {
    setSaving(true);
    try {
      const payload: Partial<DeliveryCard> = {
        destination: editFields.destination,
        planned_date: editFields.planned_date || null,
        priority: editFields.priority,
        internal_notes: editFields.internal_notes || null,
      };
      const res = await fetch(`/api/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to save');
      setCard((c) => ({ ...c, ...payload }));
      setEditing(false);
      addToast('Card updated', 'success');
    } catch {
      addToast('Failed to save changes', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEditCancel = () => {
    setEditFields({
      destination: card.destination,
      planned_date: card.planned_date ?? '',
      priority: card.priority,
      internal_notes: card.internal_notes ?? '',
    });
    setEditing(false);
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <Link href="/board" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="w-4 h-4" /> Board
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-sm text-slate-700 font-mono">{card.delivery_ref}</span>
      </div>

      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs text-crimson-700">{card.delivery_ref}</span>
              {!editing && card.priority === 'urgent' && (
                <Badge variant="danger">
                  <AlertTriangle className="w-3 h-3 mr-1" /> Urgent
                </Badge>
              )}
            </div>

            {editing ? (
              <div className="space-y-3">
                <DestinationInput
                  label="Destination"
                  value={editFields.destination}
                  onChange={(v) => setEditFields((f) => ({ ...f, destination: v }))}
                />
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Planned Date</label>
                    <input
                      type="date"
                      value={editFields.planned_date}
                      onChange={(e) => setEditFields((f) => ({ ...f, planned_date: e.target.value }))}
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-crimson-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Priority</label>
                    <select
                      value={editFields.priority}
                      onChange={(e) => setEditFields((f) => ({ ...f, priority: e.target.value as 'normal' | 'urgent' }))}
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-crimson-500"
                    >
                      <option value="normal">Normal</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Internal Notes</label>
                  <textarea
                    value={editFields.internal_notes}
                    onChange={(e) => setEditFields((f) => ({ ...f, internal_notes: e.target.value }))}
                    rows={3}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-crimson-500 resize-none"
                    placeholder="Internal notes..."
                  />
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-slate-900">{card.destination}</h1>
                {card.planned_date && (
                  <p className="text-sm text-slate-500 mt-1">Planned: {formatDate(card.planned_date)}</p>
                )}
                {card.internal_notes && (
                  <p className="text-sm text-slate-600 mt-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
                    {card.internal_notes}
                  </p>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {editing ? (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleEditSave}
                  loading={saving}
                >
                  <Check className="w-4 h-4" /> Save
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEditCancel}
                  disabled={saving}
                >
                  <X className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(true)}
                  className="text-slate-500"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <StatusDropdown
                  cardId={card.id}
                  currentStatus={card.status}
                  onStatusChange={handleStatusChange}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setArchiveOpen(true)}
                  className="text-slate-500"
                >
                  <Archive className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Status timeline */}
        <div className="flex items-center gap-2 flex-wrap">
          {(['draft', 'driver_needed', 'driver_booked', 'loaded'] as DeliveryStatus[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <span className="text-slate-300">→</span>}
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                s === card.status ? statusColor(card.status) : 'bg-slate-100 text-slate-400'
              }`}>
                {statusLabel(s)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Driver Section */}
      <div className="mb-6">
        <DriverSection card={card} drivers={drivers} onUpdated={handleCardUpdated} />
      </div>

      {/* Customers Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddCustomer((v) => !v)}
          >
            <Plus className="w-4 h-4" /> Add Customer
          </Button>
        </div>
        {showAddCustomer && (
          <div className="mb-3">
            <AddCustomerForm
              cardId={card.id}
              onAdded={() => { setShowAddCustomer(false); refresh(); }}
              onCancel={() => setShowAddCustomer(false)}
            />
          </div>
        )}
        <CustomerSection
          customers={card.customers}
          card={card}
          activeCards={activeCards}
          onRefresh={refresh}
        />
      </div>

      {/* Comments */}
      <div className="mb-6">
        <CommentThread
          cardId={card.id}
          comments={card.comments}
          onRefresh={refresh}
        />
      </div>

      {/* Attachments */}
      <div className="mb-6">
        <AttachmentSection
          cardId={card.id}
          attachments={card.attachments}
          onRefresh={refresh}
        />
      </div>

      {/* Activity Log */}
      <div className="mb-6">
        <ActivityLogSection logs={card.activity_log} />
      </div>

      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={handleArchive}
        title="Archive Card"
        message="Archive this delivery card? It will be moved to the archive and hidden from the board."
        confirmLabel="Archive"
        loading={archiving}
      />
    </div>
  );
}
