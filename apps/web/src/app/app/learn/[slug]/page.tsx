'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Bookmark, Clock, NotebookPen } from 'lucide-react';
import type { SubnettingChallenge } from '@netforge/content/schema';
import { ApiError, api, errorMessage } from '@/lib/api';
import type { ActivityDetail } from '@/lib/types';
import { typeLabel } from '@/lib/format';
import { Badge, Button, ButtonLink, ErrorState, Spinner, Textarea } from '@/components/ui';
import { LessonPlayer } from '@/components/players/LessonPlayer';
import { QuizPlayer } from '@/components/players/QuizPlayer';
import { LabPlayer } from '@/components/players/LabPlayer';
import { SubnetPractice } from '@/components/players/SubnetPractice';
import { Markdown } from '@/components/ui/markdown';

function NotesDrawer({ slug, onClose }: { slug: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const notes = useQuery({ queryKey: ['notes', slug], queryFn: () => api.get<{ notes: { id: string; body: string; updatedAt: string }[] }>(`/me/notes?activity=${encodeURIComponent(slug)}`) });
  const add = useMutation({
    mutationFn: () => api.post('/me/notes', { body, activitySlug: slug }),
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['notes'] });
    },
  });
  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col border-l border-border bg-surface shadow-2xl" aria-label="Notes">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-semibold">My notes</h2>
        <button onClick={onClose} className="rounded p-1 text-muted hover:bg-surface-2" aria-label="Close notes">
          ✕
        </button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {notes.data?.notes.length === 0 && <p className="text-sm text-muted">No notes for this activity yet.</p>}
        {notes.data?.notes.map((n) => (
          <div key={n.id} className="rounded-md border border-border p-2.5 text-sm">
            <Markdown>{n.body}</Markdown>
          </div>
        ))}
      </div>
      <form
        className="space-y-2 border-t border-border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) add.mutate();
        }}
      >
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Write a note (markdown supported)…" aria-label="New note" />
        <Button type="submit" size="sm" loading={add.isPending} disabled={!body.trim()}>
          Save note
        </Button>
        {add.error && <p className="text-xs text-danger">{errorMessage(add.error)}</p>}
      </form>
    </aside>
  );
}

export default function LearnPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [notesOpen, setNotesOpen] = useState(false);
  const q = useQuery({ queryKey: ['activity', slug], queryFn: () => api.get<ActivityDetail>(`/activities/${slug}`) });
  const bookmark = useMutation({
    mutationFn: (on: boolean) => (on ? api.put(`/me/bookmarks/${slug}`) : api.del(`/me/bookmarks/${slug}`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activity', slug] });
      qc.invalidateQueries({ queryKey: ['bookmarks'] });
    },
  });

  if (q.isLoading) return <Spinner />;
  if (q.error instanceof ApiError && q.error.code === 'LOCKED') {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-10 text-center">
        <h1 className="text-xl font-semibold">This activity is locked</h1>
        <p className="text-muted">{q.error.message}</p>
        <ButtonLink href="/app/path" variant="secondary">
          Back to the learning path
        </ButtonLink>
      </div>
    );
  }
  if (q.error || !q.data) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data;
  const a = d.activity;
  const isSubnet = (a.content as { mode?: string }).mode === 'subnetting';
  const isLab = !isSubnet && (a.type === 'LAB' || a.type === 'CHALLENGE' || a.type === 'PROJECT');
  const next = d.next ? () => router.push(`/app/learn/${d.next!.slug}`) : undefined;

  return (
    <div className={clsx('mx-auto space-y-5', isLab ? 'max-w-[1600px]' : 'max-w-5xl')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/app/modules/${d.module.slug}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
            <ArrowLeft className="h-4 w-4" /> {d.module.title}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{a.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge tone="accent">{typeLabel[a.type]}</Badge>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {a.estMinutes} min
            </span>
            <span>{a.xp} XP</span>
            {a.skills.map((s) => (
              <Badge key={s.slug}>{s.name}</Badge>
            ))}
            {d.progress.bestScore !== null && a.type !== 'LESSON' && <span>Best: {d.progress.bestScore}%</span>}
          </div>
        </div>
        <div className="flex gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => setNotesOpen(true)}>
            <NotebookPen className="h-4 w-4" /> Notes
          </Button>
          <Button variant="ghost" size="sm" onClick={() => bookmark.mutate(!d.bookmarked)} aria-pressed={d.bookmarked}>
            <Bookmark className={clsx('h-4 w-4', d.bookmarked && 'fill-accent text-accent')} /> {d.bookmarked ? 'Saved' : 'Save'}
          </Button>
        </div>
      </div>

      {a.type === 'LESSON' && <LessonPlayer key={a.slug} detail={d} onNext={next} />}
      {a.type === 'QUIZ' && <QuizPlayer key={a.slug} detail={d} />}
      {isLab && <LabPlayer key={a.slug} detail={d} />}
      {isSubnet && (
        <div className="space-y-4">
          <Markdown>{(a.content as SubnettingChallenge).scenario}</Markdown>
          <SubnetPractice
            key={a.slug}
            mode="challenge"
            slug={a.slug}
            difficulty={(a.content as SubnettingChallenge).difficulty}
            count={(a.content as SubnettingChallenge).count}
            timeLimitSec={(a.content as SubnettingChallenge).timeLimitSec}
            passScore={(a.content as SubnettingChallenge).passScore}
          />
        </div>
      )}

      <nav className="flex justify-between gap-3 border-t border-border pt-4" aria-label="Activity navigation">
        {d.prev ? (
          <Link href={`/app/learn/${d.prev.slug}`} className="flex items-center gap-1.5 text-sm text-muted hover:text-fg">
            <ArrowLeft className="h-4 w-4" /> {d.prev.title}
          </Link>
        ) : (
          <span />
        )}
        {d.next && (
          <Link href={`/app/learn/${d.next.slug}`} className="flex items-center gap-1.5 text-sm text-muted hover:text-fg">
            {d.next.title} <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </nav>
      {notesOpen && <NotesDrawer slug={slug} onClose={() => setNotesOpen(false)} />}
    </div>
  );
}
