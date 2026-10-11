import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { gradeSubnetAnswers } from '@netforge/sim-engine';
import { parseContent, publicQuiz, type LabContent, type QuizContent, type SubnettingChallenge, type ActivityType } from '@netforge/content';
import { prisma } from '../../db';
import { badRequest, forbidden, notFound, parse } from '../../lib/errors';
import { requireUser } from '../../lib/auth';
import { allModules, canAccess, loadCurriculum } from '../curriculum/service';
import { gradeLab, gradeQuiz, parseNetwork } from '../assessment/grading';
import { addStudyTime, recordResult } from '../progress/service';
import { nextSkillScore } from '../gamification/rules';

const slugParam = z.object({ slug: z.string().min(1).max(100) });

async function getActivityForUser(slug: string, userId: string, isStaff: boolean) {
  const activity = await prisma.activity.findUnique({
    where: { slug },
    include: { module: { select: { slug: true, title: true, published: true } }, skills: { include: { skill: { select: { slug: true, name: true } } } } },
  });
  if (!activity || (!isStaff && (!activity.published || !activity.module.published))) throw notFound('Activity');
  const tracks = await loadCurriculum(userId, { includeUnpublished: isStaff });
  const mod = allModules(tracks).find((m) => m.slug === activity.module.slug);
  if (!mod) throw notFound('Module');
  const summary = mod.activities.find((a) => a.id === activity.id);
  if (!isStaff && !canAccess(mod, summary)) throw forbidden(mod.lockReason ?? 'This module is locked', 'LOCKED');
  return { activity, mod };
}

