// Pure rules — no I/O — so they are trivially unit-testable.

/** Level n is reached at 50·(n−1)² XP: L2 = 50, L3 = 200, L4 = 450, L5 = 800 … */
export function levelFromXp(xp: number) {
  const level = Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
  const currentFloor = 50 * (level - 1) ** 2;
  const next = 50 * level ** 2;
  return { level, currentFloor, next, progress: (xp - currentFloor) / (next - currentFloor) };
}

export type Mastery = 'NOT_STARTED' | 'LEARNING' | 'PRACTICING' | 'COMPETENT' | 'MASTERED';

export function masteryOf(score: number, evidence: number): Mastery {
  if (evidence === 0) return 'NOT_STARTED';
  if (score < 40) return 'LEARNING';
  if (score < 70) return 'PRACTICING';
  if (score < 90) return 'COMPETENT';
  return 'MASTERED';
}

/**
 * Skill score update.
 * - Lessons give exposure only: they move a skill toward 35 (never beyond "Learning").
 * - Assessments use an exponentially weighted average, so mastery needs repeated good evidence.
 */
export function nextSkillScore(old: number, evidence: number, kind: 'exposure' | 'assessment', score: number, weight = 1): number {
  if (kind === 'exposure') return old >= 35 ? old : Math.min(35, old + 12 * weight);
  const alpha = Math.min(0.6, (evidence === 0 ? 0.6 : 0.35) * weight);
  return Math.round((old * (1 - alpha) + score * alpha) * 10) / 10;
}

/**
 * XP for an activity result. Full XP is earned proportionally to the score; repeating an
 * activity only pays the improvement over the previous best, which prevents farming.
 */
export function xpForResult(activityXp: number, score: number, previousBest: number | null, passed: boolean): number {
  if (!passed) return 0;
  const earned = Math.round((activityXp * score) / 100);
  const before = previousBest === null ? 0 : Math.round((activityXp * previousBest) / 100);
  return Math.max(0, earned - before);
}

/** Lab score: checks passed, minus 10 % per hint used (minimum 40 % for a pass). */
export function labScore(passedChecks: number, totalChecks: number, hintsUsed: number, passed: boolean): number {
  const base = totalChecks ? Math.round((passedChecks / totalChecks) * 100) : 0;
  if (!passed) return base;
  return Math.max(40, base - hintsUsed * 10);
}

/** Consecutive study days ending today or yesterday (UTC day strings, any order). */
export function streakFrom(days: string[], today: string): number {
  const set = new Set(days);
  const d = new Date(`${today}T00:00:00Z`);
  if (!set.has(today)) d.setUTCDate(d.getUTCDate() - 1);
  let n = 0;
  while (set.has(d.toISOString().slice(0, 10))) {
    n++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return n;
}

export const todayUtc = () => new Date().toISOString().slice(0, 10);
export const dayDate = (day: string) => new Date(`${day}T00:00:00Z`);
