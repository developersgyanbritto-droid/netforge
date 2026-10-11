'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Calculator, Clock, Flame, PlayCircle, Target, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { Dashboard } from '@/lib/types';
import { masteryLabel, masteryTone, relativeTime, typeLabel } from '@/lib/format';
import { Badge, ButtonLink, Card, CardHeader, ErrorState, ProgressBar, Spinner } from '@/components/ui';

function GoalRing({ done, goal }: { done: number; goal: number }) {
  const pct = Math.min(1, done / goal);
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-[84px] w-[84px]" role="img" aria-label={`${done} of ${goal} minutes studied today`}>
      <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90">
        <circle cx="42" cy="42" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="8" />
        <circle cx="42" cy="42" r={r} fill="none" stroke={pct >= 1 ? 'var(--success)' : 'var(--accent)'} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-semibold leading-none">{done}</span>
        <span className="text-[10px] text-muted">/ {goal} min</span>
      </div>
    </div>
  );
}

/** Single-series bar chart: minutes studied per day (last 28 days). */
function StudyChart({ history }: { history: Dashboard['history'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(30, ...history.map((h) => h.minutes));
  const W = 560;
  const H = 120;
  const gap = 2;
  const bw = W / history.length - gap;
  const h = hover !== null ? history[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full" role="img" aria-label="Minutes studied per day over the last 28 days" onMouseLeave={() => setHover(null)}>
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--border)" strokeWidth="1" />
        {history.map((d, i) => {
          const bh = d.minutes ? Math.max(4, (d.minutes / max) * (H - 8)) : 0;
          const x = i * (bw + gap);
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)}>
              <rect x={x} y={0} width={bw + gap} height={H} fill="transparent" />
              {bh > 0 && <path d={`M${x},${H} v${-(bh - 4)} q0,-4 4,-4 h${bw - 8} q4,0 4,4 v${bh - 4} z`} fill="var(--accent)" opacity={hover === null || hover === i ? 1 : 0.45} />}
              {bh === 0 && <rect x={x} y={H - 2} width={bw} height={2} rx={1} fill="var(--surface-3)" />}
            </g>
          );
        })}
        <text x="0" y={H + 14} fontSize="10" fill="var(--faint)">
          {new Date(history[0].day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </text>
        <text x={W} y={H + 14} fontSize="10" fill="var(--faint)" textAnchor="end">
          Today
        </text>
      </svg>
      {h && (
        <div className="pointer-events-none absolute -top-2 right-0 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-lg">
          <p className="font-medium">{new Date(h.day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
          <p className="text-muted">
            {h.minutes} min · {h.xp} XP
          </p>
        </div>
      )}
      <table className="sr-only">
        <caption>Study minutes per day</caption>
        <tbody>
          {history.map((d) => (
            <tr key={d.day}>
              <th>{d.day}</th>
              <td>{d.minutes} minutes</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DashboardPage() {
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/me/dashboard') });
  if (q.isLoading) return <Spinner label="Loading dashboard…" />;
  if (q.error || !q.data) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data;
  const first = d.counts.lessons.done === 0 && d.counts.quizzes.done === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{first ? `Welcome, ${d.user.displayName.split(' ')[0]}` : `Welcome back, ${d.user.displayName.split(' ')[0]}`}</h1>
          <p className="text-sm text-muted">{d.currentModule ? `You're working on ${d.currentModule.title}.` : 'You have completed every unlocked module — impressive.'}</p>
        </div>
        {d.nextUp?.slug && (
          <ButtonLink href={`/app/learn/${d.nextUp.slug}`}>
            <PlayCircle className="h-4 w-4" /> {first ? 'Start your first lesson' : 'Continue learning'}
          </ButtonLink>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="flex items-center gap-4 p-4">
          <GoalRing done={d.goal.doneToday} goal={d.goal.minutes} />
          <div>
            <p className="text-xs font-medium text-muted uppercase">Today&apos;s goal</p>
            <p className="text-sm">{d.goal.doneToday >= d.goal.minutes ? 'Goal reached 🎯' : `${d.goal.minutes - d.goal.doneToday} min to go`}</p>
          </div>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted uppercase">
            <Flame className="h-3.5 w-3.5 text-warning" /> Streak
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {d.streak} <span className="text-sm font-normal text-muted">day{d.streak === 1 ? '' : 's'}</span>
          </p>
          <p className="text-xs text-muted">{d.weekMinutes} min this week</p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted uppercase">
            <Zap className="h-3.5 w-3.5 text-accent" /> Level {d.level.level}
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {d.user.xp} <span className="text-sm font-normal text-muted">XP</span>
          </p>
          <ProgressBar value={d.level.progress * 100} className="mt-2" label="Progress to next level" />
          <p className="mt-1 text-xs text-muted">{d.level.next - d.user.xp} XP to level {d.level.level + 1}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted uppercase">Performance</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <p className="text-xl font-semibold">{d.quizAverage ?? '—'}{d.quizAverage !== null && '%'}</p>
              <p className="text-xs text-muted">quiz average</p>
            </div>
            <div>
              <p className="text-xl font-semibold">{d.labPassRate ?? '—'}{d.labPassRate !== null && '%'}</p>
              <p className="text-xs text-muted">lab pass rate</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Today's plan" subtitle={`Built from your path, weak skills and ${d.goal.minutes}-minute goal`} />
          <ol className="space-y-1 px-3 pb-4">
            {d.plan.length === 0 && <li className="px-2 py-4 text-sm text-muted">Nothing scheduled — all unlocked activities are done.</li>}
            {d.plan.map((p, i) => (
              <li key={i}>
                <Link href={p.slug ? `/app/learn/${p.slug}` : (p.href ?? '#')} className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-surface-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-2 font-mono text-xs">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.title}</span>
                    <span className="block text-xs text-muted">{p.reason}</span>
                  </span>
                  {p.type ? <Badge>{typeLabel[p.type]}</Badge> : <Calculator className="h-4 w-4 text-muted" />}
                  <span className="flex w-14 items-center justify-end gap-1 text-xs text-muted">
                    <Clock className="h-3 w-3" /> {p.minutes}m
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
        <Card>
          <CardHeader
            title="Current module"
            action={
              <Link href="/app/path" className="text-xs font-medium text-accent hover:underline">
                View path
              </Link>
            }
          />
          <div className="space-y-4 px-5 pb-5">
            {d.currentModule ? (
              <Link href={`/app/modules/${d.currentModule.slug}`} className="block rounded-lg border border-border p-3 hover:bg-surface-2">
                <p className="text-xs text-muted">Level {d.currentModule.level}</p>
                <p className="font-medium">{d.currentModule.title}</p>
                <ProgressBar value={(d.currentModule.completed / d.currentModule.total) * 100} className="mt-2" label="Module progress" />
                <p className="mt-1 text-xs text-muted">
                  {d.currentModule.completed}/{d.currentModule.total} activities
                </p>
              </Link>
            ) : (
              <p className="text-sm text-muted">No module in progress.</p>
            )}
            <dl className="grid grid-cols-2 gap-2 text-sm">
              {(['lessons', 'quizzes', 'labs', 'challenges'] as const).map((k) => (
                <div key={k} className="rounded-md bg-surface-2 p-2.5">
                  <dt className="text-xs text-muted capitalize">{k}</dt>
                  <dd className="font-semibold">
                    {d.counts[k].done}
                    <span className="font-normal text-muted">/{d.counts[k].total}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Study time" subtitle="Minutes per day, last 4 weeks" />
          <div className="px-5 pb-5">
            <StudyChart history={d.history} />
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Skills"
            action={
              <Link href="/app/skills" className="text-xs font-medium text-accent hover:underline">
                Skill map
              </Link>
            }
          />
          <div className="space-y-4 px-5 pb-5">
            {!d.strongSkills.length && !d.weakSkills.length && <p className="text-sm text-muted">Complete activities to start building your skill profile.</p>}
            {!d.strongSkills.length && d.weakSkills.length > 0 && <p className="text-sm text-muted">No skill has reached Competent (70%) yet — quizzes and labs move skills fastest.</p>}
            {d.strongSkills.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted uppercase">
                  <TrendingUp className="h-3.5 w-3.5 text-success" /> Strongest
                </p>
                {d.strongSkills.map((s) => (
                  <SkillLine key={s.slug} s={s} />
                ))}
              </div>
            )}
            {d.weakSkills.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted uppercase">
                  <TrendingDown className="h-3.5 w-3.5 text-warning" /> Needs practice
                </p>
                {d.weakSkills.map((s) => (
                  <SkillLine key={s.slug} s={s} />
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Recent activity" />
        <ul className="px-3 pb-3">
          {!d.recentAttempts.length && <li className="px-2 py-4 text-sm text-muted">Your quiz and lab attempts will appear here.</li>}
          {d.recentAttempts.map((a) => (
            <li key={a.id}>
              <Link href={`/app/learn/${a.activity.slug}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
                <Target className={a.passed ? 'h-4 w-4 text-success' : 'h-4 w-4 text-warning'} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm">{a.activity.title}</span>
                <Badge>{typeLabel[a.activity.type]}</Badge>
                <span className="w-12 text-right font-mono text-sm">{a.score}%</span>
                <span className="hidden w-20 text-right text-xs text-muted sm:block">{relativeTime(a.createdAt)}</span>
                <ArrowRight className="h-3.5 w-3.5 text-faint" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function SkillLine({ s }: { s: Dashboard['skillMap'][number] }) {
  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center justify-between text-sm">
        <span>{s.name}</span>
        <Badge tone={masteryTone[s.mastery]}>{masteryLabel[s.mastery]}</Badge>
      </div>
      <ProgressBar value={s.score} label={`${s.name} ${Math.round(s.score)}%`} />
    </div>
  );
}
