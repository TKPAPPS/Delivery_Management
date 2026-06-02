'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import { useToastStore } from '@/store/toastStore';
import { useRouter } from 'next/navigation';
import { User } from 'lucide-react';

interface Props { email: string; name: string; roleLabel: string; }

export default function AccountClient({ email, name: initialName, roleLabel }: Props) {
  const addToast = useToastStore((s) => s.addToast);
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { addToast('Name is required', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error();
      addToast('Profile updated', 'success');
      router.refresh();
    } catch {
      addToast('Failed to update profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <User className="w-5 h-5 text-slate-700" />
        <h1 className="text-xl font-bold text-black">My Account</h1>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <Input label="Display name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
          <p className="text-sm text-slate-700">{email}</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Role</label>
          <Badge variant="default">{roleLabel}</Badge>
          <p className="text-xs text-slate-400 mt-1">Roles are managed by an admin.</p>
        </div>
        <div className="flex justify-end pt-1">
          <Button onClick={save} loading={saving} disabled={!name.trim() || name.trim() === initialName}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
