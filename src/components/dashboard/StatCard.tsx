import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import Link from 'next/link';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  color?: 'blue' | 'amber' | 'green' | 'red' | 'gray';
  subtitle?: string;
  href?: string;
}

export default function StatCard({ title, value, icon: Icon, color = 'blue', subtitle, href }: StatCardProps) {
  const colors = {
    blue: {
      bg: 'bg-blue-50',
      icon: 'text-blue-600',
      border: 'border-l-blue-500',
    },
    amber: {
      bg: 'bg-gold-50',
      icon: 'text-gold-500',
      border: 'border-l-gold-500',
    },
    green: {
      bg: 'bg-green-50',
      icon: 'text-green-600',
      border: 'border-l-green-500',
    },
    red: {
      bg: 'bg-red-50',
      icon: 'text-red-600',
      border: 'border-l-red-500',
    },
    gray: {
      bg: 'bg-gray-50',
      icon: 'text-gray-600',
      border: 'border-l-gray-400',
    },
  };

  const c = colors[color];

  const inner = (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-500 font-medium">{title}</p>
        <div className={cn('p-2 rounded-lg', c.bg)}>
          <Icon className={cn('w-4 h-4', c.icon)} />
        </div>
      </div>
      <p className="text-3xl font-bold text-slate-900">{value}</p>
      {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cn('block bg-white rounded-xl border border-slate-200 border-l-4 p-5 hover:shadow-md transition-shadow', c.border)}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={cn('bg-white rounded-xl border border-slate-200 border-l-4 p-5', c.border)}>
      {inner}
    </div>
  );
}
