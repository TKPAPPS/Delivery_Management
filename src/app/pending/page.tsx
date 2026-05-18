import { Clock, Truck } from 'lucide-react';

export default function PendingPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-10 w-full max-w-sm text-center">
        <div className="flex justify-center mb-6">
          <div className="bg-amber-100 text-amber-600 rounded-xl p-3">
            <Clock className="w-8 h-8" />
          </div>
        </div>
        <div className="flex justify-center mb-4">
          <Truck className="w-5 h-5 text-slate-400" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Account Pending Approval</h1>
        <p className="text-slate-500 text-sm mb-6">
          Your account has been created but is waiting for an administrator to activate it.
          Please contact your team lead or system administrator.
        </p>
        <p className="text-xs text-slate-400">
          Once activated, refresh this page or sign in again.
        </p>
        <a
          href="/login"
          className="mt-4 inline-block text-sm text-blue-600 hover:underline"
        >
          Back to login
        </a>
      </div>
    </div>
  );
}
