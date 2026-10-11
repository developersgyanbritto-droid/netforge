// Curriculum structure + per-user progress, completion and unlocking rules.
import type { ActivityType, ProgressStatus } from '@prisma/client';
import { prisma } from '../../db';

export interface ActivitySummary {
  id: string;
  slug: string;
  type: ActivityType;
  title: string;
  summary: string;
  order: number;
  estMinutes: number;
  difficulty: number;
  xp: number;
  checkpoint: boolean;
  status: ProgressStatus;
  bestScore: number | null;
}

export interface ModuleState {
  id: string;
  slug: string;
  trackSlug: string;
  title: string;
  summary: string;
  level: number;
  order: number;
  estMinutes: number;
  prerequisites: { slug: string; title: string }[];
  activities: ActivitySummary[];
  completedCount: number;
  totalCount: number;
  complete: boolean;
  testedOut: boolean;
  locked: boolean;
  lockReason: string | null;
}

export interface TrackState {
  slug: string;
  title: string;
  description: string;
  kind: string;
  modules: ModuleState[];
}

const TEST_OUT_SCORE = 80;

/** Full curriculum with progress/lock state for a user (or anonymous view when userId is null). */
export async function loadCurriculum(userId: string | null, opts: { includeUnpublished?: boolean } = {}): Promise<TrackState[]> {
  const published = opts.includeUnpublished ? {} : { published: true };
  const [tracks, progress] = await Promise.all([
    prisma.track.findMany({
      orderBy: { order: 'asc' },
      include: {
        modules: {
          where: published,
          orderBy: [{ level: 'asc' }, { order: 'asc' }],
          include: {
            prerequisites: { include: { requires: { select: { slug: true, title: true } } } },
            activities: {
              where: published,
              orderBy: { order: 'asc' },
              select: { id: true, slug: true, type: true, title: true, summary: true, order: true, estMinutes: true, difficulty: true, xp: true, content: true },
            },
          },
        },
      },
    }),
    userId ? prisma.activityProgress.findMany({ where: { userId }, select: { activityId: true, status: true, bestScore: true } }) : Promise.resolve([]),
  ]);
  const prog = new Map(progress.map((p) => [p.activityId, p]));

  const states: TrackState[] = tracks.map((t) => ({
    slug: t.slug,
    title: t.title,
    description: t.description,
    kind: t.kind,
    modules: t.modules.map((m) => {
      const activities: ActivitySummary[] = m.activities.map((a) => {
        const p = prog.get(a.id);
        const { content, ...rest } = a;
        return {
          ...rest,
          checkpoint: a.type === 'QUIZ' && !!(content as { checkpoint?: boolean })?.checkpoint,
          status: p?.status ?? 'NOT_STARTED',
          bestScore: p?.bestScore ?? null,
        };
      });
      const completedCount = activities.filter((a) => a.status === 'COMPLETED').length;
      const quizzes = activities.filter((a) => a.type === 'QUIZ');
      const testedOut = quizzes.length > 0 && quizzes.every((q) => q.status === 'COMPLETED' && (q.bestScore ?? 0) >= TEST_OUT_SCORE);
      return {
        id: m.id,
        slug: m.slug,
        trackSlug: t.slug,
        title: m.title,
        summary: m.summary,
        level: m.level,
        order: m.order,
        estMinutes: activities.reduce((s, a) => s + a.estMinutes, 0),
        prerequisites: m.prerequisites.map((p) => p.requires),
        activities,
        completedCount,
        totalCount: activities.length,
        complete: activities.length > 0 && (completedCount === activities.length || testedOut),
        testedOut: testedOut && completedCount < activities.length,
        locked: false,
        lockReason: null,
      };
    }),
  }));

  const bySlug = new Map(states.flatMap((t) => t.modules).map((m) => [m.slug, m]));
  for (const m of bySlug.values()) {
    const missing = m.prerequisites.filter((p) => !bySlug.get(p.slug)?.complete);
    if (missing.length) {
      m.locked = true;
      m.lockReason = `Complete ${missing.map((p) => p.title).join(' and ')} first — or pass this module's checkpoint quiz to test out.`;
    }
  }
  return states;
}

export async function findModuleState(userId: string, moduleSlug: string): Promise<ModuleState | undefined> {
  const tracks = await loadCurriculum(userId);
  return tracks.flatMap((t) => t.modules).find((m) => m.slug === moduleSlug);
}

/** Whether a user may open an activity: unlocked module, or a checkpoint quiz (test-out). */
export function canAccess(module: ModuleState, activity: ActivitySummary | undefined): boolean {
  if (!module.locked) return true;
  return !!activity && activity.type === 'QUIZ' && activity.checkpoint;
}

export function allModules(tracks: TrackState[]): ModuleState[] {
  return tracks.flatMap((t) => t.modules);
}
