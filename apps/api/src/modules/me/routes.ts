import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { badRequest, notFound, parse } from '../../lib/errors';
import { publicUser, requireUser } from '../../lib/auth';
import { allModules, loadCurriculum, type ActivitySummary, type ModuleState } from '../curriculum/service';
import { levelFromXp, masteryOf, streakFrom, todayUtc } from '../gamification/rules';
import { addStudyTime, evaluateAchievements } from '../progress/service';
import { parseNetwork } from '../assessment/grading';

const idParam = z.object({ id: z.string().min(1).max(40) });

interface PlanItem {
  kind: 'activity' | 'practice';
  slug?: string;
  href?: string;
  title: string;
  type?: string;
  minutes: number;
  reason: string;
}

function buildPlan(modules: ModuleState[], skillRows: { slug: string; name: string; score: number; evidence: number }[], goal: number, minutesToday: number) {
  const plan: PlanItem[] = [];
  let budget = Math.max(goal - minutesToday, Math.min(goal, 15));
  const current =
    modules.find((m) => m.trackSlug === 'core' && !m.locked && !m.complete) ?? modules.find((m) => !m.locked && !m.complete);
  const used = new Set<string>();
  if (current) {
    for (const a of current.activities) {
      if (a.status === 'COMPLETED') continue;
      if (plan.length && budget - a.estMinutes < goal * 0.3) break;
      plan.push({ kind: 'activity', slug: a.slug, title: a.title, type: a.type, minutes: a.estMinutes, reason: `Next in ${current.title}` });
      used.add(a.slug);
      budget -= a.estMinutes;
      if (plan.length >= 3) break;
    }
  }
  const weakest = skillRows.filter((s) => s.evidence > 0 && s.score < 70).sort((a, b) => a.score - b.score)[0];
  if (weakest && budget > 0) {
    const candidates: ActivitySummary[] = modules
      .filter((m) => !m.locked)
      .flatMap((m) => m.activities)
      .filter((a) => !used.has(a.slug) && (a.type === 'QUIZ' || a.type === 'LAB' || a.type === 'CHALLENGE') && (a.bestScore ?? 0) < 90);
    const pick = candidates.find((a) => (a as ActivitySummary & { skillSlugs?: string[] }).skillSlugs?.includes(weakest.slug)) ?? candidates[0];
    if (pick) {
      plan.push({ kind: 'activity', slug: pick.slug, title: pick.title, type: pick.type, minutes: pick.estMinutes, reason: `Strengthen ${weakest.name} (${Math.round(weakest.score)}%)` });
      budget -= pick.estMinutes;
    }
  }
  const subnettingUnlocked = modules.some((m) => m.slug === 'subnetting' && !m.locked);
  if (subnettingUnlocked && budget > 0) {
    plan.push({ kind: 'practice', href: '/app/subnetting', title: 'Subnetting drill', minutes: Math.min(10, Math.max(5, budget)), reason: 'Daily repetition builds speed' });
  }
  return { plan, current };
}

