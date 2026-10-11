'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Lock, PlayCircle } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { TrackState } from '@/lib/types';
import { Badge, ErrorState, ProgressBar, Spinner } from '@/components/ui';

export default function PathPage() {
  const q = useQuery({ queryKey: ['curriculum'], queryFn: () => api.get<{ tracks: TrackState[] }>('/curriculum') });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Learning path</h1>
        <p className="text-sm text-muted">Modules unlock when their prerequisites are complete. Locked? Pass the module&apos;s checkpoint quiz to test out.</p>
      </div>
      {q.data.tracks.map((t) => (
        <section key={t.slug}>
          <h2 className="text-lg font-semibold">{t.title}</h2>
          <p className="mb-5 text-sm text-muted">{t.description}</p>
          <ol className="relative space-y-3 border-l-2 border-border pl-6">
            {t.modules.map((m) => {
              const pct = m.totalCount ? (m.completedCount / m.totalCount) * 100 : 0;
              const state = m.complete ? 'complete' : m.locked ? 'locked' : m.completedCount > 0 ? 'active' : 'ready';
              return (
                <li key={m.slug} className="relative">
                  <span
                    className={clsx(
                      'absolute top-4 -left-[35px] flex h-6 w-6 items-center justify-center rounded-full border-2 bg-bg',
                      state === 'complete' ? 'border-success text-success' : state === 'locked' ? 'border-border text-faint' : 'border-accent text-accent',
                    )}
                    aria-hidden
                  >
                    {state === 'complete' ? <CheckCircle2 className="h-4 w-4" /> : state === 'locked' ? <Lock className="h-3 w-3" /> : <PlayCircle className="h-4 w-4" />}
                  </span>
                  <Link href={`/app/modules/${m.slug}`} className={clsx('block rounded-xl border bg-surface p-4 transition hover:border-border-strong', state === 'locked' ? 'border-border opacity-75' : 'border-border')}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs text-muted">Level {m.level}</p>
                        <h3 className="font-semibold">{m.title}</h3>
                      </div>
                      <div className="flex gap-1.5">
                        {m.testedOut && <Badge tone="accent">Tested out</Badge>}
                        {state === 'complete' && <Badge tone="success">Complete</Badge>}
                        {state === 'locked' && <Badge>Locked</Badge>}
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-muted">{m.summary}</p>
                    <div className="mt-3 flex items-center gap-3">
                      <ProgressBar value={pct} tone={m.complete ? 'success' : 'accent'} className="max-w-xs" label={`${m.title} progress`} />
                      <span className="text-xs text-muted">
                        {m.completedCount}/{m.totalCount}
                      </span>
                    </div>
                    {m.locked && m.lockReason && <p className="mt-2 text-xs text-muted">{m.lockReason}</p>}
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
