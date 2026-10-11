import { describe, expect, it } from 'vitest';
import { buildNetwork, validateLab, type LabTask } from '@netforge/sim-engine';
import { modules, validateCurriculum, parseContent, achievements, skills } from '../src';
import type { LabContent } from '../src';
import { apply, solutions } from './solutions';

const all = modules.flatMap((m) => m.activities.map((a) => ({ ...a, module: m.slug })));
const labs = all.filter((a) => (a.content as { mode?: string }).mode === 'lab');

describe('curriculum', () => {
  it('passes schema and reference validation', () => {
    expect(() => validateCurriculum()).not.toThrow();
  });

  it('meets the minimum seed volume', () => {
    const count = (t: string) => all.filter((a) => a.type === t).length;
    expect(modules.length).toBeGreaterThanOrEqual(10);
    expect(count('LESSON')).toBeGreaterThanOrEqual(50);
    expect(count('QUIZ')).toBeGreaterThanOrEqual(20);
    expect(count('LAB')).toBeGreaterThanOrEqual(10);
    expect(count('PROJECT')).toBeGreaterThanOrEqual(3);
    expect(labs.filter((a) => (a.content as LabContent).kind === 'troubleshooting').length).toBeGreaterThanOrEqual(5);
  });

  it('references only known skills', () => {
    const known = new Set(skills.map((s) => s.slug));
    for (const a of all) for (const s of a.skills) expect(known.has(Array.isArray(s) ? s[0] : s), `${a.slug}: ${s}`).toBe(true);
    expect(achievements.length).toBeGreaterThan(5);
  });

  it('has a valid answer index for every inline check and quiz question', () => {
    for (const a of all) {
      const c = a.content as { blocks?: { type: string; options?: string[]; answer?: number }[]; questions?: { type: string; options?: string[]; answer: unknown }[] };
      for (const b of c.blocks ?? []) if (b.type === 'check') expect(b.answer!, a.slug).toBeLessThan(b.options!.length);
      for (const q of c.questions ?? []) {
        if (q.type === 'single') expect(q.answer as number, a.slug).toBeLessThan(q.options!.length);
        if (q.type === 'multi') for (const i of q.answer as number[]) expect(i, a.slug).toBeLessThan(q.options!.length);
      }
    }
  });

  describe.each(labs.map((l) => [l.slug, l] as const))('lab %s', (slug, activity) => {
    const content = parseContent(activity.type, activity.content).data as LabContent;
    const tasks = content.tasks as LabTask[];

    it('is not already solved', () => {
      const net = buildNetwork(content.spec);
      expect(validateLab(net, tasks).passed).toBe(false);
    });

    it('is solved by the reference solution', () => {
      const steps = solutions[slug];
      expect(steps, `missing reference solution for ${slug}`).toBeDefined();
      const net = buildNetwork(content.spec);
      apply(net, steps);
      const result = validateLab(net, tasks);
      const failed = result.tasks.flatMap((t) => t.checks.filter((c) => !c.passed).map((c) => `${t.title}: ${c.label} — ${c.message}`));
      expect(failed).toEqual([]);
    });
  });
});
