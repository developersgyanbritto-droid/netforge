'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, Clock, Lightbulb, RotateCcw, Send, Timer } from 'lucide-react';
import { buildNetwork, validateLab, type LabTask, type Network, type ValidationResult } from '@netforge/sim-engine';
import type { LabContent } from '@netforge/content/schema';
import { api, errorMessage } from '@/lib/api';
import type { ActivityDetail, LabResult } from '@/lib/types';
import { formatDuration } from '@/lib/format';
import { Alert, Badge, Button, Modal } from '@/components/ui';
import { Markdown } from '@/components/ui/markdown';
import { SimProvider, Simulator, useSimStore } from '@/components/sim/Simulator';
import { useSim } from '@/components/sim/store';
import { OutcomeBanner } from './Outcome';

const KIND_LABEL = { configuration: 'Configuration lab', troubleshooting: 'Troubleshooting challenge', design: 'Design challenge', project: 'Project' };

export function LabPlayer({ detail }: { detail: ActivityDetail }) {
  const lab = detail.activity.content as LabContent;
  const initial = useMemo(() => (detail.progress.draft as Network | null) ?? buildNetwork(lab.spec), [detail.progress.draft, lab.spec]);
  const store = useSimStore(initial, lab.allowTopologyChanges);
  return (
    <SimProvider store={store}>
      <LabInner detail={detail} lab={lab} />
    </SimProvider>
  );
}

