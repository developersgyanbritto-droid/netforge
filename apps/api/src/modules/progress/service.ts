// Records learning evidence and applies its consequences (progress, XP, skills, streak,
// achievements, notifications) in one place.
import type { Activity, Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { achievements as achievementDefs, type AchievementCriteria } from '@netforge/content';
import { dayDate, levelFromXp, nextSkillScore, streakFrom, todayUtc, xpForResult } from '../gamification/rules';
import { allModules, loadCurriculum } from '../curriculum/service';

export interface ResultInput {
  userId: string;
  activity: Pick<Activity, 'id' | 'type' | 'xp' | 'title'>;
  score: number;
  passed: boolean;
  durationSec: number;
  hintsUsed?: number;
  mistakes?: number;
  result: Prisma.InputJsonValue;
  /** Lessons are completions without an attempt record */
  isLesson?: boolean;
  context?: { subnetting?: boolean };
}

export interface ResultOutcome {
  xpAwarded: number;
  totalXp: number;
  level: number;
  leveledUp: boolean;
  newAchievements: { slug: string; title: string; description: string; icon: string }[];
  bestScore: number;
  attemptId?: string;
}

export async function addStudyTime(userId: string, minutes: number, xp = 0): Promise<void> {
  const day = dayDate(todayUtc());
  const m = Math.max(0, Math.min(minutes, 240));
  await prisma.studyDay.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, minutes: m, xp },
    update: { minutes: { increment: m }, xp: { increment: xp } },
  });
}

async function grantXp(tx: Prisma.TransactionClient, userId: string, amount: number, reason: string, activityId?: string) {
  if (amount <= 0) return;
  await tx.xpEvent.create({ data: { userId, amount, reason, activityId } });
  await tx.user.update({ where: { id: userId }, data: { xp: { increment: amount } } });
}

export async function recordResult(input: ResultInput): Promise<ResultOutcome> {
  const { userId, activity } = input;
  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { xp: true } });

  const outcome = await prisma.$transaction(async (tx) => {
    const existing = await tx.activityProgress.findUnique({ where: { userId_activityId: { userId, activityId: activity.id } } });
    const prevBest = existing?.status === 'COMPLETED' ? (existing.bestScore ?? 0) : null;
    const bestScore = Math.max(existing?.bestScore ?? 0, input.score);
    const xpAwarded = xpForResult(activity.xp, input.score, prevBest, input.passed);

    let attemptId: string | undefined;
    if (!input.isLesson) {
      const attempt = await tx.attempt.create({
        data: {
          userId,
          activityId: activity.id,
          score: input.score,
          passed: input.passed,
          durationSec: input.durationSec,
          hintsUsed: input.hintsUsed ?? 0,
          mistakes: input.mistakes ?? 0,
          result: input.result,
        },
      });
      attemptId = attempt.id;
    }

    const completedNow = input.passed;
    await tx.activityProgress.upsert({
      where: { userId_activityId: { userId, activityId: activity.id } },
      create: {
        userId,
        activityId: activity.id,
        status: completedNow ? 'COMPLETED' : 'IN_PROGRESS',
        bestScore,
        attempts: input.isLesson ? 0 : 1,
        timeSpentSec: input.durationSec,
        completedAt: completedNow ? new Date() : null,
      },
      update: {
        status: completedNow || existing?.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS',
        bestScore,
        attempts: { increment: input.isLesson ? 0 : 1 },
        timeSpentSec: { increment: input.durationSec },
        completedAt: existing?.completedAt ?? (completedNow ? new Date() : null),
        lastSeenAt: new Date(),
      },
    });

    await grantXp(tx, userId, xpAwarded, `${activity.type.toLowerCase()}:${activity.title}`, activity.id);

    // Skill evidence
    const links = await tx.activitySkill.findMany({ where: { activityId: activity.id } });
    for (const l of links) {
      const us = await tx.userSkill.findUnique({ where: { userId_skillId: { userId, skillId: l.skillId } } });
      const score = nextSkillScore(us?.score ?? 0, us?.evidence ?? 0, input.isLesson ? 'exposure' : 'assessment', input.score, l.weight);
      await tx.userSkill.upsert({
        where: { userId_skillId: { userId, skillId: l.skillId } },
        create: { userId, skillId: l.skillId, score, evidence: 1 },
        update: { score, evidence: { increment: 1 }, lastPracticedAt: new Date() },
      });
    }
    return { xpAwarded, bestScore, attemptId };
  });

  await addStudyTime(userId, Math.round(input.durationSec / 60), outcome.xpAwarded);
  const newAchievements = await evaluateAchievements(userId, {
    quizPerfect: activity.type === 'QUIZ' && input.score === 100,
    labNoHints: (activity.type === 'LAB' || activity.type === 'PROJECT') && input.passed && (input.hintsUsed ?? 0) === 0,
    subnettingPerfect: !!input.context?.subnetting && input.score === 100,
  });

  const after = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { xp: true } });
  const lvBefore = levelFromXp(before.xp).level;
  const lvAfter = levelFromXp(after.xp).level;
  if (lvAfter > lvBefore) {
    await prisma.notification.create({ data: { userId, type: 'level', title: `Level ${lvAfter} reached`, body: `You now have ${after.xp} XP. Keep going!` } });
  }
  return { ...outcome, totalXp: after.xp, level: lvAfter, leveledUp: lvAfter > lvBefore, newAchievements };
}

