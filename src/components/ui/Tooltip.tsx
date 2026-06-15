'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
 * Tooltip rendered in a portal to <body> with position:fixed, so it is never
 * clipped by an ancestor's overflow (e.g. the scrolling Kanban column) or hidden
 * behind another stacking context. Visible on hover AND keyboard focus; the
 * bubble is pointer-events-none so it never blocks clicks or drag-and-drop.
 */
export default function Tooltip({ label, children, side = 'top', focusable = true, className }: TooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const show = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 6;
    setCoords({
      left: r.left + r.width / 2,
      top: side === 'top' ? r.top - gap : r.bottom + gap,
    });
  };
  const hide = () => setCoords(null);

  return (
    <span
      ref={triggerRef}
      className={cn('relative inline-flex items-center cursor-help', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      {...(focusable ? { tabIndex: 0 } : {})}
    >
      {children}
      {mounted && coords && createPortal(
        <span
          role="tooltip"
          style={{
            position: 'fixed',
            left: coords.left,
            top: coords.top,
            transform: `translateX(-50%) ${side === 'top' ? 'translateY(-100%)' : ''}`,
          }}
          className={cn(
            'pointer-events-none z-[9999] w-max max-w-[15rem]',
            'rounded-md bg-slate-900 px-2 py-1 text-center text-xs font-normal leading-snug text-white shadow-lg',
          )}
        >
          {label}
        </span>,
        document.body,
      )}
    </span>
  );
}
