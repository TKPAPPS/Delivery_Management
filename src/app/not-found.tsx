import Link from 'next/link';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 w-full max-w-sm text-center overflow-hidden">
        <div className="h-1 w-full" style={{ backgroundColor: '#7d1535' }} />
        <div className="p-10">
          <div className="flex justify-center mb-6">
            <div className="bg-slate-100 text-slate-500 rounded-xl p-3">
              <Compass className="w-8 h-8" />
            </div>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Page not found</h1>
          <p className="text-slate-500 text-sm mb-6">
            The page or delivery you&apos;re looking for doesn&apos;t exist or may have been removed.
          </p>
          <Link
            href="/dashboard"
            className="inline-block text-sm font-medium text-white rounded-lg px-4 py-2.5 transition-colors"
            style={{ backgroundColor: '#7d1535' }}
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
