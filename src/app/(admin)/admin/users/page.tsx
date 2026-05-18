'use client';

import { useEffect, useState } from 'react';
import type { Profile, UserRole } from '@/types';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import { useToastStore } from '@/store/toastStore';
import { Users, RefreshCw } from 'lucide-react';
import { formatDate } from '@/lib/utils';

export default function AdminUsersPage() {
  const addToast = useToastStore((s) => s.addToast);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      setUsers(data.users ?? []);
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

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-slate-500" />
          <h1 className="text-xl font-bold text-slate-900">Users</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchUsers} loading={loading}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading users...</div>
      ) : (
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
                      options={[
                        { value: 'admin', label: 'Admin' },
                        { value: 'sales', label: 'Sales' },
                        { value: 'stock_manager', label: 'Stock Manager' },
                        { value: 'logistics', label: 'Logistics' },
                      ]}
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
            <div className="text-center py-12 text-slate-400">No users found</div>
          )}
        </div>
      )}
    </div>
  );
}
