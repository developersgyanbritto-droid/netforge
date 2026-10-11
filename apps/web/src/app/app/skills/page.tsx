'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import type { Mastery } from '@/lib/types';
import { masteryLabel, masteryTone, typeLabel } from '@/lib/format';
import { Badge, Card, CardHeader, ErrorState, ProgressBar, Spinner } from '@/components/ui';

interface SkillDetail {
  slug: string;
  name: string;
  domain: string;
  description: string;
  score: number;
  evidence: number;
  mastery: Mastery;
  lessons: number;
  labs: { slug: string; title: string; type: 'LAB' | 'CHALLENGE' | 'PROJECT' }[];
  assessments: { slug: string; title: string; type: 'QUIZ' }[];
}
interface CertRow {
  cert: string;
  code: string;
  title: string;
  readiness: number;
  skills: { slug: string; name: string; score: number; mastery: Mastery }[];
}

const CERT_NAME: Record<string, string> = { FUNDAMENTALS: 'Networking fundamentals', CCNA: 'CCNA topic areas', MTCNA: 'MikroTik MTCNA topic areas' };

export default function SkillsPage() {
  const q = useQuery({ queryKey: ['skills'], queryFn: () => api.get<{ skills: SkillDetail[]; certifications: CertRow[] }>('/me/skills') });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const domains = [...new Set(q.data.skills.map((s) => s.domain))];
  const certs = [...new Set(q.data.certifications.map((c) => c.cert))];
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Skill map</h1>
        <p className="text-sm text-muted">Mastery is earned from quiz, lab and challenge results — lessons alone only move a skill to &ldquo;Learning&rdquo;.</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {(['NOT_STARTED', 'LEARNING', 'PRACTICING', 'COMPETENT', 'MASTERED'] as Mastery[]).map((m) => (
            <Badge key={m} tone={masteryTone[m]}>
              {masteryLabel[m]}
            </Badge>
          ))}
        </div>
      </div>
      {domains.map((d) => (
        <section key={d}>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">{d}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {q.data.skills
              .filter((s) => s.domain === d)
              .map((s) => (
                <Card key={s.slug} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{s.name}</h3>
                      <p className="text-xs text-muted">{s.description}</p>
                    </div>
                    <Badge tone={masteryTone[s.mastery]}>{masteryLabel[s.mastery]}</Badge>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <ProgressBar value={s.score} tone={s.score >= 70 ? 'success' : 'accent'} label={`${s.name} score`} />
                    <span className="w-10 text-right font-mono text-sm">{s.score}%</span>
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    {s.lessons} lessons · {s.assessments.length} quizzes · {s.labs.length} labs/challenges · {s.evidence} pieces of evidence
                  </p>
                  {(s.labs.length > 0 || s.assessments.length > 0) && (
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer text-xs font-medium text-accent">Practise this skill</summary>
                      <ul className="mt-2 space-y-1">
                        {[...s.labs, ...s.assessments].map((a) => (
                          <li key={a.slug}>
                            <Link href={`/app/learn/${a.slug}`} className="flex items-center justify-between gap-2 rounded px-1.5 py-1 hover:bg-surface-2">
                              <span className="truncate">{a.title}</span>
                              <Badge>{typeLabel[a.type]}</Badge>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </Card>
              ))}
          </div>
        </section>
      ))}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Certification alignment</h2>
          <p className="text-sm text-muted">How your skills map to publicly listed exam topic areas. Readiness is the average of the mapped skill scores — an indicator, not a prediction of exam results.</p>
        </div>
        {certs.map((c) => (
          <Card key={c}>
            <CardHeader title={CERT_NAME[c] ?? c} />
            <ul className="divide-y divide-border px-5 pb-3">
              {q.data.certifications
                .filter((x) => x.cert === c)
                .map((x) => (
                  <li key={x.code} className="py-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span>
                        <span className="mr-2 font-mono text-xs text-muted">{x.code}</span>
                        {x.title}
                      </span>
                      <span className="font-mono">{x.readiness}%</span>
                    </div>
                    <ProgressBar value={x.readiness} className="mt-1.5" label={`${x.title} readiness`} />
                    <p className="mt-1.5 text-xs text-muted">Skills: {x.skills.map((s) => s.name).join(', ')}</p>
                  </li>
                ))}
            </ul>
          </Card>
        ))}
      </section>
    </div>
  );
}
