'use client';

import { useEffect, useMemo, useState } from 'react';
import type { DeliveryCard, DeliveryCardWithCustomers } from '@/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { Calculator } from 'lucide-react';
import { computeCostSplit, formatTHB, SURCHARGE_PER_ADDED } from '@/lib/utils';
import { useToastStore } from '@/store/toastStore';

interface CostSplitSectionProps {
  card: DeliveryCardWithCustomers;
  onUpdated: (data: Partial<DeliveryCard>) => void;
  onRefresh: () => void;
}

// Parse a money input string to a number, or null when blank. Returns undefined when invalid.
function parseMoney(v: string): number | null | undefined {
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

export default function CostSplitSection({ card, onUpdated, onRefresh }: CostSplitSectionProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [savingCost, setSavingCost] = useState(false);
  const [carCostInput, setCarCostInput] = useState(card.car_cost != null ? String(card.car_cost) : '');
  const [values, setValues] = useState<Record<string, string>>({});
  const [savingValue, setSavingValue] = useState<string | null>(null);

  // Sort customers the same way the Customer section does (loading_priority, then sort_order),
  // so the split rows line up with the visible customer order.
  const customers = useMemo(() => {
    return [...card.customers].sort((a, b) => {
      const ap = a.loading_priority ?? Infinity;
      const bp = b.loading_priority ?? Infinity;
      if (ap !== bp) return ap - bp;
      return a.sort_order - b.sort_order;
    });
  }, [card.customers]);

  // The surcharge-exempt customer: the explicitly chosen booker, else the earliest-added
  // (lowest sort_order) so there is always exactly one exempt customer. Fall back to the
  // default whenever the stored booker is no longer on this card (e.g. it was unloaded/moved),
  // otherwise a dangling id would exempt nobody and every customer would be surcharged.
  const defaultOriginalId = useMemo(() => {
    if (card.customers.length === 0) return null;
    return [...card.customers].sort((a, b) => a.sort_order - b.sort_order)[0].id;
  }, [card.customers]);
  const bookerOnCard = card.original_booker_id != null && card.customers.some((c) => c.id === card.original_booker_id);
  const effectiveOriginalId = bookerOnCard ? card.original_booker_id : defaultOriginalId;

  // Sync local inputs from server truth when it changes (after a save/refresh or a realtime update).
  useEffect(() => {
    setCarCostInput(card.car_cost != null ? String(card.car_cost) : '');
  }, [card.car_cost]);
  // Merge server values in without clobbering rows the user is currently editing: keep a local
  // value that differs from the server (a dirty, unsaved edit), otherwise take the server value.
  useEffect(() => {
    setValues((prev) => Object.fromEntries(card.customers.map((c) => {
      const server = c.order_value != null ? String(c.order_value) : '';
      const local = prev[c.id];
      return [c.id, local !== undefined && local !== server ? local : server];
    })));
  }, [card.customers]);

  const split = useMemo(() => {
    return computeCostSplit(
      card.car_cost,
      customers.map((c) => ({ id: c.id, value: c.order_value, isOriginal: c.id === effectiveOriginalId })),
    );
  }, [card.car_cost, customers, effectiveOriginalId]);
  const rowById = useMemo(() => new Map(split.rows.map((r) => [r.id, r])), [split.rows]);

  const carCostDirty = carCostInput.trim() !== (card.car_cost != null ? String(card.car_cost) : '');

  const saveCarCost = async () => {
    const parsed = parseMoney(carCostInput);
    if (parsed === undefined) {
      addToast('Car cost must be a non-negative number', 'error');
      return;
    }
    setSavingCost(true);
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ car_cost: parsed }),
      });
      if (!res.ok) throw new Error('Failed to save');
      onUpdated({ car_cost: parsed });
      addToast('Car cost saved', 'success');
    } catch {
      addToast('Failed to save car cost', 'error');
    } finally {
      setSavingCost(false);
    }
  };

  const saveBooker = async (id: string) => {
    const original_booker_id = id || null;
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ original_booker_id }),
      });
      if (!res.ok) throw new Error('Failed to save');
      onUpdated({ original_booker_id });
      addToast('Original booker updated', 'success');
    } catch {
      addToast('Failed to update original booker', 'error');
    }
  };

  const saveValue = async (customerId: string) => {
    const parsed = parseMoney(values[customerId] ?? '');
    if (parsed === undefined) {
      addToast('Order value must be a non-negative number', 'error');
      return;
    }
    setSavingValue(customerId);
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_value: parsed }),
      });
      if (!res.ok) throw new Error('Failed to save');
      onRefresh();
      addToast('Order value saved', 'success');
    } catch {
      addToast('Failed to save order value', 'error');
    } finally {
      setSavingValue(null);
    }
  };

  const addedCount = customers.filter((c) => c.id !== effectiveOriginalId).length;

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <Calculator className="w-5 h-5 text-slate-500" />
        <h2 className="text-base font-semibold text-slate-900">Cost Split</h2>
      </div>

      {/* Car cost + original booker */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              label="Car cost (THB)"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              placeholder="e.g. 10000"
              value={carCostInput}
              onChange={(e) => setCarCostInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && carCostDirty) saveCarCost(); }}
            />
          </div>
          <Button size="sm" onClick={saveCarCost} disabled={savingCost || !carCostDirty}>
            {savingCost ? 'Saving…' : 'Save'}
          </Button>
        </div>

        <Select
          label="Original booker (no surcharge)"
          value={effectiveOriginalId ?? ''}
          onChange={(e) => saveBooker(e.target.value)}
          options={customers.map((c) => ({ value: c.id, label: c.customer_name }))}
          placeholder={customers.length ? undefined : 'No customers yet'}
        />
      </div>

      {customers.length === 0 ? (
        <p className="text-sm text-slate-500">Add customers to the card to split the delivery cost.</p>
      ) : card.car_cost == null ? (
        <p className="text-sm text-slate-500">Enter the car cost above to see the per-customer breakdown.</p>
      ) : (
        <>
          {split.needsValues && (
            <p className="mb-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Enter each customer&apos;s order value below to split the cost by value.
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3 font-medium">Customer</th>
                  <th className="py-2 px-3 font-medium">Order value (THB)</th>
                  <th className="py-2 px-3 font-medium text-right">Share</th>
                  <th className="py-2 px-3 font-medium text-right">Surcharge</th>
                  <th className="py-2 pl-3 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.map((c) => {
                  const row = rowById.get(c.id);
                  const isOriginal = c.id === effectiveOriginalId;
                  const dirty = (values[c.id] ?? '') !== (c.order_value != null ? String(c.order_value) : '');
                  return (
                    <tr key={c.id} className="align-middle">
                      <td className="py-2 pr-3">
                        <span className="font-medium text-slate-800">{c.customer_name}</span>
                        {isOriginal && (
                          <span className="ml-2 inline-block bg-emerald-50 text-emerald-700 text-[11px] px-1.5 py-0.5 rounded">Original booker</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            inputMode="decimal"
                            placeholder="0"
                            className="w-32"
                            value={values[c.id] ?? ''}
                            onChange={(e) => setValues((prev) => ({ ...prev, [c.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter' && dirty) saveValue(c.id); }}
                          />
                          {dirty && (
                            <Button size="sm" variant="outline" onClick={() => saveValue(c.id)} disabled={savingValue === c.id}>
                              {savingValue === c.id ? '…' : 'Save'}
                            </Button>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-700">
                        {row ? formatTHB(row.roundedShare) : '—'}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-500">
                        {row && row.surcharge > 0 ? `+ ${formatTHB(row.surcharge)}` : '—'}
                      </td>
                      <td className="py-2 pl-3 text-right tabular-nums font-semibold text-slate-900">
                        {row ? formatTHB(row.total) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 text-slate-700">
                  <td className="py-2 pr-3 font-medium">Total</td>
                  <td className="py-2 px-3 tabular-nums font-semibold text-slate-900">{split.totalValue > 0 ? formatTHB(split.totalValue) : '—'}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{formatTHB(split.baseTotal)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{split.surchargeTotal > 0 ? `+ ${formatTHB(split.surchargeTotal)}` : '—'}</td>
                  <td className="py-2 pl-3 text-right tabular-nums font-bold text-slate-900">{formatTHB(split.grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Each share is the car cost split by order value, rounded up to the nearest 10 THB.
            {addedCount > 0 && (
              <> Added customers pay a flat {formatTHB(SURCHARGE_PER_ADDED)} surcharge each, so the total collected is {formatTHB(split.surchargeTotal)} above the car cost.</>
            )}
          </p>
        </>
      )}
    </section>
  );
}
