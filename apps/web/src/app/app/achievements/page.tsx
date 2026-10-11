'use client';

import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { Award, Binary, BookOpen, CalendarCheck, FlaskConical, Flame, Footprints, GraduationCap, Layers, Milestone, SearchCheck, Server, ShieldCheck, Target, Wrench, Zap, type LucideIcon } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { Card, CardHeader, ErrorState, ProgressBar, Spinner } from '@/components/ui';

interface Data {
  level: { level: number; currentFloor: number; next: number; progress: number };
  xp: number;
  achievements: { slug: string; title: string; description: string; icon: string; xp: number; earnedAt: string | null }[];
  recentXp: { amount: number; reason: string; createdAt: string }[];
}

const ICONS: Record<string, LucideIcon> = {
  footprints: Footprints, 'book-open': BookOpen, 'graduation-cap': GraduationCap, wrench: Wrench, 'flask-conical': FlaskConical, server: Server,
  'search-check': SearchCheck, layers: Layers, milestone: Milestone, target: Target, 'shield-check': ShieldCheck, binary: Binary, flame: Flame, 'calendar-check': CalendarCheck, zap: Zap,
};
const iconFor = (name: string) => ICONS[name] ?? Award;

export default function AchievementsPage() {
  const q = useQuery({ queryKey: ['achievements'], queryFn: () => api.get<Data>('/me/achievements') });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data;
  const earned = d.achievements.filter((a) => a.earnedAt).length;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Achievements</h1>
      <Card className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted">Level</p>
            <p className="text-4xl font-semibold">{d.level.level}</p>
          </div>
          <div className="min-w-[240px] flex-1">
            <div className="mb-1 flex justify-between text-sm">
              <span>{d.xp} XP</span>
              <span className="text-muted">{d.level.next} XP for level {d.level.level + 1}</span>
            </div>
            <ProgressBar value={d.level.progress * 100} label="Level progress" />
          </div>
          <p className="text-sm text-muted">
            {earned}/{d.achievements.length} badges earned
          </p>
        </div>
      </Card>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {d.achievements.map((a) => {
          const Icon = iconFor(a.icon);
          return (
            <li key={a.slug} className={clsx('flex gap-3 rounded-xl border p-4', a.earnedAt ? 'border-accent/30 bg-surface' : 'border-dashed border-border bg-transparent')}>
              <div className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', a.earnedAt ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-faint')}>
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <p className={clsx('font-medium', !a.earnedAt && 'text-muted')}>{a.title}</p>
                <p className="text-xs text-muted">{a.description}</p>
                <p className="mt-1 text-[11px] text-faint">{a.earnedAt ? `Earned ${relativeTime(a.earnedAt)}` : a.xp ? `+${a.xp} XP` : 'Locked'}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <Card>
        <CardHeader title="Recent XP" />
        <ul className="divide-y divide-border px-5 pb-3">
          {!d.recentXp.length && <li className="py-4 text-sm text-muted">Complete lessons, quizzes and labs to earn XP.</li>}
          {d.recentXp.map((x, i) => (
            <li key={i} className="flex items-center justify-between py-2 text-sm">
              <span className="truncate">{x.reason.replace(/^(\w+):/, (_, t: string) => `${t[0].toUpperCase()}${t.slice(1)} · `)}</span>
              <span className="flex items-center gap-3">
                <span className="font-mono text-success">+{x.amount}</span>
                <span className="w-16 text-right text-xs text-muted">{relativeTime(x.createdAt)}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
