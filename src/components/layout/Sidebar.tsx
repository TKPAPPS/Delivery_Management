'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Columns, Archive, Users, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  role?: string;
}

const mainNav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/board', label: 'Board', icon: Columns },
  { href: '/archive', label: 'Archive', icon: Archive },
];

const adminNav = [
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/drivers', label: 'Drivers', icon: Truck },
];

export default function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();

  const NavItem = ({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) => {
    const active = pathname === href || pathname.startsWith(href + '/');
    return (
      <Link
        href={href}
        className={cn(
          'flex items-center gap-3 px-4 py-2.5 text-sm rounded-r-none transition-colors',
          active
            ? 'bg-crimson-50 text-crimson-700 border-r-2 border-crimson-700 font-semibold'
            : 'text-slate-900 hover:bg-slate-50 hover:text-black rounded-lg mx-2'
        )}
      >
        <Icon className={cn('w-4 h-4', active ? 'text-crimson-700' : 'text-slate-700')} />
        {label}
      </Link>
    );
  };

  return (
    <aside className="w-56 bg-white border-r border-slate-200 flex-shrink-0 flex flex-col py-4 overflow-y-auto">
      <nav className="flex-1">
        <div className="mb-4">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider px-4 mb-1">Operations</p>
          <div className="space-y-0.5">
            {mainNav.map((item) => <NavItem key={item.href} {...item} />)}
          </div>
        </div>
        {(role === 'admin' || role === 'logistics') && (
          <div>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider px-4 mb-1">Admin</p>
            <div className="space-y-0.5">
              {adminNav
                .filter((item) => item.href !== '/admin/users' || role === 'admin')
                .map((item) => <NavItem key={item.href} {...item} />)}
            </div>
          </div>
        )}
      </nav>
    </aside>
  );
}
