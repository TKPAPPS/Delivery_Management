'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[app error boundary]', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 w-full max-w-sm text-center overflow-hidden">
        <div className="h-1 w-full" style={{ backgroundColor: '#7d1535' }} />
        <div className="p-10">
          <div className="flex justify-center mb-6">
            <div className="bg-red-100 text-red-600 rounded-xl p-3">
              <AlertTriangle className="w-8 h-8" />
            </div>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h1>
          <p className="text-slate-500 text-sm mb-6">
            An unexpected error occurred. You can try again, or head back to the dashboard.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={reset}
              className="text-sm font-medium text-white rounded-lg px-4 py-2.5 transition-colors"
              style={{ backgroundColor: '#7d1535' }}
            >
              Try again
            </button>
            <Link
              href="/dashboard"
              className="text-sm font-medium text-slate-700 border border-slate-300 rounded-lg px-4 py-2.5 hover:bg-slate-50 transition-colors"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
