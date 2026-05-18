'use client';
import { useState } from 'react';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

interface AppShellProps {
  children: React.ReactNode;
  userEmail?: string;
  userName?: string;
  role?: string;
}

export default function AppShell({ children, userEmail, userName, role }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      <Navbar
        userEmail={userEmail}
        userName={userName}
        onMenuClick={() => setSidebarOpen(true)}
      />
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden md:block flex-shrink-0">
          <Sidebar role={role} />
        </div>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div
              className="fixed inset-0 bg-black/40"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="relative z-50 w-64 bg-white h-full shadow-xl">
              <Sidebar role={role} onNavClick={() => setSidebarOpen(false)} />
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto bg-slate-50">
          {children}
        </main>
      </div>
    </div>
  );
}
