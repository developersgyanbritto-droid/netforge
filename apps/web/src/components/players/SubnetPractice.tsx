'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Shuffle, Timer, XCircle } from 'lucide-react';
import { generateSubnetQuestions, type Difficulty } from '@netforge/sim-engine';
import { api, errorMessage } from '@/lib/api';
import type { SubnetResult } from '@/lib/types';
import { formatDuration } from '@/lib/format';
import { Alert, Badge, Button, Input } from '@/components/ui';
import { OutcomeBanner } from './Outcome';

const newSeed = () => Math.floor(Math.random() * 2_000_000_000) + 1;

/**
 * Generated subnetting questions. The client renders questions from a seed; the server
 * regenerates the same set from that seed to grade, so answers never leave the server's control.
 */
export function SubnetPractice(props: { mode: 'practice' } | { mode: 'challenge'; slug: string; difficulty: Difficulty; count: number; timeLimitSec?: number; passScore: number }) {
  const [difficulty, setDifficulty] = useState<Difficulty>(props.mode === 'challenge' ? props.difficulty : 'medium');
  const count = props.mode === 'challenge' ? props.count : 8;
  const [seed, setSeed] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<SubnetResult | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(0);
  const qc = useQueryClient();

  useEffect(() => setSeed(newSeed()), []);
  const questions = useMemo(() => (seed ? generateSubnetQuestions(seed, count, difficulty) : []), [seed, count, difficulty]);
  useEffect(() => {
    started.current = Date.now();
    setElapsed(0);
    if (result) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [seed, result]);

  const submit = useMutation({
    mutationFn: () =>
      props.mode === 'challenge'
        ? api.post<SubnetResult>(`/activities/${props.slug}/attempts`, { seed, answers, durationSec: elapsed })
        : api.post<SubnetResult>('/practice/subnetting', { seed, count, difficulty, answers, durationSec: elapsed }),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['curriculum'] });
    },
  });
  const restart = () => {
    setResult(null);
    setAnswers({});
    setSeed(newSeed());
  };
  const byId = new Map(result?.results.map((r) => [r.id, r]));
  const limit = props.mode === 'challenge' ? props.timeLimitSec : undefined;
  const remaining = limit ? limit - elapsed : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {props.mode === 'practice' && (
          <div className="flex items-center gap-1" role="group" aria-label="Difficulty">
            {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => {
                  setDifficulty(d);
                  restart();
                }}
                className={clsx('rounded-md border px-2.5 py-1 text-xs font-medium capitalize', difficulty === d ? 'border-accent bg-accent-soft text-accent' : 'border-border hover:bg-surface-2')}
              >
                {d}
              </button>
            ))}
          </div>
        )}
        <span className={clsx('flex items-center gap-1 font-mono text-sm', remaining !== null && remaining < 0 ? 'text-danger' : 'text-muted')}>
          <Timer className="h-4 w-4" /> {remaining !== null ? (remaining >= 0 ? `${formatDuration(remaining)} left` : `${formatDuration(-remaining)} over`) : formatDuration(elapsed)}
        </span>
        <Button variant="ghost" size="sm" onClick={restart} className="ml-auto">
          <Shuffle className="h-3.5 w-3.5" /> New set
        </Button>
      </div>
      {result && (
        <div className={clsx('space-y-2 rounded-xl border p-4', (result.passed ?? result.score >= 80) ? 'border-success/40 bg-success-soft/50' : 'border-warning/40 bg-warning-soft/50')}>
          <p className="text-2xl font-semibold">{result.score}%</p>
          <p className="text-sm">
            {result.overTime ? 'Correct answers were good, but the time limit was exceeded — try again for a pass.' : props.mode === 'challenge' ? (result.passed ? 'Challenge passed!' : `You need ${props.passScore}% to pass.`) : 'Practice recorded towards your Subnetting skill.'}
          </p>
          <OutcomeBanner outcome={result.outcome} />
          <Button size="sm" variant="secondary" onClick={restart}>
            Try another set
          </Button>
        </div>
      )}
      <ol className="grid gap-3 md:grid-cols-2">
        {questions.map((q, i) => {
          const r = byId.get(q.id);
          return (
            <li key={q.id} className={clsx('rounded-xl border bg-surface p-4', r ? (r.correct ? 'border-success/40' : 'border-danger/40') : 'border-border')}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="text-sm font-medium">
                  <span className="mr-1 font-mono text-xs text-muted">{i + 1}.</span>
                  {q.prompt}
                </p>
                {r && (r.correct ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <XCircle className="h-4 w-4 shrink-0 text-danger" />)}
              </div>
              <Input
                value={answers[q.id] ?? ''}
                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                disabled={!!result}
                className="font-mono"
                placeholder={q.kind === 'same-subnet' ? 'yes / no' : q.kind === 'hosts' ? 'number' : q.kind === 'prefix-for-hosts' ? '/nn' : 'a.b.c.d'}
                aria-label={`Answer ${i + 1}`}
                onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.closest('li')?.nextElementSibling?.querySelector('input') as HTMLInputElement | null)?.focus()}
              />
              {r && (
                <div className="mt-2 text-xs">
                  {!r.correct && (
                    <p>
                      Answer: <span className="font-mono font-semibold">{r.answer}</span>
                    </p>
                  )}
                  <p className="text-muted">{r.explanation}</p>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {!result && questions.length > 0 && (
        <div className="flex items-center gap-3">
          <Button onClick={() => submit.mutate()} loading={submit.isPending}>
            Check answers
          </Button>
          {props.mode === 'challenge' && <Badge>Pass mark {props.passScore}%</Badge>}
          {submit.error && <Alert>{errorMessage(submit.error)}</Alert>}
        </div>
      )}
    </div>
  );
}