function LabInner({ detail, lab }: { detail: ActivityDetail; lab: LabContent }) {
  const net = useSim((s) => s.net);
  const version = useSim((s) => s.version);
  const setNet = useSim((s) => s.setNet);
  const [hints, setHints] = useState(0);
  const [live, setLive] = useState<ValidationResult | null>(null);
  const [result, setResult] = useState<LabResult | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const started = useRef(Date.now());
  const qc = useQueryClient();
  const slug = detail.activity.slug;

  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  // Live task checks (client-side preview — the server re-validates on submit)
  useEffect(() => {
    const t = setTimeout(() => setLive(validateLab(net, lab.tasks as LabTask[])), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, lab.tasks]);

  // Autosave draft (debounced) so learners can leave and resume
  const firstVersion = useRef(version);
  useEffect(() => {
    if (version === firstVersion.current) return;
    setSaveState('saving');
    const t = setTimeout(() => {
      api
        .put(`/activities/${slug}/progress`, { draft: net, timeSpentSec: 0 })
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'));
    }, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const submit = useMutation({
    mutationFn: () => api.post<LabResult>(`/activities/${slug}/attempts`, { network: net, hintsUsed: hints, durationSec: elapsed }),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ['curriculum'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });

  const overTime = lab.timeLimitSec && elapsed > lab.timeLimitSec;
  const isTroubleshooting = lab.kind === 'troubleshooting';

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
      <aside className="space-y-4 xl:max-h-[calc(100vh-140px)] xl:overflow-y-auto xl:pr-1">
        <section className="space-y-2 rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <Badge tone={isTroubleshooting ? 'warning' : 'accent'}>{KIND_LABEL[lab.kind]}</Badge>
            <span className={clsx('flex items-center gap-1 font-mono text-xs', overTime ? 'text-danger' : 'text-muted')}>
              {lab.timeLimitSec ? <Timer className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
              {formatDuration(elapsed)}
              {lab.timeLimitSec ? ` / ${formatDuration(lab.timeLimitSec)}` : ''}
            </span>
          </div>
          <h3 className="text-sm font-semibold">Scenario</h3>
          <Markdown className="text-sm">{lab.scenario}</Markdown>
          <p className="rounded-md bg-surface-2 p-2.5 text-sm">
            <strong>Objective:</strong> {lab.objective}
          </p>
        </section>

        <section className="space-y-2 rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Tasks</h3>
            {live && (
              <span className="text-xs text-muted">
                {live.passedChecks}/{live.totalChecks} checks
              </span>
            )}
          </div>
          <ol className="space-y-2">
            {(lab.tasks as LabTask[]).map((t, i) => {
              const r = live?.tasks.find((x) => x.id === t.id);
              return (
                <li key={t.id} className="rounded-md border border-border p-2.5">
                  <p className="flex items-start gap-2 text-sm font-medium">
                    {r?.passed ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="Done" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-faint" aria-label="Not done" />}
                    <span>
                      {i + 1}. {t.title}
                    </span>
                  </p>
                  {t.description && <p className="mt-1 pl-6 text-xs text-muted">{t.description}</p>}
                  {r && !r.passed && (
                    <ul className="mt-1.5 space-y-0.5 pl-6">
                      {r.checks.map((c, k) => (
                        <li key={k} className={clsx('text-xs', c.passed ? 'text-success' : 'text-muted')}>
                          {c.passed ? '✓' : '○'} {c.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="text-xs text-faint">Live checks preview your progress. Your score is calculated by the server when you submit.</p>
        </section>

        {lab.hints.length > 0 && (
          <section className="space-y-2 rounded-xl border border-border bg-surface p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Lightbulb className="h-4 w-4 text-warning" /> Hints
              <span className="text-xs font-normal text-muted">(each hint used costs 10% of the score)</span>
            </h3>
            {lab.hints.slice(0, hints).map((h, i) => (
              <div key={i} className="rounded-md bg-warning-soft/60 p-2.5 text-sm">
                <Markdown>{h}</Markdown>
              </div>
            ))}
            {hints < lab.hints.length && (
              <Button size="sm" variant="secondary" onClick={() => setHints(hints + 1)}>
                Reveal hint {hints + 1} of {lab.hints.length}
              </Button>
            )}
          </section>
        )}

        <section className="space-y-2">
          {submit.error && <Alert>{errorMessage(submit.error)}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => submit.mutate()} loading={submit.isPending}>
              <Send className="h-4 w-4" /> Submit for grading
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (confirm('Reset the lab to its starting state? Your changes will be lost.')) setNet(buildNetwork(lab.spec));
              }}
            >
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
          </div>
          <p className="text-xs text-faint" aria-live="polite">
            {saveState === 'saving' ? 'Saving draft…' : saveState === 'saved' ? 'Draft saved — you can leave and resume later.' : saveState === 'error' ? 'Draft could not be saved.' : ''}
          </p>
        </section>
      </aside>

      <div className="h-[calc(100vh-120px)] min-h-[700px]">
        <Simulator diagnostics={!isTroubleshooting} />
      </div>

      <Modal open={!!result} onClose={() => setResult(null)} title={result?.passed ? 'Lab passed' : 'Not quite there yet'} wide>
        {result && <LabResultView result={result} elapsed={elapsed} hints={hints} />}
      </Modal>
    </div>
  );
}

function LabResultView({ result, elapsed, hints }: { result: LabResult; elapsed: number; hints: number }) {
  const failed = result.validation.tasks.flatMap((t) => t.checks.filter((c) => !c.passed).map((c) => ({ task: t.title, ...c })));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Score', `${result.score}%`],
          ['Time', formatDuration(elapsed)],
          ['Failed checks', String(result.validation.totalChecks - result.validation.passedChecks)],
          ['Hints used', String(hints)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-surface-2 p-3">
            <p className="text-xs text-muted">{k}</p>
            <p className="text-xl font-semibold">{v}</p>
          </div>
        ))}
      </div>
      <OutcomeBanner outcome={result.outcome} />
      {failed.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">What still needs attention</h3>
          <ul className="space-y-2">
            {failed.map((f, i) => (
              <li key={i} className="rounded-md border border-danger/30 bg-danger-soft/50 p-3 text-sm">
                <p className="font-medium">{f.label}</p>
                <p className="mt-0.5 text-fg/90">{f.message}</p>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">Tip: open the device&apos;s CLI or tables, and replay a ping to see exactly where traffic stops.</p>
        </section>
      )}
      {result.passed && result.debrief && (
        <section className="space-y-1">
          <h3 className="text-sm font-semibold">Debrief</h3>
          <Markdown className="text-sm">{result.debrief}</Markdown>
        </section>
      )}
      {result.passed && result.concepts.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-sm font-semibold">Concepts practised</h3>
          <div className="flex flex-wrap gap-1.5">
            {result.concepts.map((c) => (
              <Badge key={c} tone="success">
                {c}
              </Badge>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
