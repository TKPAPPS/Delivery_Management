import { createSupabaseServerClient } from '@/lib/supabase-server';
import StatCard from '@/components/dashboard/StatCard';
import UpcomingDeliveries from '@/components/dashboard/UpcomingDeliveries';
import RecentCards from '@/components/dashboard/RecentCards';
import { LayoutDashboard, Truck, CheckSquare, AlertTriangle, Clock } from 'lucide-react';
import type { DeliveryCard } from '@/types';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();

  // Counts by status
  const { data: cards } = await supabase
    .from('delivery_cards')
    .select('id, status, priority, planned_date, destination, delivery_ref, updated_at, status_changed_at, is_archived')
    .eq('is_archived', false)
    .order('updated_at', { ascending: false });

  const allCards = (cards ?? []) as DeliveryCard[];

  const counts = {
    draft: allCards.filter((c) => c.status === 'draft').length,
    driver_needed: allCards.filter((c) => c.status === 'driver_needed').length,
    driver_booked: allCards.filter((c) => c.status === 'driver_booked').length,
    loaded: allCards.filter((c) => c.status === 'loaded').length,
    urgent: allCards.filter((c) => c.priority === 'urgent').length,
  };

  const today = new Date();
  const in14Days = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
  const todayStr = today.toISOString().split('T')[0];
  const in14DaysStr = in14Days.toISOString().split('T')[0];

  const upcoming = allCards
    .filter((c) => c.planned_date && c.planned_date >= todayStr && c.planned_date <= in14DaysStr)
    .sort((a, b) => (a.planned_date ?? '').localeCompare(b.planned_date ?? ''))
    .slice(0, 10);

  const recent = allCards.slice(0, 5);

  const stuckDriverNeeded = allCards
    .filter((c) => c.status === 'driver_needed')
    .sort((a, b) => a.status_changed_at.localeCompare(b.status_changed_at))
    .slice(0, 5);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <LayoutDashboard className="w-5 h-5 text-slate-500" />
        <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        <StatCard title="Draft" value={counts.draft} icon={LayoutDashboard} color="gray" />
        <StatCard title="Driver Needed" value={counts.driver_needed} icon={AlertTriangle} color="amber" />
        <StatCard title="Driver Booked" value={counts.driver_booked} icon={Truck} color="blue" />
        <StatCard title="Loaded" value={counts.loaded} icon={CheckSquare} color="green" />
        <StatCard title="Urgent" value={counts.urgent} icon={AlertTriangle} color="red" />
      </div>

      {/* Main grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        <UpcomingDeliveries cards={upcoming} />
        <RecentCards cards={recent} title="Recently Updated" />
        {stuckDriverNeeded.length > 0 && (
          <div className="lg:col-span-2">
            <RecentCards
              cards={stuckDriverNeeded}
              title="Awaiting Driver (Longest Waiting)"
            />
          </div>
        )}
      </div>
    </div>
  );
}
