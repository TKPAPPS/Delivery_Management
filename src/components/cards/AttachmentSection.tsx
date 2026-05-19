'use client';

import { useRef, useState } from 'react';
import type { Attachment, Profile } from '@/types';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToastStore } from '@/store/toastStore';
import { Paperclip, Download, Trash2, Upload } from 'lucide-react';
import { timeAgo } from '@/lib/utils';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB — mirrors server-side limit
const ALLOWED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
  '.pdf', '.txt', '.csv', '.xls', '.xlsx', '.doc', '.docx',
];

interface AttachmentWithUploader extends Attachment {
  uploader: Pick<Profile, 'id' | 'name' | 'email'> | null;
}

interface AttachmentSectionProps {
  cardId: string;
  attachments: AttachmentWithUploader[];
  onRefresh: () => void;
}

export default function AttachmentSection({ cardId, attachments, onRefresh }: AttachmentSectionProps) {
  const addToast = useToastStore((s) => s.addToast);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      addToast('File exceeds the 20 MB size limit', 'error');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      addToast(`File type not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`, 'error');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/cards/${cardId}/attachments`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? 'Upload failed');
      }
      addToast('File uploaded', 'success');
      onRefresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to upload file', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/cards/${cardId}/attachments?id=${deleteId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      addToast('Attachment removed', 'success');
      onRefresh();
    } catch {
      addToast('Failed to remove attachment', 'error');
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-slate-500" />
          <h3 className="font-semibold text-slate-900 text-sm">Attachments ({attachments.length})</h3>
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept={ALLOWED_EXTENSIONS.join(',')}
            className="hidden"
            onChange={handleUpload}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            loading={uploading}
          >
            <Upload className="w-3.5 h-3.5" /> Upload
          </Button>
        </div>
      </div>

      {attachments.length === 0 ? (
        <p className="text-sm text-slate-400 italic">No attachments</p>
      ) : (
        <div className="space-y-2">
          {attachments.map((att) => {
            const href = att.signed_url ?? att.file_url;
            return (
              <div
                key={att.id}
                className="flex items-center justify-between gap-3 bg-slate-50 rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Paperclip className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{att.file_name}</p>
                    <p className="text-xs text-slate-400">
                      {att.uploader?.name ?? att.uploader?.email ?? 'Unknown'} · {timeAgo(att.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-400 hover:text-blue-600 p-1"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  ) : (
                    <span className="text-slate-200 p-1" title="Link unavailable">
                      <Download className="w-4 h-4" />
                    </span>
                  )}
                  <button
                    className="text-slate-400 hover:text-red-500 p-1"
                    onClick={() => setDeleteId(att.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Remove Attachment"
        message="Are you sure you want to remove this attachment?"
        loading={deleting}
      />
    </div>
  );
}