export async function meRoutes(app: FastifyInstance) {
  app.get('/me/dashboard', async (req) => {
    const user = requireUser(req);
    const since = new Date(Date.now() - 27 * 86400_000);
    const [tracks, days, skills, userSkills, recent, quizAgg, labAgg, unread, links] = await Promise.all([
      loadCurriculum(user.id),
      prisma.studyDay.findMany({ where: { userId: user.id }, orderBy: { day: 'desc' }, take: 400 }),
      prisma.skill.findMany({ orderBy: { name: 'asc' } }),
      prisma.userSkill.findMany({ where: { userId: user.id } }),
      prisma.attempt.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 6, include: { activity: { select: { slug: true, title: true, type: true } } } }),
      prisma.attempt.aggregate({ where: { userId: user.id, activity: { type: 'QUIZ' } }, _avg: { score: true }, _count: true }),
      prisma.attempt.groupBy({ by: ['passed'], where: { userId: user.id, activity: { type: { in: ['LAB', 'PROJECT', 'CHALLENGE'] } } }, _count: true }),
      prisma.notification.count({ where: { userId: user.id, readAt: null } }),
      prisma.activitySkill.findMany({ select: { activityId: true, skill: { select: { slug: true } } } }),
    ]);
    const modules = allModules(tracks);
    const skillByActivity = new Map<string, string[]>();
    for (const l of links) skillByActivity.set(l.activityId, [...(skillByActivity.get(l.activityId) ?? []), l.skill.slug]);
    for (const m of modules) for (const a of m.activities) (a as ActivitySummary & { skillSlugs?: string[] }).skillSlugs = skillByActivity.get(a.id);

    const us = new Map(userSkills.map((s) => [s.skillId, s]));
    const skillRows = skills.map((s) => {
      const u = us.get(s.id);
      return { slug: s.slug, name: s.name, domain: s.domain, score: u?.score ?? 0, evidence: u?.evidence ?? 0, mastery: masteryOf(u?.score ?? 0, u?.evidence ?? 0) };
    });
    const today = todayUtc();
    const dayStrings = days.map((d) => d.day.toISOString().slice(0, 10));
    const minutesToday = days.find((d) => d.day.toISOString().slice(0, 10) === today)?.minutes ?? 0;
    const history = Array.from({ length: 28 }, (_, i) => {
      const d = new Date(since.getTime() + i * 86400_000).toISOString().slice(0, 10);
      const row = days.find((x) => x.day.toISOString().slice(0, 10) === d);
      return { day: d, minutes: row?.minutes ?? 0, xp: row?.xp ?? 0 };
    });
    const { plan, current } = buildPlan(modules, skillRows, user.dailyGoalMinutes, minutesToday);
    const nextUp = plan.find((p) => p.kind === 'activity') ?? null;
    const all = modules.flatMap((m) => m.activities);
    const completedOf = (t: string) => all.filter((a) => a.type === t && a.status === 'COMPLETED').length;
    const totalOf = (t: string) => all.filter((a) => a.type === t).length;
    const passedLabs = labAgg.find((g) => g.passed)?._count ?? 0;
    const totalLabAttempts = labAgg.reduce((s, g) => s + g._count, 0);
    const practiced = skillRows.filter((s) => s.evidence > 0);

    return {
      user: publicUser(user),
      level: levelFromXp(user.xp),
      streak: streakFrom(dayStrings, today),
      goal: { minutes: user.dailyGoalMinutes, doneToday: minutesToday },
      weekMinutes: history.slice(-7).reduce((s, d) => s + d.minutes, 0),
      history,
      nextUp,
      plan,
      currentModule: current ? { slug: current.slug, title: current.title, completed: current.completedCount, total: current.totalCount, level: current.level } : null,
      counts: {
        lessons: { done: completedOf('LESSON'), total: totalOf('LESSON') },
        quizzes: { done: completedOf('QUIZ'), total: totalOf('QUIZ') },
        labs: { done: completedOf('LAB') + completedOf('PROJECT'), total: totalOf('LAB') + totalOf('PROJECT') },
        challenges: { done: completedOf('CHALLENGE'), total: totalOf('CHALLENGE') },
        modules: { done: modules.filter((m) => m.complete).length, total: modules.length },
      },
      quizAverage: quizAgg._count ? Math.round(quizAgg._avg.score ?? 0) : null,
      labPassRate: totalLabAttempts ? Math.round((passedLabs / totalLabAttempts) * 100) : null,
      strongSkills: [...practiced].filter((s) => s.score >= 70).sort((a, b) => b.score - a.score).slice(0, 3),
      weakSkills: [...practiced].filter((s) => s.score < 70).sort((a, b) => a.score - b.score).slice(0, 3),
      skillMap: skillRows,
      recentAttempts: recent.map((r) => ({ id: r.id, score: r.score, passed: r.passed, createdAt: r.createdAt, activity: r.activity })),
      unreadNotifications: unread,
    };
  });

  app.get('/me/skills', async (req) => {
    const user = requireUser(req);
    const [skills, userSkills, domains] = await Promise.all([
      prisma.skill.findMany({ orderBy: [{ domain: 'asc' }, { name: 'asc' }], include: { activities: { include: { activity: { select: { slug: true, title: true, type: true, published: true } } } } } }),
      prisma.userSkill.findMany({ where: { userId: user.id } }),
      prisma.certDomain.findMany({ orderBy: [{ cert: 'asc' }, { code: 'asc' }], include: { skills: { select: { skill: { select: { slug: true } } } } } }),
    ]);
    const us = new Map(userSkills.map((s) => [s.skillId, s]));
    const rows = skills.map((s) => {
      const u = us.get(s.id);
      const acts = s.activities.filter((a) => a.activity.published).map((a) => a.activity);
      return {
        slug: s.slug,
        name: s.name,
        domain: s.domain,
        description: s.description,
        score: Math.round(u?.score ?? 0),
        evidence: u?.evidence ?? 0,
        mastery: masteryOf(u?.score ?? 0, u?.evidence ?? 0),
        lastPracticedAt: u?.lastPracticedAt ?? null,
        lessons: acts.filter((a) => a.type === 'LESSON').length,
        labs: acts.filter((a) => a.type === 'LAB' || a.type === 'PROJECT' || a.type === 'CHALLENGE'),
        assessments: acts.filter((a) => a.type === 'QUIZ'),
      };
    });
    const bySlug = new Map(rows.map((r) => [r.slug, r]));
    const certs = domains.map((d) => {
      const sk = d.skills.map((x) => bySlug.get(x.skill.slug)).filter(Boolean) as typeof rows;
      return { cert: d.cert, code: d.code, title: d.title, skills: sk.map((s) => ({ slug: s.slug, name: s.name, score: s.score, mastery: s.mastery })), readiness: sk.length ? Math.round(sk.reduce((t, s) => t + s.score, 0) / sk.length) : 0 };
    });
    return { skills: rows, certifications: certs };
  });

  app.get('/me/achievements', async (req) => {
    const user = requireUser(req);
    const [all, mine, xpEvents] = await Promise.all([
      prisma.achievement.findMany({ orderBy: { xp: 'asc' } }),
      prisma.userAchievement.findMany({ where: { userId: user.id } }),
      prisma.xpEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 15 }),
    ]);
    const earned = new Map(mine.map((m) => [m.achievementId, m.earnedAt]));
    return {
      level: levelFromXp(user.xp),
      xp: user.xp,
      achievements: all.map((a) => ({ slug: a.slug, title: a.title, description: a.description, icon: a.icon, xp: a.xp, earnedAt: earned.get(a.id) ?? null })),
      recentXp: xpEvents.map((e) => ({ amount: e.amount, reason: e.reason, createdAt: e.createdAt })),
    };
  });

  app.patch('/me/settings', async (req) => {
    const user = requireUser(req);
    const body = parse(
      z.object({
        displayName: z.string().trim().min(2).max(60).optional(),
        dailyGoalMinutes: z.number().int().min(10).max(240).optional(),
        experience: z.enum(['beginner', 'some', 'experienced']).optional(),
      }),
      req.body,
    );
    const u = await prisma.user.update({ where: { id: user.id }, data: body });
    return { user: publicUser(u) };
  });

  app.post('/me/heartbeat', { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } }, async (req) => {
    const user = requireUser(req);
    const { minutes } = parse(z.object({ minutes: z.number().int().min(1).max(2) }), req.body);
    await addStudyTime(user.id, minutes);
    const newAchievements = await evaluateAchievements(user.id);
    return { ok: true, newAchievements };
  });

  // ---- notes ----
  const noteBody = z.object({ body: z.string().trim().min(1).max(10_000), activitySlug: z.string().max(100).optional() });
  app.get('/me/notes', async (req) => {
    const user = requireUser(req);
    const q = parse(z.object({ activity: z.string().max(100).optional() }), req.query);
    const notes = await prisma.note.findMany({
      where: { userId: user.id, ...(q.activity ? { activity: { slug: q.activity } } : {}) },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: { activity: { select: { slug: true, title: true } } },
    });
    return { notes };
  });
  app.post('/me/notes', async (req, reply) => {
    const user = requireUser(req);
    const body = parse(noteBody, req.body);
    const activity = body.activitySlug ? await prisma.activity.findUnique({ where: { slug: body.activitySlug }, select: { id: true } }) : null;
    if (body.activitySlug && !activity) throw notFound('Activity');
    const note = await prisma.note.create({ data: { userId: user.id, body: body.body, activityId: activity?.id }, include: { activity: { select: { slug: true, title: true } } } });
    return reply.code(201).send({ note });
  });
  app.patch('/me/notes/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(idParam, req.params);
    const { body } = parse(z.object({ body: z.string().trim().min(1).max(10_000) }), req.body);
    const r = await prisma.note.updateMany({ where: { id, userId: user.id }, data: { body } });
    if (!r.count) throw notFound('Note');
    return { ok: true };
  });
  app.delete('/me/notes/:id', async (req, reply) => {
    const user = requireUser(req);
    const { id } = parse(idParam, req.params);
    const r = await prisma.note.deleteMany({ where: { id, userId: user.id } });
    if (!r.count) throw notFound('Note');
    return reply.code(204).send();
  });

  // ---- bookmarks ----
  app.get('/me/bookmarks', async (req) => {
    const user = requireUser(req);
    const bookmarks = await prisma.bookmark.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { activity: { select: { slug: true, title: true, type: true, estMinutes: true, module: { select: { title: true } } } } },
    });
    return { bookmarks: bookmarks.map((b) => ({ createdAt: b.createdAt, ...b.activity })) };
  });
  app.put('/me/bookmarks/:slug', async (req) => {
    const user = requireUser(req);
    const { slug } = parse(z.object({ slug: z.string().max(100) }), req.params);
    const a = await prisma.activity.findUnique({ where: { slug }, select: { id: true } });
    if (!a) throw notFound('Activity');
    await prisma.bookmark.upsert({ where: { userId_activityId: { userId: user.id, activityId: a.id } }, create: { userId: user.id, activityId: a.id }, update: {} });
    return { bookmarked: true };
  });
  app.delete('/me/bookmarks/:slug', async (req) => {
    const user = requireUser(req);
    const { slug } = parse(z.object({ slug: z.string().max(100) }), req.params);
    await prisma.bookmark.deleteMany({ where: { userId: user.id, activity: { slug } } });
    return { bookmarked: false };
  });

  // ---- saved topologies (sandbox) ----
  const topoBody = z.object({ name: z.string().trim().min(1).max(80), data: z.unknown() });
  app.get('/me/topologies', async (req) => {
    const user = requireUser(req);
    const topologies = await prisma.savedTopology.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' }, select: { id: true, name: true, updatedAt: true, createdAt: true } });
    return { topologies };
  });
  app.get('/me/topologies/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(idParam, req.params);
    const t = await prisma.savedTopology.findFirst({ where: { id, userId: user.id } });
    if (!t) throw notFound('Topology');
    return { topology: t };
  });
  app.post('/me/topologies', async (req, reply) => {
    const user = requireUser(req);
    const body = parse(topoBody, req.body);
    if ((await prisma.savedTopology.count({ where: { userId: user.id } })) >= 50) throw badRequest('You can save up to 50 topologies. Delete one first.');
    const data = parseNetwork(body.data) as unknown as Prisma.InputJsonValue;
    const t = await prisma.savedTopology.create({ data: { userId: user.id, name: body.name, data }, select: { id: true, name: true, updatedAt: true } });
    return reply.code(201).send({ topology: t });
  });
  app.put('/me/topologies/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(idParam, req.params);
    const body = parse(topoBody, req.body);
    const data = parseNetwork(body.data) as unknown as Prisma.InputJsonValue;
    const r = await prisma.savedTopology.updateMany({ where: { id, userId: user.id }, data: { name: body.name, data } });
    if (!r.count) throw notFound('Topology');
    return { ok: true };
  });
  app.delete('/me/topologies/:id', async (req, reply) => {
    const user = requireUser(req);
    const { id } = parse(idParam, req.params);
    const r = await prisma.savedTopology.deleteMany({ where: { id, userId: user.id } });
    if (!r.count) throw notFound('Topology');
    return reply.code(204).send();
  });

  // ---- notifications ----
  app.get('/me/notifications', async (req) => {
    const user = requireUser(req);
    const notifications = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 30 });
    return { notifications };
  });
  app.post('/me/notifications/read', async (req) => {
    const user = requireUser(req);
    const { ids } = parse(z.object({ ids: z.array(z.string().max(40)).max(100).optional() }), req.body ?? {});
    await prisma.notification.updateMany({ where: { userId: user.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
    return { ok: true };
  });
}
