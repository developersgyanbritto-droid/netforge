'use client';

import { useRef, useState } from 'react';
import clsx from 'clsx';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { ActivityDetail, QuizResult } from '@/lib/types';
import { Alert, Badge, Button, Input } from '@/components/ui';
import { Markdown } from '@/components/ui/markdown';
import { OutcomeBanner } from './Outcome';

interface PublicQuestion {
  id: string;
  type: 'single' | 'multi' | 'text';
  prompt: string;
  options?: string[];
  placeholder?: string;
}
interface PublicQuiz {
  intro?: string;
  passScore: number;
  checkpoint: boolean;
  questions: PublicQuestion[];
}

type Answer = number | number[] | string;

export function QuizPlayer({ detail }: { detail: ActivityDetail }) {
  const quiz = detail.activity.content as PublicQuiz;
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const started = useRef(Date.now());
  const qc = useQueryClient();
  const submit = useMutation({
    mutationFn: () => api.post<QuizResult>(`/activities/${detail.activity.slug}/attempts`, { answers, durationSec: Math.round((Date.now() - started.current) / 1000) }),
    onSuccess: (r) => {
      setResult(r);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      qc.invalidateQueries({ queryKey: ['curriculum'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['activity', detail.activity.slug] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
  const answered = quiz.questions.filter((q) => {
    const a = answers[q.id];
    return a !== undefined && !(Array.isArray(a) && !a.length) && a !== '';
  }).length;
  const byId = new Map(result?.results.map((r) => [r.id, r]));

  const retry = () => {
    setAnswers({});
    setResult(null);
    started.current = Date.now();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {quiz.checkpoint && !result && (
        <Alert tone="accent">Checkpoint quiz — scoring 80% or more on this module&apos;s quizzes lets you test out of the module and unlock the next one.</Alert>
      )}
      {quiz.intro && <Markdown>{quiz.intro}</Markdown>}
      {result && (
        <section className={clsx('space-y-3 rounded-xl border p-5', result.passed ? 'border-success/40 bg-success-soft/50' : 'border-warning/40 bg-warning-soft/50')}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted">Your score</p>
              <p className="text-3xl font-semibold">{result.score}%</p>
            </div>
            <Badge tone={result.passed ? 'success' : 'warning'}>{result.passed ? 'Passed' : `Pass mark ${result.passScore}%`}</Badge>
          </div>
          <p className="text-sm">{result.passed ? 'Well done. Review the explanations below — they reinforce why each answer is right.' : 'Read the explanations for the questions you missed, then try again. Mistakes are part of learning.'}</p>
          <OutcomeBanner outcome={result.outcome} />
          <Button variant="secondary" size="sm" onClick={retry}>
            <RotateCcw className="h-3.5 w-3.5" /> Retake quiz
          </Button>
        </section>
      )}
      <ol className="space-y-4">
        {quiz.questions.map((q, n) => {
          const r = byId.get(q.id);
          const a = answers[q.id];
          return (
            <li key={q.id} className={clsx('rounded-xl border bg-surface p-4', r ? (r.correct ? 'border-success/40' : 'border-danger/40') : 'border-border')}>
              <div className="mb-3 flex items-start gap-2">
                <span className="font-mono text-xs text-muted">{n + 1}.</span>
                <div className="flex-1">
                  <p className="font-medium">{q.prompt}</p>
                  {q.type === 'multi' && <p className="text-xs text-muted">Select all that apply</p>}
                </div>
                {r && (r.correct ? <CheckCircle2 className="h-5 w-5 text-success" aria-label="Correct" /> : <XCircle className="h-5 w-5 text-danger" aria-label="Incorrect" />)}
              </div>
              {q.type === 'text' ? (
                <Input
                  value={(a as string) ?? ''}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  placeholder={q.placeholder ?? 'Type your answer'}
                  disabled={!!result}
                  className="max-w-sm font-mono"
                  aria-label={`Answer to question ${n + 1}`}
                />
              ) : (
                <div className="grid gap-1.5" role={q.type === 'single' ? 'radiogroup' : 'group'}>
                  {q.options!.map((o, i) => {
                    const selected = q.type === 'single' ? a === i : Array.isArray(a) && a.includes(i);
                    const isCorrect = r && (Array.isArray(r.correctAnswer) ? (r.correctAnswer as number[]).includes(i) : r.correctAnswer === i);
                    return (
                      <button
                        key={i}
                        role={q.type === 'single' ? 'radio' : 'checkbox'}
                        aria-checked={selected}
                        disabled={!!result}
                        onClick={() => {
                          if (q.type === 'single') setAnswers({ ...answers, [q.id]: i });
                          else {
                            const cur = Array.isArray(a) ? a : [];
                            setAnswers({ ...answers, [q.id]: cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i] });
                          }
                        }}
                        className={clsx(
                          'flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition disabled:cursor-default',
                          !r && (selected ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-2'),
                          r && isCorrect && 'border-success bg-success-soft',
                          r && selected && !isCorrect && 'border-danger bg-danger-soft',
                          r && !selected && !isCorrect && 'border-border opacity-70',
                        )}
                      >
                        <span className={clsx('flex h-4 w-4 shrink-0 items-center justify-center border', q.type === 'single' ? 'rounded-full' : 'rounded', selected ? 'border-accent bg-accent' : 'border-border-strong')}>
                          {selected && <span className="h-1.5 w-1.5 rounded-full bg-accent-fg" />}
                        </span>
                        {o}
                      </button>
                    );
                  })}
                </div>
              )}
              {r && (
                <div className="mt-3 rounded-md bg-surface-2 p-3 text-sm">
                  {!r.correct && q.type === 'text' && (
                    <p className="mb-1">
                      Expected: <span className="font-mono font-semibold">{String(r.correctAnswer)}</span>
                    </p>
                  )}
                  <p className="text-fg/90">{r.explanation}</p>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {!result && (
        <div className="flex items-center gap-3">
          <Button onClick={() => submit.mutate()} loading={submit.isPending} disabled={!answered}>
            Submit answers
          </Button>
          <span className="text-sm text-muted">
            {answered}/{quiz.questions.length} answered
          </span>
          {submit.error && <span className="text-sm text-danger">{errorMessage(submit.error)}</span>}
        </div>
      )}
    </div>
  );
}
