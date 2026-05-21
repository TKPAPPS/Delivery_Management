import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { DeliveryStatus, DeliveryPriority } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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
