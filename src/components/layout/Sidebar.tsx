'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Columns, History, Users, Truck, ClipboardList, BookUser, Settings, X, Mail, Plane, MessageSquare, ShoppingCart, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  role?: string;
  onNavClick?: () => void;
}

const mainNav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/orders', label: 'Orders', icon: ShoppingCart },
  { href: '/board', label: 'Board', icon: Columns },
  { href: '/planning-queue', label: 'Planning Queue', icon: ClipboardList },
  { href: '/archive', label: 'History', icon: History },
];

const adminNav = [
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/customers', label: 'Customers', icon: BookUser },
  { href: '/admin/drivers', label: 'Drivers', icon: Truck },
  { href: '/admin/courier-companies', label: 'Couriers', icon: Mail },
  { href: '/admin/cargo-companies', label: 'Cargo Co.', icon: Plane },
  { href: '/admin/communications', label: 'Communications', icon: MessageSquare },
  { href: '/admin/message-templates', label: 'Msg Templates', icon: Mail },
  { href: '/admin/odoo-sync', label: 'Odoo Sync', icon: RefreshCw },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ role, onNavClick }: SidebarProps) {
  const pathname = usePathname();

  const NavItem = ({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) => {
    const active = pathname === href || pathname.startsWith(href + '/');
    return (
      <Link
        href={href}
        onClick={onNavClick}
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
    <aside className="w-56 md:w-56 bg-white border-r border-slate-200 flex-shrink-0 flex flex-col py-4 overflow-y-auto h-full">
      {/* Mobile close button */}
      {onNavClick && (
        <div className="flex justify-end px-3 pb-2 md:hidden">
          <button
            onClick={onNavClick}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
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
                .filter((item) => {
                  if (item.href === '/admin/users') return role === 'admin';
                  if (item.href === '/admin/communications') return role === 'admin';
                  if (item.href === '/admin/message-templates') return role === 'admin';
                  if (item.href === '/admin/odoo-sync') return role === 'admin';
                  return true;
                })
                .map((item) => <NavItem key={item.href} {...item} />)}
            </div>
          </div>
        )}
      </nav>
    </aside>
  );
}
