import type { Metadata } from 'next';
import { ArrowRight, Clock } from 'lucide-react';
import { ButtonLink } from '@/components/ui';
import { loadPublicCurriculum } from '@/lib/server-curriculum';

export const metadata: Metadata = {
  title: 'Curriculum',
  description: 'The complete NetForge learning path: networking fundamentals, OSI, switching, IPv4, subnetting, routing, VLANs, inter-VLAN routing, services, security, troubleshooting, projects and MikroTik RouterOS.',
};

const TYPE_DOT: Record<string, string> = { LESSON: 'bg-faint', QUIZ: 'bg-warning', LAB: 'bg-accent', CHALLENGE: 'bg-danger', PROJECT: 'bg-success' };

export default async function CurriculumPage() {
  const tracks = await loadPublicCurriculum();
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Curriculum</h1>
      <p className="mt-2 max-w-2xl text-muted">Each module combines short visual lessons, embedded simulations, quizzes, hands-on labs and troubleshooting challenges. Modules unlock in order — or test out with a checkpoint quiz.</p>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted">
        {Object.entries(TYPE_DOT).map(([t, c]) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${c}`} /> {t.toLowerCase()}
          </span>
        ))}
      </div>
      {!tracks.length && <p className="mt-10 rounded-lg border border-border bg-surface p-6 text-muted">The curriculum is temporarily unavailable. Please try again shortly.</p>}
      {tracks.map((t) => (
        <section key={t.slug} className="mt-12">
          <h2 className="text-xl font-semibold">{t.title}</h2>
          <p className="mt-1 text-sm text-muted">{t.description}</p>
          <ol className="mt-5 space-y-3">
            {t.modules.map((m) => (
              <li key={m.slug} className="rounded-xl border border-border bg-surface p-5">
                <details>
                  <summary className="flex cursor-pointer list-none items-start gap-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2 font-mono text-sm font-semibold">{m.level}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{m.title}</span>
                      <span className="mt-0.5 block text-sm text-muted">{m.summary}</span>
                      <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-faint">
                        <span>{m.lessons} lessons</span>
                        <span>{m.quizzes} quizzes</span>
                        <span>{m.labs} labs & challenges</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> ~{Math.round(m.estMinutes / 60 * 10) / 10} h
                        </span>
                        {m.prerequisites.length > 0 && <span>Requires: {m.prerequisites.join(', ')}</span>}
                      </span>
                    </span>
                  </summary>
                  <ul className="mt-4 grid gap-1 border-t border-border pt-3 sm:grid-cols-2">
                    {m.activities.map((a) => (
                      <li key={a.slug} className="flex items-center gap-2 text-sm">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TYPE_DOT[a.type]}`} aria-hidden />
                        <span className="truncate">{a.title}</span>
                        <span className="ml-auto shrink-0 text-xs text-faint">{a.estMinutes}m</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ol>
        </section>
      ))}
      <div className="mt-12 text-center">
        <ButtonLink href="/register" size="lg">
          Start the path <ArrowRight className="h-4 w-4" />
        </ButtonLink>
      </div>
    </div>
  );
}
