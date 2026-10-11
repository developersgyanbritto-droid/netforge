'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Target } from 'lucide-react';
import type { LessonContent } from '@netforge/content/schema';
import { api, errorMessage } from '@/lib/api';
import type { ActivityDetail, Outcome } from '@/lib/types';
import { Alert, Button } from '@/components/ui';
import { BlockView } from '@/components/lesson/Blocks';
import { OutcomeBanner } from './Outcome';

export function LessonPlayer({ detail, onNext }: { detail: ActivityDetail; onNext?: () => void }) {
  const content = detail.activity.content as LessonContent;
  const started = useRef(Date.now());
  const qc = useQueryClient();
  const [outcome, setOutcome] = useState<Outcome | undefined>();
  const done = detail.progress.status === 'COMPLETED';
  const complete = useMutation({
    mutationFn: () => api.post<{ outcome: Outcome }>(`/activities/${detail.activity.slug}/complete`, { durationSec: Math.min(7200, Math.round((Date.now() - started.current) / 1000)) }),
    onSuccess: (r) => {
      setOutcome(r.outcome);
      qc.invalidateQueries({ queryKey: ['activity', detail.activity.slug] });
      qc.invalidateQueries({ queryKey: ['curriculum'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Target className="h-4 w-4 text-accent" /> By the end of this lesson you can
        </h2>
        <ul className="space-y-1 text-sm">
          {content.objectives.map((o) => (
            <li key={o} className="flex gap-2">
              <span className="text-accent">•</span> {o}
            </li>
          ))}
        </ul>
      </section>
      {content.blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
      <div className="space-y-3 border-t border-border pt-6">
        {complete.error && <Alert>{errorMessage(complete.error)}</Alert>}
        <OutcomeBanner outcome={outcome} />
        <div className="flex flex-wrap items-center gap-3">
          {done || outcome ? (
            <p className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" /> Lesson completed
            </p>
          ) : (
            <Button onClick={() => complete.mutate()} loading={complete.isPending}>
              <CheckCircle2 className="h-4 w-4" /> Mark lesson complete
            </Button>
          )}
          {onNext && (done || outcome) && (
            <Button variant="secondary" onClick={onNext}>
              Continue
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