interface AchievementContext {
  quizPerfect?: boolean;
  labNoHints?: boolean;
  subnettingPerfect?: boolean;
}

export async function evaluateAchievements(userId: string, ctx: AchievementContext = {}) {
  const [earned, all] = await Promise.all([
    prisma.userAchievement.findMany({ where: { userId }, select: { achievementId: true } }),
    prisma.achievement.findMany(),
  ]);
  const have = new Set(earned.map((e) => e.achievementId));
  const pending = all.filter((a) => !have.has(a.id));
  if (!pending.length) return [];

  const completedByType = await prisma.activityProgress.groupBy({
    by: ['activityId'],
    where: { userId, status: 'COMPLETED' },
  });
  const ids = completedByType.map((c) => c.activityId);
  const types = ids.length ? await prisma.activity.findMany({ where: { id: { in: ids } }, select: { type: true } }) : [];
  const count = (...t: string[]) => types.filter((x) => t.includes(x.type)).length;
  let modulesCompleted: number | null = null;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { xp: true } });
  const days = await prisma.studyDay.findMany({ where: { userId }, select: { day: true }, orderBy: { day: 'desc' }, take: 400 });
  const streak = streakFrom(days.map((d) => d.day.toISOString().slice(0, 10)), todayUtc());

  const unlocked: typeof pending = [];
  for (const a of pending) {
    const c = a.criteria as AchievementCriteria;
    let ok = false;
    switch (c.kind) {
      case 'lessons_completed':
        ok = count('LESSON') >= c.count;
        break;
      case 'labs_completed':
        ok = count('LAB', 'PROJECT') >= c.count;
        break;
      case 'challenges_completed':
        ok = count('CHALLENGE') >= c.count;
        break;
      case 'modules_completed':
        modulesCompleted ??= allModules(await loadCurriculum(userId)).filter((m) => m.complete).length;
        ok = modulesCompleted >= c.count;
        break;
      case 'quiz_perfect':
        ok = !!ctx.quizPerfect;
        break;
      case 'lab_no_hints':
        ok = !!ctx.labNoHints;
        break;
      case 'subnetting_perfect':
        ok = !!ctx.subnettingPerfect;
        break;
      case 'streak':
        ok = streak >= c.days;
        break;
      case 'xp_total':
        ok = user.xp >= c.xp;
        break;
    }
    if (ok) unlocked.push(a);
  }

  for (const a of unlocked) {
    await prisma.$transaction(async (tx) => {
      await tx.userAchievement.create({ data: { userId, achievementId: a.id } });
      await grantXp(tx, userId, a.xp, `achievement:${a.slug}`);
      await tx.notification.create({ data: { userId, type: 'achievement', title: `Achievement unlocked: ${a.title}`, body: a.description } });
    });
  }
  return unlocked.map((a) => ({ slug: a.slug, title: a.title, description: a.description, icon: a.icon }));
}

/** Achievement definitions are code-owned; keep the table in sync at boot/seed. */
export async function syncAchievements(): Promise<void> {
  for (const a of achievementDefs) {
    await prisma.achievement.upsert({
      where: { slug: a.slug },
      create: { slug: a.slug, title: a.title, description: a.description, icon: a.icon, xp: a.xp, criteria: a.criteria },
      update: { title: a.title, description: a.description, icon: a.icon, xp: a.xp, criteria: a.criteria },
    });
  }
}
