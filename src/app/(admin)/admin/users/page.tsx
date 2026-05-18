'use client';

import { useEffect, useState } from 'react';
import type { Profile, UserRole } from '@/types';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import { useToastStore } from '@/store/toastStore';
import { Users, RefreshCw, UserPlus, Mail, Clock } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface PreApproved {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
}

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'sales', label: 'Sales' },
  { value: 'stock_manager', label: 'Stock Manager' },
  { value: 'logistics', label: 'Logistics' },
];

export default function AdminUsersPage() {
  const addToast = useToastStore((s) => s.addToast);
  const [users, setUsers] = useState<Profile[]>([]);
  const [pending, setPending] = useState<PreApproved[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  // Add user modal
  const [addOpen, setAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState<UserRole>('sales');
  const [adding, setAdding] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      setUsers(data.users ?? []);
      setPending(data.pending ?? []);
    } catch {
      addToast('Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchUsers(); }, []);

  const updateUser = async (id: string, updates: Partial<Profile>) => {
    setUpdating(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update user');
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...updates } : u)));
      addToast('User updated', 'success');
    } catch {
      addToast('Failed to update user', 'error');
    } finally {
      setUpdating(null);
    }
  };

  const handleAddUser = async () => {
    if (!addEmail.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addEmail.trim(), role: addRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to add user');
      addToast(
        data.activated ? 'User activated' : 'User pre-approved — they can now sign in',
        'success'
      );
      setAddEmail('');
      setAddRole('sales');
      setAddOpen(false);
      fetchUsers();
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Failed to add user', 'error');
    } finally {
      setAdding(false);
    }
  };

  const removePending = async (id: string) => {
    try {
      await fetch(`/api/admin/users/pre-approved/${id}`, { method: 'DELETE' });
      setPending((p) => p.filter((e) => e.id !== id));
      addToast('Removed', 'success');
    } catch {
      addToast('Failed to remove', 'error');
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-slate-700" />
          <h1 className="text-xl font-bold text-black">Users</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={fetchUsers} loading={loading}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <UserPlus className="w-4 h-4" /> Add User
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading users...</div>
      ) : (
        <div className="space-y-6">
          {/* Active / registered users */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">User</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Role</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Joined</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{user.name ?? '—'}</p>
                      <p className="text-xs text-slate-500">{user.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={user.role}
                        onChange={(e) => updateUser(user.id, { role: e.target.value as UserRole })}
                        disabled={updating === user.id}
                        options={ROLE_OPTIONS}
                        className="py-1 text-xs"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={user.active ? 'success' : 'warning'}>
                        {user.active ? 'Active' : 'Pending'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(user.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant={user.active ? 'outline' : 'primary'}
                        onClick={() => updateUser(user.id, { active: !user.active })}
                        loading={updating === user.id}
                      >
                        {user.active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {users.length === 0 && (
              <div className="text-center py-12 text-slate-400">No users yet</div>
            )}
          </div>

          {/* Pre-approved emails (haven't signed in yet) */}
          {pending.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-600">Pre-approved — awaiting first sign-in</h2>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Email</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Role</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Added</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pending.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-slate-400" />
                            <span className="text-slate-700">{p.email}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 capitalize">{p.role.replace('_', ' ')}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(p.created_at)}</td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="ghost" onClick={() => removePending(p.id)}
                            className="text-red-500 hover:bg-red-50">
                            Remove
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add User Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add User" size="sm">
        <p className="text-sm text-slate-500 mb-4">
          Enter the email address of the person you want to add. If they have already signed in,
          they will be activated immediately. Otherwise they will be auto-approved when they sign in with Google.
        </p>
        <div className="space-y-3">
          <Input
            label="Email address"
            type="email"
            placeholder="name@example.com"
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddUser()}
          />
          <Select
            label="Role"
            value={addRole}
            onChange={(e) => setAddRole(e.target.value as UserRole)}
            options={ROLE_OPTIONS}
          />
        </div>
        <div className="flex gap-3 justify-end mt-4">
          <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={adding}>Cancel</Button>
          <Button onClick={handleAddUser} loading={adding} disabled={!addEmail.trim()}>
            <UserPlus className="w-4 h-4" /> Add User
          </Button>
        </div>
      </Modal>
    </div>
  );
}
