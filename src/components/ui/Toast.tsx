'use client';

import { cn } from '@/lib/utils';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import type { Toast as ToastType } from '@/store/toastStore';
import { useToastStore } from '@/store/toastStore';

interface ToastProps {
  toast: ToastType;
}

export default function Toast({ toast }: ToastProps) {
  const removeToast = useToastStore((s) => s.removeToast);

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-green-500" />,
    error: <XCircle className="w-5 h-5 text-red-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
  };

  const borders = {
    success: 'border-l-green-500',
    error: 'border-l-red-500',
    info: 'border-l-blue-500',
    warning: 'border-l-amber-500',
  };

  return (
    <div
      className={cn(
        'flex items-start gap-3 bg-white border border-slate-200 border-l-4 rounded-lg shadow-lg p-4 min-w-[300px] max-w-sm',
        borders[toast.type]
      )}
    >
      <div className="flex-shrink-0 mt-0.5">{icons[toast.type]}</div>
      <p className="flex-1 text-sm text-slate-700">{toast.message}</p>
      {toast.action && (
        <button
          onClick={() => { toast.action!.onClick(); removeToast(toast.id); }}
          className="flex-shrink-0 text-sm font-semibold text-crimson-700 hover:text-crimson-800 transition-colors"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={() => removeToast(toast.id)}
        className="flex-shrink-0 text-slate-400 hover:text-slate-600 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
