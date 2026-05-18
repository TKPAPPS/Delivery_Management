'use client';

import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Kanban,
  Archive,
  Users,
  Truck,
  List,
  LogOut,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Profile } from '@/types';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';

interface SidebarProps {
  profile: Profile | null;
  mobile?: boolean;
  onClose?: () => void;
}

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/board', icon: Kanban, label: 'Board' },
  { href: '/archive', icon: Archive, label: 'Archive' },
];

const adminItems = [
  { href: '/admin/users', icon: Users, label: 'Users', roles: ['admin'] },
  { href: '/admin/drivers', icon: Truck, label: 'Drivers', roles: ['admin', 'logistics'] },
];

export default function Sidebar({ profile, mobile, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  const visibleAdminItems = adminItems.filter(
    (item) => profile && item.roles.includes(profile.role)
  );

  return (
    <nav
      className={cn(
        'flex flex-col bg-slate-900 text-slate-300 h-full',
        mobile ? 'w-64' : 'w-56'
      )}
    >
      <div className="flex-1 py-4 overflow-y-auto">
        <div className="px-3 mb-6">
          <p className="text-xs uppercase tracking-wider text-slate-500 font-medium px-3 mb-2">
            Main
          </p>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-0.5',
                pathname === item.href || pathname.startsWith(item.href + '/')
                  ? 'bg-slate-700 text-white'
                  : 'hover:bg-slate-800 hover:text-white'
              )}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </Link>
          ))}
        </div>

        {visibleAdminItems.length > 0 && (
          <div className="px-3 mb-6">
            <p className="text-xs uppercase tracking-wider text-slate-500 font-medium px-3 mb-2">
              Admin
            </p>
            {visibleAdminItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-0.5',
                  pathname.startsWith(item.href)
                    ? 'bg-slate-700 text-white'
                    : 'hover:bg-slate-800 hover:text-white'
                )}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-slate-700 p-3">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium w-full hover:bg-slate-800 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          Sign out
        </button>
      </div>
    </nav>
  );
}
