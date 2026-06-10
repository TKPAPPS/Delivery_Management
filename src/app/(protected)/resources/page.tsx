'use client';

import { useEffect, useState } from 'react';
import type { Resource } from '@/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import { useToastStore } from '@/store/toastStore';
import { LayoutGrid, Plus, Edit, Trash2, ExternalLink, RefreshCw } from 'lucide-react';

const CATEGORIES = ['Apps', 'Sheets', 'Documents', 'Other'];
const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({ value: c, label: c }));

export default function ResourcesPage() {
  const addToast = useToastStore((s) => s.addToast);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Resource | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Apps');

  const fetchResources = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/resources');
      const data = await res.json();
      setResources(data.resources ?? []);
    } catch {
      addToast('Failed to load resources', 'error');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchResources(); }, []);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setUrl('');
    setDescription('');
    setCategory('Apps');
    setModalOpen(true);
  };

  const openEdit = (r: Resource) => {
    setEditing(r);
    setName(r.name);
    setUrl(r.url);
    setDescription(r.description ?? '');
    setCategory(r.category || 'Other');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { addToast('Name is required', 'error'); return; }
    if (!url.trim()) { addToast('URL is required', 'error'); return; }
    setSaving(true);
    try {
      const endpoint = editing ? `/api/resources/${editing.id}` : '/api/resources';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          url: url.trim(),
          description: description.trim(),
          category,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      addToast(editing ? 'Resource updated' : 'Resource added', 'success');
      setModalOpen(false);
      fetchResources();
    } catch {
      addToast('Failed to save resource', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/resources/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setResources((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      addToast('Resource deleted', 'success');
      setDeleteTarget(null);
    } catch {
      addToast('Failed to delete resource', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Group by category, preserving the preset order then any custom categories.
  const grouped = resources.reduce<Record<string, Resource[]>>((acc, r) => {
    const key = r.category || 'Other';
    (acc[key] ??= []).push(r);
    return acc;
  }, {});
  const groupKeys = Object.keys(grouped).sort((a, b) => {
    const ia = CATEGORIES.indexOf(a);
    const ib = CATEGORIES.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <LayoutGrid className="w-5 h-5 text-slate-700" />
          <h1 className="text-xl font-bold text-black">Resources</h1>
          <span className="text-xs text-slate-400">Apps & sheets the team uses</span>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={fetchResources} loading={loading}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4" /> Add Resource
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-slate-400">Loading...</div>
      ) : resources.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="No resources yet"
          description="Add the apps and sheets your team uses so everyone can find them in one place."
          action={<Button size="sm" onClick={openCreate}><Plus className="w-4 h-4" /> Add Resource</Button>}
        />
      ) : (
        <div className="space-y-8">
          {groupKeys.map((cat) => (
            <div key={cat}>
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-3">{cat}</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {grouped[cat].map((r) => (
                  <div
                    key={r.id}
                    className="group flex flex-col bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition"
                  >
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-900">{r.name}</h3>
                      {r.description && (
                        <p className="text-sm text-slate-500 mt-1 line-clamp-3">{r.description}</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-crimson-700 hover:text-crimson-800"
                      >
                        <ExternalLink className="w-4 h-4" /> Open
                      </a>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(r)} aria-label="Edit">
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(r)} aria-label="Delete">
                          <Trash2 className="w-3.5 h-3.5 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Resource' : 'Add Resource'}
        size="sm"
      >
        <form onSubmit={handleSave} className="space-y-3">
          <Input
            label="Name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. TKP Inventory Sheet"
            autoFocus
          />
          <Input
            label="URL *"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
          />
          <Select
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={CATEGORY_OPTIONS}
          />
          <Textarea
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this for? (optional)"
          />
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? 'Save Changes' : 'Add Resource'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Resource"
        message={`Remove "${deleteTarget?.name}" from Resources? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
