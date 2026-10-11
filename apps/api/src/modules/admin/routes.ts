import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { buildNetwork } from '@netforge/sim-engine';
import { parseContent, type ActivityType } from '@netforge/content';
import { prisma } from '../../db';
import { badRequest, conflict, notFound, parse } from '../../lib/errors';
import { requireRole } from '../../lib/auth';

const slug = z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, digits and hyphens');
const idParam = z.object({ id: z.string().min(1).max(40) });

async function audit(actorId: string, action: string, entity: string, entityId: string | null, meta?: Prisma.InputJsonValue) {
  await prisma.auditLog.create({ data: { actorId, action, entity, entityId, meta } });
}

function validateActivityContent(type: ActivityType, content: unknown) {
  const r = parseContent(type, content);
  if (!r.success) throw badRequest('Content does not match the schema', r.error.issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), message: i.message })));
  const c = r.data as { spec?: Parameters<typeof buildNetwork>[0]; blocks?: { type: string; spec?: Parameters<typeof buildNetwork>[0] }[] };
  try {
    if (c.spec) buildNetwork(c.spec);
    for (const b of c.blocks ?? []) if (b.type === 'topology' && b.spec) buildNetwork(b.spec);
  } catch (e) {
    throw badRequest(`Topology error: ${(e as Error).message}`);
  }
  return r.data as Prisma.InputJsonValue;
}

/** Rejects prerequisite cycles (A requires B requires A). */
async function assertNoCycle(moduleId: string, requires: string[]) {
  const edges = await prisma.modulePrerequisite.findMany();
  const graph = new Map<string, string[]>();
  for (const e of edges) if (e.moduleId !== moduleId) graph.set(e.moduleId, [...(graph.get(e.moduleId) ?? []), e.requiresId]);
  graph.set(moduleId, requires);
  const seen = new Set<string>();
  const stack = [...requires];
  while (stack.length) {
    const n = stack.pop()!;
    if (n === moduleId) throw badRequest('These prerequisites would create a cycle');
    if (seen.has(n)) continue;
    seen.add(n);
    stack.push(...(graph.get(n) ?? []));
  }
}

