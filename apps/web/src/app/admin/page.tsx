'use client';

import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { Card, CardHeader, ErrorState, ProgressBar, Spinner } from '@/components/ui';

interface Analytics {
  totals: { users: number; newUsers7d: number; attempts: number; activities: number };
  hardest: { slug: string; title: string; type: string; module: string; attempts: number; passRate: number; avgScore: number; avgHints: number; avgMinutes: number }[];
  mostHints: { slug: string; title: string; avgHints: number; attempts: number }[];
  dropOff: { slug: string; title: string; type: string; started: number; completed: number; completionRate: number }[];
  commonMistakes: { label: string; activity: string; count: number }[];
  skills: { name: string; avgScore: number; learners: number }[];
}

function Empty() {
  return <p className="px-5 pb-5 text-sm text-muted">No data yet — it appears as learners attempt activities.</p>;
}

export default function AdminAnalytics() {
  const q = useQuery({ queryKey: ['admin-analytics'], queryFn: () => api.get<Analytics>('/admin/analytics') });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Learning analytics</h1>
        <p className="text-sm text-muted">Use these signals to find content that needs rewriting, more hints or better prerequisites.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['Learners', d.totals.users],
          ['New (7 days)', d.totals.newUsers7d],
          ['Graded attempts', d.totals.attempts],
          ['Activities', d.totals.activities],
        ].map(([k, v]) => (
          <Card key={k as string} className="p-4">
            <p className="text-xs text-muted">{k}</p>
            <p className="text-2xl font-semibold">{v}</p>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader title="Most difficult activities" subtitle="Lowest pass rate first" />
        {!d.hardest.length ? (
          <Empty />
        ) : (
          <div className="overflow-x-auto px-5 pb-5">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  {['Activity', 'Module', 'Attempts', 'Pass rate', 'Avg score', 'Avg hints', 'Avg time'].map((h) => (
                    <th key={h} className="py-2 pr-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.hardest.map((a) => (
                  <tr key={a.slug} className="border-t border-border">
                    <td className="py-2 pr-3 font-medium">{a.title}</td>
                    <td className="py-2 pr-3 text-muted">{a.module}</td>
                    <td className="py-2 pr-3 font-mono">{a.attempts}</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <ProgressBar value={a.passRate} tone={a.passRate < 50 ? 'warning' : 'success'} className="w-16" label="Pass rate" />
                        <span className="font-mono text-xs">{a.passRate}%</span>
                      </div>
                    </td>
                    <td className="py-2 pr-3 font-mono">{a.avgScore}%</td>
                    <td className="py-2 pr-3 font-mono">{a.avgHints}</td>
                    <td className="py-2 pr-3 font-mono">{a.avgMinutes}m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Common configuration mistakes" subtitle="Most frequently failed lab checks" />
          {!d.commonMistakes.length ? (
            <Empty />
          ) : (
            <ul className="space-y-2 px-5 pb-5">
              {d.commonMistakes.map((m, i) => (
                <li key={i} className="flex items-start justify-between gap-3 text-sm">
                  <span>
                    <span className="font-medium">{m.label}</span>
                    <span className="block text-xs text-muted">{m.activity}</span>
                  </span>
                  <span className="font-mono">{m.count}×</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Drop-off points" subtitle="Started but not completed" />
          {!d.dropOff.length ? (
            <Empty />
          ) : (
            <ul className="space-y-2 px-5 pb-5">
              {d.dropOff.map((a) => (
                <li key={a.slug} className="text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="truncate">{a.title}</span>
                    <span className="font-mono text-xs">
                      {a.completed}/{a.started} ({a.completionRate}%)
                    </span>
                  </div>
                  <ProgressBar value={a.completionRate} tone={a.completionRate < 50 ? 'warning' : 'success'} className="mt-1" label="Completion rate" />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Most-used hints" />
          {!d.mostHints.filter((h) => h.avgHints > 0).length ? (
            <Empty />
          ) : (
            <ul className="space-y-1.5 px-5 pb-5 text-sm">
              {d.mostHints
                .filter((h) => h.avgHints > 0)
                .map((h) => (
                  <li key={h.slug} className="flex justify-between">
                    <span className="truncate">{h.title}</span>
                    <span className="font-mono">{h.avgHints} avg</span>
                  </li>
                ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Skill averages" subtitle="Across learners with evidence" />
          {!d.skills.length ? (
            <Empty />
          ) : (
            <ul className="space-y-2 px-5 pb-5 text-sm">
              {d.skills.map((s) => (
                <li key={s.name}>
                  <div className="flex justify-between">
                    <span>{s.name}</span>
                    <span className="font-mono text-xs">
                      {s.avgScore}% · {s.learners} learners
                    </span>
                  </div>
                  <ProgressBar value={s.avgScore} className="mt-1" label={`${s.name} average`} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
