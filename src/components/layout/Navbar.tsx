'use client';

import { cn } from '@/lib/utils';
import { Menu, Truck, Bell } from 'lucide-react';
import Link from 'next/link';
import type { Profile } from '@/types';

interface NavbarProps {
  profile: Profile | null;
  onMenuClick?: () => void;
}

export default function Navbar({ profile, onMenuClick }: NavbarProps) {
  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-4 flex-shrink-0">
      <button
        className="lg:hidden text-slate-500 hover:text-slate-700 p-1"
        onClick={onMenuClick}
      >
        <Menu className="w-5 h-5" />
      </button>
      <Link href="/dashboard" className="flex items-center gap-2 text-slate-900 font-semibold">
        <div className="bg-blue-600 text-white rounded-lg p-1">
          <Truck className="w-4 h-4" />
        </div>
        <span className="hidden sm:block">Delivery Board</span>
      </Link>
      <div className="flex-1" />
      <div className="flex items-center gap-3">
        <Bell className="w-5 h-5 text-slate-400" />
        {profile && (
          <div className="flex items-center gap-2">
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
              'bg-blue-600 text-white'
            )}>
              {(profile.name ?? profile.email).charAt(0).toUpperCase()}
            </div>
            <span className="hidden md:block text-sm text-slate-700">
              {profile.name ?? profile.email}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
