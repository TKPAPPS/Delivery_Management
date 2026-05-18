'use client';
import Link from 'next/link';
import { LogOut, User } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface NavbarProps {
  userEmail?: string;
  userName?: string;
}

export default function Navbar({ userEmail, userName }: NavbarProps) {
  const router = useRouter();
  const [logoError, setLogoError] = useState(false);

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0 z-40">
      <Link href="/dashboard" className="flex items-center">
        {!logoError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/logo.png"
            alt="The Kosher Place Delivery"
            className="h-10 w-auto"
            onError={() => setLogoError(true)}
          />
        ) : (
          <span className="text-xl font-bold" style={{ color: '#7d1535' }}>
            TKP <span style={{ color: '#c4963a' }}>Delivery</span>
          </span>
        )}
      </Link>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <div className="w-7 h-7 rounded-full bg-crimson-100 flex items-center justify-center">
            <User className="w-4 h-4 text-crimson-700" />
          </div>
          <span className="hidden sm:block">{userName || userEmail}</span>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-crimson-700 transition-colors px-3 py-1.5 rounded-lg hover:bg-crimson-50"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:block">Sign out</span>
        </button>
      </div>
    </header>
  );
}
