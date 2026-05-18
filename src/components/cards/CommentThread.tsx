'use client';

import { useState } from 'react';
import type { Comment, Profile } from '@/types';
import Button from '@/components/ui/Button';
import Textarea from '@/components/ui/Textarea';
import { useToastStore } from '@/store/toastStore';
import { timeAgo } from '@/lib/utils';
import { MessageSquare } from 'lucide-react';

interface CommentWithProfile extends Comment {
  profile: Pick<Profile, 'id' | 'name' | 'email'> | null;
}

interface CommentThreadProps {
  cardId: string;
  comments: CommentWithProfile[];
  onRefresh: () => void;
}

export default function CommentThread({ cardId, comments, onRefresh }: CommentThreadProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/cards/${cardId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error('Failed to post comment');
      setBody('');
      addToast('Comment added', 'success');
      onRefresh();
    } catch {
      addToast('Failed to add comment', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="w-4 h-4 text-slate-500" />
        <h3 className="font-semibold text-slate-900 text-sm">Comments ({comments.length})</h3>
      </div>

      {comments.length === 0 ? (
        <p className="text-sm text-slate-400 italic mb-4">No comments yet</p>
      ) : (
        <div className="space-y-4 mb-4">
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                {(comment.profile?.name ?? comment.profile?.email ?? '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="text-sm font-medium text-slate-900">
                    {comment.profile?.name ?? comment.profile?.email ?? 'Unknown'}
                  </span>
                  <span className="text-xs text-slate-400">{timeAgo(comment.created_at)}</span>
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{comment.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        <Textarea
          placeholder="Add a comment..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={loading} disabled={!body.trim()}>
            Post Comment
          </Button>
        </div>
      </form>
    </div>
  );
}
