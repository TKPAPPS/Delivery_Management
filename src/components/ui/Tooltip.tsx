'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TooltipProps {
  label: string;
  children: ReactNode;
  side?: 'top' | 'bottom';
  /** Add tabIndex so non-interactive triggers (icons/badges) are keyboard-reachable.
   *  Set false when the child is already focusable (a link/button) to avoid a double tab stop. */
  focusable?: boolean;
  className?: string;
}

/**
 * Lightweight CSS tooltip — visible on hover AND keyboard focus, no JS/portal.
 * The bubble is pointer-events-none so it never blocks clicks or drag-and-drop.
 */
export default function Tooltip({ label, children, side = 'top', focusable = true, className }: TooltipProps) {
  return (
    <span
      className={cn('relative inline-flex items-center group/tt cursor-help', className)}
      {...(focusable ? { tabIndex: 0 } : {})}
    >
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 hidden w-max max-w-[15rem]',
          'rounded-md bg-slate-900 px-2 py-1 text-center text-xs font-normal leading-snug text-white shadow-lg',
          'group-hover/tt:block group-focus-within/tt:block',
          side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
        )}
      >
        {label}
      </span>
    </span>
  );
}
