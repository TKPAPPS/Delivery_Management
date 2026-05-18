'use client';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

interface AppShellProps {
  children: React.ReactNode;
  userEmail?: string;
  userName?: string;
  role?: string;
}

export default function AppShell({ children, userEmail, userName, role }: AppShellProps) {
  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      <Navbar userEmail={userEmail} userName={userName} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar role={role} />
        <main className="flex-1 overflow-y-auto bg-slate-50">
          {children}
        </main>
      </div>
    </div>
  );
}