export async function adminRoutes(app: FastifyInstance) {
  // ---------- content ----------
  app.get('/admin/content', async (req) => {
    requireRole(req, 'ADMIN', 'INSTRUCTOR');
    const tracks = await prisma.track.findMany({
      orderBy: { order: 'asc' },
      include: {
        modules: {
          orderBy: [{ level: 'asc' }, { order: 'asc' }],
          include: {
            prerequisites: { include: { requires: { select: { slug: true } } } },
            activities: { orderBy: { order: 'asc' }, select: { id: true, slug: true, type: true, title: true, order: true, published: true, version: true, updatedAt: true } },
          },
        },
      },
    });
    const skills = await prisma.skill.findMany({ orderBy: { name: 'asc' }, select: { slug: true, name: true } });
    return { tracks, skills };
  });

  const moduleBody = z.object({
    slug,
    trackSlug: z.string(),
    title: z.string().trim().min(2).max(120),
    summary: z.string().trim().min(2).max(500),
    level: z.number().int().min(0).max(50),
    order: z.number().int().min(0).max(1000).default(0),
    published: z.boolean().default(true),
    prerequisites: z.array(z.string()).max(10).default([]),
  });

  async function saveModule(actorId: string, body: z.infer<typeof moduleBody>, id?: string) {
    const track = await prisma.track.findUnique({ where: { slug: body.trackSlug } });
    if (!track) throw badRequest('Unknown track');
    const dup = await prisma.module.findUnique({ where: { slug: body.slug } });
    if (dup && dup.id !== id) throw conflict('Another module already uses this slug');
    const reqMods = await prisma.module.findMany({ where: { slug: { in: body.prerequisites } }, select: { id: true } });
    if (reqMods.length !== body.prerequisites.length) throw badRequest('Unknown prerequisite module');
    const data = { slug: body.slug, trackId: track.id, title: body.title, summary: body.summary, level: body.level, order: body.order, published: body.published };
    const mod = id ? await prisma.module.update({ where: { id }, data }) : await prisma.module.create({ data });
    await assertNoCycle(mod.id, reqMods.map((m) => m.id));
    await prisma.$transaction([
      prisma.modulePrerequisite.deleteMany({ where: { moduleId: mod.id } }),
      prisma.modulePrerequisite.createMany({ data: reqMods.map((r) => ({ moduleId: mod.id, requiresId: r.id })) }),
    ]);
    await audit(actorId, id ? 'module.update' : 'module.create', 'Module', mod.id, { slug: mod.slug });
    return mod;
  }

  app.post('/admin/modules', async (req, reply) => {
    const u = requireRole(req, 'ADMIN');
    const mod = await saveModule(u.id, parse(moduleBody, req.body));
    return reply.code(201).send({ module: mod });
  });
  app.put('/admin/modules/:id', async (req) => {
    const u = requireRole(req, 'ADMIN');
    const { id } = parse(idParam, req.params);
    if (!(await prisma.module.findUnique({ where: { id } }))) throw notFound('Module');
    return { module: await saveModule(u.id, parse(moduleBody, req.body), id) };
  });
  app.delete('/admin/modules/:id', async (req, reply) => {
    const u = requireRole(req, 'ADMIN');
    const { id } = parse(idParam, req.params);
    const mod = await prisma.module.findUnique({ where: { id }, include: { _count: { select: { activities: true } } } });
    if (!mod) throw notFound('Module');
    if (mod._count.activities) throw badRequest('Move or delete the module\'s activities first');
    await prisma.module.delete({ where: { id } });
    await audit(u.id, 'module.delete', 'Module', id, { slug: mod.slug });
    return reply.code(204).send();
  });

  app.get('/admin/activities/:id', async (req) => {
    requireRole(req, 'ADMIN', 'INSTRUCTOR');
    const { id } = parse(idParam, req.params);
    const a = await prisma.activity.findUnique({ where: { id }, include: { module: { select: { slug: true } }, skills: { include: { skill: { select: { slug: true } } } } } });
    if (!a) throw notFound('Activity');
    return { activity: { ...a, moduleSlug: a.module.slug, skills: a.skills.map((s) => ({ slug: s.skill.slug, weight: s.weight })) } };
  });

  const activityBody = z.object({
    slug,
    moduleSlug: z.string(),
    type: z.enum(['LESSON', 'QUIZ', 'LAB', 'CHALLENGE', 'PROJECT']),
    title: z.string().trim().min(2).max(160),
    summary: z.string().trim().min(2).max(500),
    order: z.number().int().min(0).max(10_000),
    estMinutes: z.number().int().min(1).max(600),
    difficulty: z.number().int().min(1).max(5),
    xp: z.number().int().min(0).max(1000),
    published: z.boolean(),
    content: z.unknown(),
    skills: z.array(z.object({ slug: z.string(), weight: z.number().min(0.1).max(3).default(1) })).max(10).default([]),
  });

  async function saveActivity(actorId: string, body: z.infer<typeof activityBody>, id?: string) {
    const mod = await prisma.module.findUnique({ where: { slug: body.moduleSlug } });
    if (!mod) throw badRequest('Unknown module');
    const dup = await prisma.activity.findUnique({ where: { slug: body.slug } });
    if (dup && dup.id !== id) throw conflict('Another activity already uses this slug');
    const content = validateActivityContent(body.type, body.content);
    const skills = await prisma.skill.findMany({ where: { slug: { in: body.skills.map((s) => s.slug) } } });
    if (skills.length !== body.skills.length) throw badRequest('Unknown skill');
    const base = { slug: body.slug, moduleId: mod.id, type: body.type, title: body.title, summary: body.summary, order: body.order, estMinutes: body.estMinutes, difficulty: body.difficulty, xp: body.xp, published: body.published, content };
    const prev = id ? await prisma.activity.findUnique({ where: { id } }) : null;
    const contentChanged = prev && JSON.stringify(prev.content) !== JSON.stringify(content);
    const a = id
      ? await prisma.activity.update({ where: { id }, data: { ...base, ...(contentChanged ? { version: { increment: 1 } } : {}) } })
      : await prisma.activity.create({ data: base });
    await prisma.$transaction([
      prisma.activitySkill.deleteMany({ where: { activityId: a.id } }),
      prisma.activitySkill.createMany({ data: body.skills.map((s) => ({ activityId: a.id, skillId: skills.find((k) => k.slug === s.slug)!.id, weight: s.weight })) }),
    ]);
    await audit(actorId, id ? 'activity.update' : 'activity.create', 'Activity', a.id, { slug: a.slug, version: a.version });
    return a;
  }

  app.post('/admin/activities', async (req, reply) => {
    const u = requireRole(req, 'ADMIN', 'INSTRUCTOR');
    return reply.code(201).send({ activity: await saveActivity(u.id, parse(activityBody, req.body)) });
  });
  app.put('/admin/activities/:id', async (req) => {
    const u = requireRole(req, 'ADMIN', 'INSTRUCTOR');
    const { id } = parse(idParam, req.params);
    if (!(await prisma.activity.findUnique({ where: { id } }))) throw notFound('Activity');
    return { activity: await saveActivity(u.id, parse(activityBody, req.body), id) };
  });
  app.post('/admin/activities/validate', async (req) => {
    requireRole(req, 'ADMIN', 'INSTRUCTOR');
    const { type, content } = parse(z.object({ type: activityBody.shape.type, content: z.unknown() }), req.body);
    validateActivityContent(type, content);
    return { valid: true };
  });
  app.delete('/admin/activities/:id', async (req, reply) => {
    const u = requireRole(req, 'ADMIN');
    const { id } = parse(idParam, req.params);
    const a = await prisma.activity.findUnique({ where: { id } });
    if (!a) throw notFound('Activity');
    await prisma.activity.delete({ where: { id } });
    await audit(u.id, 'activity.delete', 'Activity', id, { slug: a.slug });
    return reply.code(204).send();
  });

  // ---------- users ----------
  app.get('/admin/users', async (req) => {
    requireRole(req, 'ADMIN');
    const q = parse(z.object({ q: z.string().max(100).optional(), page: z.coerce.number().int().min(1).default(1) }), req.query);
    const where: Prisma.UserWhereInput = q.q ? { OR: [{ email: { contains: q.q, mode: 'insensitive' } }, { displayName: { contains: q.q, mode: 'insensitive' } }] } : {};
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * 25,
        take: 25,
        select: { id: true, email: true, displayName: true, role: true, xp: true, createdAt: true, _count: { select: { attempts: true } } },
      }),
    ]);
    const completed = await prisma.activityProgress.groupBy({ by: ['userId'], where: { userId: { in: users.map((u) => u.id) }, status: 'COMPLETED' }, _count: true });
    const map = new Map(completed.map((c) => [c.userId, c._count]));
    return { total, page: q.page, pageSize: 25, users: users.map((u) => ({ ...u, attempts: u._count.attempts, completed: map.get(u.id) ?? 0 })) };
  });
  app.patch('/admin/users/:id', async (req) => {
    const admin = requireRole(req, 'ADMIN');
    const { id } = parse(idParam, req.params);
    const { role } = parse(z.object({ role: z.enum(['STUDENT', 'INSTRUCTOR', 'ADMIN']) }), req.body);
    if (id === admin.id && role !== 'ADMIN') throw badRequest('You cannot remove your own admin role');
    const user = await prisma.user.update({ where: { id }, data: { role }, select: { id: true, role: true } }).catch(() => null);
    if (!user) throw notFound('User');
    await audit(admin.id, 'user.role', 'User', id, { role });
    return { user };
  });

  // ---------- analytics ----------
  app.get('/admin/analytics', async (req) => {
    requireRole(req, 'ADMIN', 'INSTRUCTOR');
    const [users, activities, attemptStats, passStats, progressStats, recentLabAttempts, skillAvg, skills, newUsers] = await Promise.all([
      prisma.user.count(),
      prisma.activity.findMany({ select: { id: true, slug: true, title: true, type: true, module: { select: { title: true } } } }),
      prisma.attempt.groupBy({ by: ['activityId'], _avg: { score: true, hintsUsed: true, durationSec: true }, _count: true }),
      prisma.attempt.groupBy({ by: ['activityId'], where: { passed: true }, _count: true }),
      prisma.activityProgress.groupBy({ by: ['activityId', 'status'], _count: true }),
      prisma.attempt.findMany({ where: { activity: { type: { in: ['LAB', 'CHALLENGE', 'PROJECT'] } } }, orderBy: { createdAt: 'desc' }, take: 1000, select: { activityId: true, result: true } }),
      prisma.userSkill.groupBy({ by: ['skillId'], _avg: { score: true }, _count: true }),
      prisma.skill.findMany({ select: { id: true, name: true } }),
      prisma.user.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } } }),
    ]);
    const byId = new Map(activities.map((a) => [a.id, a]));
    const pass = new Map(passStats.map((p) => [p.activityId, p._count]));
    const started = new Map<string, number>();
    const completed = new Map<string, number>();
    for (const p of progressStats) {
      started.set(p.activityId, (started.get(p.activityId) ?? 0) + p._count);
      if (p.status === 'COMPLETED') completed.set(p.activityId, p._count);
    }
    const perActivity = attemptStats
      .map((s) => {
        const a = byId.get(s.activityId);
        return {
          slug: a?.slug,
          title: a?.title,
          type: a?.type,
          module: a?.module.title,
          attempts: s._count,
          passRate: Math.round(((pass.get(s.activityId) ?? 0) / s._count) * 100),
          avgScore: Math.round(s._avg.score ?? 0),
          avgHints: Math.round((s._avg.hintsUsed ?? 0) * 10) / 10,
          avgMinutes: Math.round((s._avg.durationSec ?? 0) / 6) / 10,
        };
      })
      .sort((a, b) => a.passRate - b.passRate);
    const dropOff = activities
      .map((a) => ({ slug: a.slug, title: a.title, type: a.type, started: started.get(a.id) ?? 0, completed: completed.get(a.id) ?? 0 }))
      .filter((d) => d.started > 0)
      .map((d) => ({ ...d, completionRate: Math.round((d.completed / d.started) * 100) }))
      .sort((a, b) => a.completionRate - b.completionRate)
      .slice(0, 15);
    const mistakes = new Map<string, { label: string; activity: string; count: number }>();
    for (const at of recentLabAttempts) {
      for (const label of ((at.result as { failedChecks?: string[] })?.failedChecks ?? [])) {
        const key = `${at.activityId}|${label}`;
        const cur = mistakes.get(key) ?? { label, activity: byId.get(at.activityId)?.title ?? '', count: 0 };
        cur.count++;
        mistakes.set(key, cur);
      }
    }
    const skillNames = new Map(skills.map((s) => [s.id, s.name]));
    return {
      totals: { users, newUsers7d: newUsers, attempts: attemptStats.reduce((s, a) => s + a._count, 0), activities: activities.length },
      hardest: perActivity.filter((a) => a.attempts >= 1).slice(0, 15),
      mostHints: [...perActivity].sort((a, b) => b.avgHints - a.avgHints).slice(0, 10),
      dropOff,
      commonMistakes: [...mistakes.values()].sort((a, b) => b.count - a.count).slice(0, 15),
      skills: skillAvg.map((s) => ({ name: skillNames.get(s.skillId), avgScore: Math.round(s._avg.score ?? 0), learners: s._count })).sort((a, b) => a.avgScore - b.avgScore),
    };
  });

  app.get('/admin/audit', async (req) => {
    requireRole(req, 'ADMIN');
    const q = parse(z.object({ page: z.coerce.number().int().min(1).default(1) }), req.query);
    const [total, entries] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * 50, take: 50, include: { actor: { select: { email: true } } } }),
    ]);
    return { total, page: q.page, pageSize: 50, entries };
  });
}
