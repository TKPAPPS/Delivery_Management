'use client';

import { useState, useCallback, useEffect } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useDebouncedCallback } from '@/lib/useDebouncedCallback';
import type { DeliveryCardFull, DeliveryCard, Driver, DeliveryStatus } from '@/types';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import StatusDropdown from '@/components/cards/StatusDropdown';
import LogisticsSection from '@/components/cards/LogisticsSection';
import CommunicationPanel from '@/components/cards/CommunicationPanel';
import CustomerSection from '@/components/cards/CustomerSection';
import AddCustomerForm from '@/components/cards/AddCustomerForm';
import CommentThread from '@/components/cards/CommentThread';
import ActivityLogSection from '@/components/cards/ActivityLogSection';
import AttachmentSection from '@/components/cards/AttachmentSection';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToastStore } from '@/store/toastStore';
import { formatDate, statusColor, statusLabel } from '@/lib/utils';
import DestinationInput from '@/components/ui/DestinationInput';
import { ArrowLeft, AlertTriangle, Archive, Plus, Pencil, X, Check, Printer } from 'lucide-react';
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
  const [unarchiving, setUnarchiving] = useState(false);
  const [markingDelivered, setMarkingDelivered] = useState(false);
  const [showDeliveredForm, setShowDeliveredForm] = useState(false);
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [markingInTransit, setMarkingInTransit] = useState(false);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editFields, setEditFields] = useState({
    destination: card.destination,
    planned_date: card.planned_date ?? '',
    priority: card.priority as 'normal' | 'urgent',
    loading_priority: card.loading_priority != null ? String(card.loading_priority) : '',
    single_customer_lock: card.single_customer_lock,
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

  // Live sync: refetch this card when it (or its customers) change from elsewhere.
  const scheduleRefresh = useDebouncedCallback(() => { void refresh(); });
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`card-${card.id}-realtime`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_cards', filter: `id=eq.${card.id}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_customers', filter: `delivery_card_id=eq.${card.id}` }, scheduleRefresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [card.id, scheduleRefresh]);

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

  const handleMarkDelivered = async () => {
    setMarkingDelivered(true);
    try {
      const res = await fetch(`/api/cards/${card.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'delivered', delivery_notes: deliveryNotes || null }),
      });
      if (!res.ok) throw new Error('Failed to mark as delivered');
      addToast('Delivery completed — card moved to History', 'success');
      router.push('/archive');
    } catch {
      addToast('Failed to mark as delivered', 'error');
    } finally {
      setMarkingDelivered(false);
    }
  };

  const handleMarkInTransit = async () => {
    setMarkingInTransit(true);
    try {
      const res = await fetch(`/api/cards/${card.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_transit' }),
      });
      if (!res.ok) throw new Error('Failed to dispatch');
      addToast("Vehicle dispatched — customers with email on file are notified with the driver's details", 'success');
      await refresh();
    } catch {
      addToast('Failed to mark as out for delivery', 'error');
    } finally {
      setMarkingInTransit(false);
    }
  };

  const handleUnarchive = async () => {
    setUnarchiving(true);
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_archived: false, archived_at: null }),
      });
      if (!res.ok) throw new Error('Failed to unarchive card');
      addToast('Card restored to board', 'success');
      router.push('/board');
    } catch {
      addToast('Failed to unarchive card', 'error');
    } finally {
      setUnarchiving(false);
    }
  };

  const handleEditSave = async () => {
    setSaving(true);
    try {
      const payload: Partial<DeliveryCard> = {
        destination: editFields.destination,
        planned_date: editFields.planned_date || null,
        priority: editFields.priority,
        loading_priority: editFields.loading_priority ? Number(editFields.loading_priority) : null,
        single_customer_lock: editFields.single_customer_lock,
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
      loading_priority: card.loading_priority != null ? String(card.loading_priority) : '',
      single_customer_lock: card.single_customer_lock,
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
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-mono text-xs text-crimson-700">{card.delivery_ref}</span>
              {card.is_archived && (
                <Badge variant="default">Archived</Badge>
              )}
              {!editing && card.priority === 'urgent' && (
                <Badge variant="danger">
                  <AlertTriangle className="w-3 h-3 mr-1" /> Urgent
                </Badge>
              )}
              {!editing && card.loading_priority != null && (
                <Badge variant="default">Load #{card.loading_priority}</Badge>
              )}
              {!editing && card.single_customer_lock && (
                <Badge variant="default">Single customer</Badge>
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
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Loading priority (1–10)</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={editFields.loading_priority}
                      onChange={(e) => setEditFields((f) => ({ ...f, loading_priority: e.target.value }))}
                      placeholder="Optional"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-crimson-500"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={editFields.single_customer_lock}
                    onChange={(e) => setEditFields((f) => ({ ...f, single_customer_lock: e.target.checked }))}
                    className="rounded border-slate-300 text-crimson-600 focus:ring-crimson-500"
                  />
                  Lock to a single customer (no additional customers can be added)
                </label>
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
                {card.delivery_notes && (
                  <p className="text-sm text-teal-700 mt-2 bg-teal-50 rounded-lg px-3 py-2 border border-teal-200">
                    <span className="font-medium">Delivery note:</span> {card.delivery_notes}
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
                <Link
                  href={`/cards/${card.id}/print`}
                  target="_blank"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-slate-500 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <Printer className="w-4 h-4" />
                </Link>
                {!card.is_archived && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(true)}
                    className="text-slate-500"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                )}
                {!card.is_archived && (
                  <StatusDropdown
                    cardId={card.id}
                    currentStatus={card.status}
                    onStatusChange={handleStatusChange}
                  />
                )}
                {card.is_archived ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUnarchive}
                    loading={unarchiving}
                    className="text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                  >
                    <Archive className="w-4 h-4" /> Restore
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setArchiveOpen(true)}
                    className="text-slate-500"
                  >
                    <Archive className="w-4 h-4" />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Status timeline */}
        <div className="flex items-center gap-2 flex-wrap">
          {(['draft', 'pending_booking', 'booked', 'in_transit', 'delivered'] as DeliveryStatus[]).map((s, i) => (
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

      {/* Booked — dispatch / out for delivery CTA (fires the driver-phone email to customers) */}
      {card.status === 'booked' && !card.is_archived && (() => {
        const driverPhone = (card.driver as Driver | null)?.phone ?? card.driver_phone_manual ?? '';
        const hasPhone = !!driverPhone.trim();
        return (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-indigo-800 text-sm">Ready to dispatch</p>
                <p className="text-xs text-indigo-600 mt-0.5">
                  {hasPhone
                    ? "Sends the vehicle out and emails the driver's phone to all customers on this vehicle."
                    : 'Assign a driver with a phone number first so customers can be notified.'}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkInTransit}
                loading={markingInTransit}
                disabled={!hasPhone}
                title={hasPhone ? undefined : 'Assign a driver with a phone first'}
                className="flex-shrink-0 border-indigo-400 text-indigo-700 hover:bg-indigo-100 font-semibold"
              >
                Mark as Out for Delivery
              </Button>
            </div>
          </div>
        );
      })()}

      {/* Loaded — mark as delivered CTA */}
      {card.status === 'in_transit' && !card.is_archived && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-6">
          {!showDeliveredForm ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-teal-800 text-sm">Delivery is in transit</p>
                <p className="text-xs text-teal-600 mt-0.5">Once delivered, mark it as completed to move it to History.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeliveredForm(true)}
                className="flex-shrink-0 border-teal-400 text-teal-700 hover:bg-teal-100 font-semibold"
              >
                ✓ Mark as Delivered
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="font-semibold text-teal-800 text-sm">Confirm delivery completion</p>
              <div>
                <label className="block text-xs font-medium text-teal-700 mb-1">Delivery notes (optional)</label>
                <textarea
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. Received by warehouse manager, receipt #1234"
                  className="w-full text-sm border border-teal-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none bg-white"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleMarkDelivered}
                  loading={markingDelivered}
                  className="bg-teal-600 hover:bg-teal-700 text-white border-none"
                >
                  ✓ Confirm Delivery
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setShowDeliveredForm(false); setDeliveryNotes(''); }}
                  disabled={markingDelivered}
                  className="text-teal-700"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Logistics Section */}
      <div className="mb-6">
        <LogisticsSection card={card} drivers={drivers} onUpdated={handleCardUpdated} />
      </div>

      {/* Customers Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            {card.single_customer_lock && card.customers.length >= 1 && (
              <span className="text-xs text-slate-500">Locked to one customer</span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddCustomer((v) => !v)}
            disabled={card.single_customer_lock && card.customers.length >= 1}
            title={card.single_customer_lock && card.customers.length >= 1 ? 'This vehicle is locked to a single customer' : undefined}
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

      {/* Communications */}
      <div className="mb-6">
        <CommunicationPanel card={card} customers={card.customers} />
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
        message="Use Archive for cancelled or abandoned deliveries. For completed deliveries, use 'Mark as Delivered' instead. Archive will hide this card from the board and move it to History."
        confirmLabel="Archive (Abandon)"
        loading={archiving}
      />
    </div>
  );
}
