'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, Pencil, Trash2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { ActivityType } from '@/lib/types';
import { relativeTime, typeLabel } from '@/lib/format';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Spinner, Tabs, Textarea } from '@/components/ui';
import { Markdown } from '@/components/ui/markdown';

interface Note {
  id: string;
  body: string;
  updatedAt: string;
  activity: { slug: string; title: string } | null;
}

function NoteItem({ n }: { n: Note }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(n.body);
  const save = useMutation({ mutationFn: () => api.patch(`/me/notes/${n.id}`, { body }), onSuccess: () => { setEditing(false); qc.invalidateQueries({ queryKey: ['notes'] }); } });
  const del = useMutation({ mutationFn: () => api.del(`/me/notes/${n.id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }) });
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted">
        <span>
          {n.activity ? (
            <Link href={`/app/learn/${n.activity.slug}`} className="font-medium text-accent hover:underline">
              {n.activity.title}
            </Link>
          ) : (
            'General note'
          )}{' '}
          · {relativeTime(n.updatedAt)}
        </span>
        <span className="flex gap-1">
          <button onClick={() => setEditing(!editing)} className="rounded p-1 hover:bg-surface-2" aria-label="Edit note">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => confirm('Delete this note?') && del.mutate()} className="rounded p-1 hover:bg-surface-2 hover:text-danger" aria-label="Delete note">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} aria-label="Edit note" />
          <Button size="sm" onClick={() => save.mutate()} loading={save.isPending} disabled={!body.trim()}>
            Save
          </Button>
          {save.error && <p className="text-xs text-danger">{errorMessage(save.error)}</p>}
        </div>
      ) : (
        <Markdown className="text-sm">{n.body}</Markdown>
      )}
    </Card>
  );
}

export default function NotesPage() {
  const [tab, setTab] = useState<'notes' | 'bookmarks'>('notes');
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const notes = useQuery({ queryKey: ['notes'], queryFn: () => api.get<{ notes: Note[] }>('/me/notes') });
  const bookmarks = useQuery({
    queryKey: ['bookmarks'],
    queryFn: () => api.get<{ bookmarks: { slug: string; title: string; type: ActivityType; estMinutes: number; module: { title: string }; createdAt: string }[] }>('/me/bookmarks'),
    enabled: tab === 'bookmarks',
  });
  const add = useMutation({ mutationFn: () => api.post('/me/notes', { body }), onSuccess: () => { setBody(''); qc.invalidateQueries({ queryKey: ['notes'] }); } });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Notes & bookmarks</h1>
      <Tabs tabs={[{ id: 'notes', label: 'Notes' }, { id: 'bookmarks', label: 'Bookmarks' }]} value={tab} onChange={setTab} />
      {tab === 'notes' && (
        <div className="space-y-4">
          <Card>
            <CardHeader title="New note" subtitle="Markdown supported. Notes added from an activity are linked to it." />
            <form
              className="space-y-2 px-5 pb-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (body.trim()) add.mutate();
              }}
            >
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="e.g. Block size = 256 − mask octet" aria-label="New note" />
              <Button type="submit" size="sm" disabled={!body.trim()} loading={add.isPending}>
                Add note
              </Button>
            </form>
          </Card>
          {notes.isLoading && <Spinner />}
          {notes.error && <ErrorState message={errorMessage(notes.error)} onRetry={() => notes.refetch()} />}
          {notes.data?.notes.length === 0 && <EmptyState title="No notes yet" description="Write down rules, commands and mistakes worth remembering." />}
          {notes.data?.notes.map((n) => <NoteItem key={n.id} n={n} />)}
        </div>
      )}
      {tab === 'bookmarks' && (
        <div className="space-y-2">
          {bookmarks.isLoading && <Spinner />}
          {bookmarks.data?.bookmarks.length === 0 && <EmptyState icon={<Bookmark className="h-7 w-7" />} title="No bookmarks" description="Use “Save” on any lesson, lab or quiz to find it here later." />}
          {bookmarks.data?.bookmarks.map((b) => (
            <Link key={b.slug} href={`/app/learn/${b.slug}`} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 hover:bg-surface-2">
              <Bookmark className="h-4 w-4 fill-accent text-accent" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{b.title}</p>
                <p className="text-xs text-muted">{b.module.title}</p>
              </div>
              <Badge>{typeLabel[b.type]}</Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
