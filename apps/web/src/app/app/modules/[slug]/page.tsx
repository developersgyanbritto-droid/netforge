'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, CheckCircle2, Circle, ClipboardCheck, FlaskConical, FolderKanban, Lock, Swords } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { ActivityType, ModuleState } from '@/lib/types';
import { typeLabel } from '@/lib/format';
import { Alert, Badge, ErrorState, ProgressBar, Spinner } from '@/components/ui';

const ICON: Record<ActivityType, typeof BookOpen> = { LESSON: BookOpen, QUIZ: ClipboardCheck, LAB: FlaskConical, CHALLENGE: Swords, PROJECT: FolderKanban };

export default function ModulePage() {
  const { slug } = useParams<{ slug: string }>();
  const q = useQuery({ queryKey: ['module', slug], queryFn: () => api.get<{ module: ModuleState }>(`/modules/${slug}`) });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const m = q.data.module;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/app/path" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Learning path
      </Link>
      <div>
        <p className="text-xs text-muted">Level {m.level}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{m.title}</h1>
        <p className="mt-1 text-muted">{m.summary}</p>
        <div className="mt-4 flex items-center gap-3">
          <ProgressBar value={(m.completedCount / Math.max(1, m.totalCount)) * 100} tone={m.complete ? 'success' : 'accent'} className="max-w-sm" label="Module progress" />
          <span className="text-sm text-muted">
            {m.completedCount}/{m.totalCount} · ~{Math.round(m.estMinutes / 6) / 10} h
          </span>
        </div>
      </div>
      {m.locked && <Alert tone="warning">{m.lockReason} Checkpoint quizzes below remain available.</Alert>}
      {m.testedOut && <Alert tone="accent">You tested out of this module. Lessons and labs stay available for practice.</Alert>}
      <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {m.activities.map((a) => {
          const Icon = ICON[a.type];
          const accessible = !m.locked || (a.type === 'QUIZ' && a.checkpoint);
          const inner = (
            <div className={clsx('flex items-center gap-3 px-4 py-3', accessible ? 'hover:bg-surface-2' : 'opacity-55')}>
              {a.status === 'COMPLETED' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-label="Completed" /> : accessible ? <Circle className="h-5 w-5 shrink-0 text-faint" aria-label="Not completed" /> : <Lock className="h-4 w-4 shrink-0 text-faint" aria-label="Locked" />}
              <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.title}</p>
                <p className="truncate text-xs text-muted">{a.summary}</p>
              </div>
              {a.checkpoint && <Badge tone="accent">Checkpoint</Badge>}
              <Badge>{typeLabel[a.type]}</Badge>
              {a.bestScore !== null && a.type !== 'LESSON' && <span className="w-10 text-right font-mono text-xs">{a.bestScore}%</span>}
              <span className="hidden w-10 text-right text-xs text-muted sm:block">{a.estMinutes}m</span>
            </div>
          );
          return <li key={a.slug}>{accessible ? <Link href={`/app/learn/${a.slug}`}>{inner}</Link> : inner}</li>;
        })}
      </ol>
    </div>
  );
}