export async function learningRoutes(app: FastifyInstance) {
  app.get('/curriculum', async (req) => {
    const tracks = await loadCurriculum(req.user?.id ?? null);
    return { tracks, authenticated: !!req.user };
  });

  app.get('/modules/:slug', async (req) => {
    const user = requireUser(req);
    const { slug } = parse(slugParam, req.params);
    const tracks = await loadCurriculum(user.id);
    const mod = allModules(tracks).find((m) => m.slug === slug);
    if (!mod) throw notFound('Module');
    return { module: mod };
  });

  app.get('/activities/:slug', async (req) => {
    const user = requireUser(req);
    const { slug } = parse(slugParam, req.params);
    const isStaff = user.role !== 'STUDENT';
    const { activity, mod } = await getActivityForUser(slug, user.id, isStaff);
    const [progress, bookmark] = await Promise.all([
      prisma.activityProgress.findUnique({ where: { userId_activityId: { userId: user.id, activityId: activity.id } } }),
      prisma.bookmark.findUnique({ where: { userId_activityId: { userId: user.id, activityId: activity.id } } }),
    ]);
    const parsed = parseContent(activity.type as ActivityType, activity.content);
    if (!parsed.success) throw badRequest('This activity has invalid content. Please report it to an administrator.');
    let content: unknown = parsed.data;
    const completed = progress?.status === 'COMPLETED';
    if (activity.type === 'QUIZ') content = publicQuiz(parsed.data as QuizContent);
    else if ((parsed.data as { mode?: string }).mode === 'lab' && !completed) content = { ...(parsed.data as LabContent), debrief: '' };

    const idx = mod.activities.findIndex((a) => a.id === activity.id);
    const nav = (a?: (typeof mod.activities)[number]) => (a ? { slug: a.slug, title: a.title, type: a.type } : null);
    return {
      activity: {
        id: activity.id,
        slug: activity.slug,
        type: activity.type,
        title: activity.title,
        summary: activity.summary,
        estMinutes: activity.estMinutes,
        difficulty: activity.difficulty,
        xp: activity.xp,
        content,
        skills: activity.skills.map((s) => s.skill),
      },
      module: { slug: mod.slug, title: mod.title, locked: mod.locked },
      progress: progress
        ? { status: progress.status, bestScore: progress.bestScore, attempts: progress.attempts, draft: progress.draft, completedAt: progress.completedAt }
        : { status: 'NOT_STARTED', bestScore: null, attempts: 0, draft: null, completedAt: null },
      bookmarked: !!bookmark,
      prev: nav(mod.activities[idx - 1]),
      next: nav(mod.activities[idx + 1]),
    };
  });

  const progressSchema = z.object({
    draft: z.unknown().optional(),
    timeSpentSec: z.number().int().min(0).max(900).optional(),
  });

  app.put('/activities/:slug/progress', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const user = requireUser(req);
    const { slug } = parse(slugParam, req.params);
    const body = parse(progressSchema, req.body);
    const { activity } = await getActivityForUser(slug, user.id, user.role !== 'STUDENT');
    let draft: Prisma.InputJsonValue | undefined;
    if (body.draft !== undefined) {
      if (JSON.stringify(body.draft).length > 400_000) throw badRequest('Draft too large');
      draft = parseNetwork(body.draft) as unknown as Prisma.InputJsonValue;
    }
    const p = await prisma.activityProgress.upsert({
      where: { userId_activityId: { userId: user.id, activityId: activity.id } },
      create: { userId: user.id, activityId: activity.id, status: 'IN_PROGRESS', draft, timeSpentSec: body.timeSpentSec ?? 0 },
      update: { ...(draft !== undefined ? { draft } : {}), timeSpentSec: { increment: body.timeSpentSec ?? 0 }, lastSeenAt: new Date() },
    });
    return { progress: { status: p.status, bestScore: p.bestScore, attempts: p.attempts } };
  });

  app.post('/activities/:slug/complete', async (req) => {
    const user = requireUser(req);
    const { slug } = parse(slugParam, req.params);
    const body = parse(z.object({ durationSec: z.number().int().min(0).max(7200).default(0) }), req.body ?? {});
    const { activity } = await getActivityForUser(slug, user.id, user.role !== 'STUDENT');
    if (activity.type !== 'LESSON') throw badRequest('Only lessons can be completed directly; other activities are graded.');
    const outcome = await recordResult({ userId: user.id, activity, score: 100, passed: true, durationSec: body.durationSec, result: {}, isLesson: true });
    return { outcome };
  });

  const quizAttempt = z.object({ answers: z.record(z.union([z.number().int(), z.array(z.number().int()).max(20), z.string().max(200)])), durationSec: z.number().int().min(0).max(14400).default(0) });
  const labAttempt = z.object({ network: z.unknown(), hintsUsed: z.number().int().min(0).max(50).default(0), durationSec: z.number().int().min(0).max(14400).default(0) });
  const subnetAttempt = z.object({ seed: z.number().int().min(1).max(2 ** 31 - 1), answers: z.record(z.string().max(40)), durationSec: z.number().int().min(0).max(14400).default(0) });

  app.post('/activities/:slug/attempts', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const user = requireUser(req);
    const { slug } = parse(slugParam, req.params);
    const { activity } = await getActivityForUser(slug, user.id, user.role !== 'STUDENT');
    const parsed = parseContent(activity.type as ActivityType, activity.content);
    if (!parsed.success) throw badRequest('This activity has invalid content.');
    const content = parsed.data as QuizContent | LabContent | SubnettingChallenge;

    if (activity.type === 'QUIZ') {
      const body = parse(quizAttempt, req.body);
      const g = gradeQuiz(content as QuizContent, body.answers);
      const outcome = await recordResult({ userId: user.id, activity, score: g.score, passed: g.passed, durationSec: body.durationSec, mistakes: g.mistakes, result: { results: g.results } as Prisma.InputJsonValue });
      return { score: g.score, passed: g.passed, passScore: (content as QuizContent).passScore, results: g.results, outcome };
    }

    if ((content as SubnettingChallenge).mode === 'subnetting') {
      const c = content as SubnettingChallenge;
      const body = parse(subnetAttempt, req.body);
      const g = gradeSubnetAnswers(body.seed, c.count, c.difficulty, body.answers);
      const overTime = !!c.timeLimitSec && body.durationSec > c.timeLimitSec + 15;
      const passed = g.score >= c.passScore && !overTime;
      const outcome = await recordResult({
        userId: user.id, activity, score: g.score, passed, durationSec: body.durationSec, mistakes: g.total - g.correct,
        result: { seed: body.seed, results: g.results, overTime } as Prisma.InputJsonValue, context: { subnetting: true },
      });
      return { score: g.score, passed, overTime, passScore: c.passScore, results: g.results, outcome };
    }

    if (activity.type === 'LESSON') throw badRequest('Lessons are completed, not attempted.');
    const lab = content as LabContent;
    const body = parse(labAttempt, req.body);
    const g = gradeLab(lab, body.network, body.hintsUsed);
    const failedChecks = g.validation.tasks.flatMap((t) => t.checks.filter((c) => !c.passed).map((c) => c.label));
    const outcome = await recordResult({
      userId: user.id, activity, score: g.score, passed: g.passed, durationSec: body.durationSec, hintsUsed: g.hintsUsed, mistakes: g.mistakes,
      result: { tasks: g.validation.tasks.map((t) => ({ id: t.id, passed: t.passed })), failedChecks } as Prisma.InputJsonValue,
    });
    if (g.passed) {
      await prisma.activityProgress.update({ where: { userId_activityId: { userId: user.id, activityId: activity.id } }, data: { draft: body.network as Prisma.InputJsonValue } });
    }
    return {
      score: g.score,
      passed: g.passed,
      hintsUsed: g.hintsUsed,
      validation: g.validation,
      debrief: g.passed ? lab.debrief : null,
      concepts: lab.concepts,
      outcome,
    };
  });

  app.get('/activities/:slug/attempts', async (req) => {
    const user = requireUser(req);
    const { slug } = parse(slugParam, req.params);
    const activity = await prisma.activity.findUnique({ where: { slug }, select: { id: true } });
    if (!activity) throw notFound('Activity');
    const attempts = await prisma.attempt.findMany({
      where: { userId: user.id, activityId: activity.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, score: true, passed: true, durationSec: true, hintsUsed: true, mistakes: true, createdAt: true },
    });
    return { attempts };
  });

  // Free subnetting practice (outside the curriculum): server re-generates from the seed.
  const practice = z.object({
    seed: z.number().int().min(1).max(2 ** 31 - 1),
    count: z.number().int().min(3).max(30),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    answers: z.record(z.string().max(40)),
    durationSec: z.number().int().min(0).max(7200).default(0),
  });
  app.post('/practice/subnetting', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const user = requireUser(req);
    const body = parse(practice, req.body);
    const g = gradeSubnetAnswers(body.seed, body.count, body.difficulty, body.answers);
    const skill = await prisma.skill.findUnique({ where: { slug: 'subnetting' } });
    if (skill) {
      const us = await prisma.userSkill.findUnique({ where: { userId_skillId: { userId: user.id, skillId: skill.id } } });
      const score = nextSkillScore(us?.score ?? 0, us?.evidence ?? 0, 'assessment', g.score, 0.5);
      await prisma.userSkill.upsert({
        where: { userId_skillId: { userId: user.id, skillId: skill.id } },
        create: { userId: user.id, skillId: skill.id, score, evidence: 1 },
        update: { score, evidence: { increment: 1 }, lastPracticedAt: new Date() },
      });
    }
    await addStudyTime(user.id, Math.round(body.durationSec / 60));
    return g;
  });
}
