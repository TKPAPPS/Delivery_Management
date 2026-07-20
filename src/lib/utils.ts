import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { DeliveryStatus, DeliveryPriority } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Dates are always displayed as dd/mm/yyyy (en-GB), app-wide.
export function formatDate(dateString: string | null | undefined, timeZone?: string): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone,
  });
}

// Local YYYY-MM-DD for a Date (task due_date is a plain date; team works in one timezone).
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Parse a YYYY-MM-DD string into a local Date at midnight (avoids UTC shifting).
export function parseYMD(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '—';
  // toLocaleString (not toLocaleDateString) so the time is actually included.
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatRef(ref: string): string {
  return ref;
}

export function statusLabel(status: DeliveryStatus): string {
  const labels: Record<DeliveryStatus, string> = {
    draft: 'Draft',
    pending_booking: 'Pending Booking',
    booked: 'Booked',
    in_transit: 'In Transit',
    delivered: 'Delivered',
  };
  return labels[status];
}

export function statusColor(status: DeliveryStatus): string {
  const colors: Record<DeliveryStatus, string> = {
    draft: 'bg-gray-100 text-gray-700',
    pending_booking: 'bg-amber-100 text-amber-800',
    booked: 'bg-blue-100 text-blue-800',
    in_transit: 'bg-green-100 text-green-800',
    delivered: 'bg-teal-100 text-teal-800',
  };
  return colors[status];
}

export function priorityLabel(priority: DeliveryPriority): string {
  return priority === 'urgent' ? 'Urgent' : 'Normal';
}

export function orderPriorityLabel(priority: number): string {
  const labels: Record<number, string> = { 1: 'Lowest', 2: 'Low', 3: 'Medium', 4: 'High', 5: 'Critical' };
  return labels[priority] ?? String(priority);
}

export function orderPriorityColor(priority: number): string {
  if (priority === 5) return 'bg-red-100 text-red-700';
  if (priority === 4) return 'bg-orange-100 text-orange-700';
  if (priority === 3) return 'bg-amber-100 text-amber-700';
  if (priority === 2) return 'bg-sky-100 text-sky-700';
  return 'bg-slate-100 text-slate-600';
}

export function orderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Pending', assigned: 'Assigned', partial: 'Partial',
    completed: 'Completed', cancelled: 'Cancelled',
  };
  return labels[status] ?? status;
}

export function orderStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: 'bg-slate-100 text-slate-700',
    assigned: 'bg-blue-100 text-blue-700',
    partial: 'bg-amber-100 text-amber-700',
    completed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-700',
  };
  return colors[status] ?? 'bg-gray-100 text-gray-600';
}

/**
 * The reference to show for an order. Odoo-sourced orders display their real Odoo
 * sale-order number (e.g. "S00123"); manual orders fall back to the generated ORD- code.
 */
export function displayOrderRef(order: { order_ref: string; odoo_order_ref?: string | null }): string {
  return order.odoo_order_ref || order.order_ref;
}

/**
 * Split a free-text email field into individual addresses (comma / semicolon /
 * whitespace separated) and validate each. Used so customers can hold multiple
 * recipient addresses in one field. An empty string yields no addresses and no errors.
 */
export function parseEmailList(input: string | null | undefined): { valid: string[]; invalid: string[] } {
  const parts = (input ?? '').split(/[,;\s]+/).map((p) => p.trim()).filter(Boolean);
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) (re.test(p) ? valid : invalid).push(p);
  return { valid, invalid };
}

// Thai baht amounts, app-wide. Whole numbers show no decimals; fractional values show up to 2.
export function formatTHB(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return '—';
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Per-customer delivery cost split.
 *
 * Splits the car cost proportionally by each customer's order value, rounds each share
 * UP to the nearest 10 THB, then adds a flat `surchargePerAdded` (default 200) for every
 * customer that is NOT the original booker. The surcharge is charged on top of the car
 * cost, so the grand total exceeds `carCost` by `surcharge × addedCount`.
 *
 * `needsValues` is true when no positive order values are present, so the split can't be
 * computed by value; the UI should prompt for values instead of showing a split.
 */
export const SURCHARGE_PER_ADDED = 200;

export interface CostSplitInput {
  id: string;
  value: number | null;
  isOriginal: boolean;
}

export interface CostSplitRow {
  id: string;
  value: number;
  rawShare: number;
  roundedShare: number;
  surcharge: number;
  total: number;
}

export interface CostSplitResult {
  rows: CostSplitRow[];
  totalValue: number;
  baseTotal: number;
  surchargeTotal: number;
  grandTotal: number;
  needsValues: boolean;
}

export function computeCostSplit(
  carCost: number | null | undefined,
  customers: CostSplitInput[],
  surchargePerAdded: number = SURCHARGE_PER_ADDED,
): CostSplitResult {
  const cost = typeof carCost === 'number' && Number.isFinite(carCost) ? carCost : 0;
  const totalValue = customers.reduce((sum, c) => sum + (c.value ?? 0), 0);
  const needsValues = totalValue <= 0;

  const rows: CostSplitRow[] = customers.map((c) => {
    const value = c.value ?? 0;
    const rawShare = needsValues ? 0 : (cost * value) / totalValue;
    const roundedShare = Math.ceil(rawShare / 10) * 10;
    const surcharge = c.isOriginal ? 0 : surchargePerAdded;
    return { id: c.id, value, rawShare, roundedShare, surcharge, total: roundedShare + surcharge };
  });

  const baseTotal = rows.reduce((s, r) => s + r.roundedShare, 0);
  const surchargeTotal = rows.reduce((s, r) => s + r.surcharge, 0);
  return { rows, totalValue, baseTotal, surchargeTotal, grandTotal: baseTotal + surchargeTotal, needsValues };
}

export function timeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(dateString);
}
