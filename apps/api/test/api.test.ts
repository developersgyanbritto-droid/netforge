// Integration tests: real Fastify app + real PostgreSQL (seeded). Run `pnpm db:seed` first.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildNetwork } from '@netforge/sim-engine';
import { modules, type LabContent, type QuizContent } from '@netforge/content';
import { buildApp } from '../src/app';
import { prisma } from '../src/db';
import { apply, solutions } from '../../../packages/content/test/solutions';
import { levelFromXp, streakFrom, xpForResult, labScore } from '../src/modules/gamification/rules';

let app: FastifyInstance;
const email = `test-${Date.now()}@example.com`;
let cookie = '';

const H = () => ({ 'x-nf-request': '1', cookie });
const activity = (slug: string) => modules.flatMap((m) => m.activities).find((a) => a.slug === slug)!;

beforeAll(async () => {
  app = await buildApp({ logger: false });
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await app.close();
  await prisma.$disconnect();
});

describe('rules', () => {
  it('computes levels, xp and streaks', () => {
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(200).level).toBe(3);
    expect(xpForResult(100, 80, null, true)).toBe(80);
    expect(xpForResult(100, 90, 80, true)).toBe(10);
    expect(xpForResult(100, 50, null, false)).toBe(0);
    expect(labScore(10, 10, 2, true)).toBe(80);
    expect(streakFrom(['2026-10-01', '2026-09-30', '2026-09-28'], '2026-10-01')).toBe(2);
    expect(streakFrom(['2026-09-30'], '2026-10-01')).toBe(1);
  });
});

describe('auth & security', () => {
  it('rejects mutations without the CSRF header', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email, password: 'abcdefgh12', displayName: 'T' } });
    expect(r.statusCode).toBe(403);
    expect(r.json().error.code).toBe('CSRF');
  });

  it('validates registration input', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: H(), payload: { email: 'bad', password: 'short', displayName: 'T' } });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.details.length).toBeGreaterThan(0);
  });

  it('registers, sets an HttpOnly session cookie, and resolves /me', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: H(), payload: { email, password: 'Test-Password-1', displayName: 'Tester' } });
    expect(r.statusCode).toBe(201);
    const set = r.headers['set-cookie'] as string;
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=Lax/i);
    cookie = set.split(';')[0];
    const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } });
    expect(me.json().user.email).toBe(email);
    expect(me.json().user.passwordHash).toBeUndefined();
  });

  it('rejects wrong passwords and duplicate emails', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { 'x-nf-request': '1' }, payload: { email, password: 'nope-nope-1' } });
    expect(bad.statusCode).toBe(401);
    const dup = await app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: { 'x-nf-request': '1' }, payload: { email, password: 'Test-Password-1', displayName: 'Again' } });
    expect(dup.statusCode).toBe(409);
  });

  it('forbids admin routes for students', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/admin/analytics', headers: { cookie } });
    expect(r.statusCode).toBe(403);
  });
});

describe('learning flow', () => {
  it('locks modules until prerequisites are complete', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/curriculum', headers: { cookie } });
    const mods = r.json().tracks.flatMap((t: { modules: unknown[] }) => t.modules) as { slug: string; locked: boolean }[];
    expect(mods.find((m) => m.slug === 'orientation')!.locked).toBe(false);
    expect(mods.find((m) => m.slug === 'routing')!.locked).toBe(true);
    const lockedLesson = await app.inject({ method: 'GET', url: '/api/v1/activities/what-routers-do', headers: { cookie } });
    expect(lockedLesson.statusCode).toBe(403);
    expect(lockedLesson.json().error.code).toBe('LOCKED');
  });

  it('completes a lesson and awards XP once', async () => {
    const first = await app.inject({ method: 'POST', url: '/api/v1/activities/what-is-a-network/complete', headers: H(), payload: { durationSec: 300 } });
    expect(first.statusCode).toBe(200);
    expect(first.json().outcome.xpAwarded).toBeGreaterThan(0);
    expect(first.json().outcome.newAchievements.map((a: { slug: string }) => a.slug)).toContain('first-steps');
    const again = await app.inject({ method: 'POST', url: '/api/v1/activities/what-is-a-network/complete', headers: H(), payload: { durationSec: 10 } });
    expect(again.json().outcome.xpAwarded).toBe(0);
  });

  it('never sends quiz answers to the client and grades on the server', async () => {
    const get = await app.inject({ method: 'GET', url: '/api/v1/activities/orientation-checkpoint', headers: { cookie } });
    const json = get.body;
    expect(json).not.toMatch(/"answer"/);
    expect(json).not.toMatch(/explanation/);
    const quiz = activity('orientation-checkpoint').content as QuizContent;
    const answers = Object.fromEntries(quiz.questions.map((q) => [q.id, q.type === 'text' ? q.answer[0] : q.answer]));
    const wrong = await app.inject({ method: 'POST', url: '/api/v1/activities/orientation-checkpoint/attempts', headers: H(), payload: { answers: {}, durationSec: 60 } });
    expect(wrong.json().passed).toBe(false);
    expect(wrong.json().results[0].explanation).toBeTruthy();
    const right = await app.inject({ method: 'POST', url: '/api/v1/activities/orientation-checkpoint/attempts', headers: H(), payload: { answers, durationSec: 120 } });
    expect(right.json().score).toBe(100);
    expect(right.json().passed).toBe(true);
  });

  it('lets a learner test out of a module via its checkpoint quiz', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/curriculum', headers: { cookie } });
    const mods = r.json().tracks.flatMap((t: { modules: unknown[] }) => t.modules) as { slug: string; locked: boolean; complete: boolean; testedOut: boolean }[];
    const o = mods.find((m) => m.slug === 'orientation')!;
    expect(o.complete).toBe(true);
    expect(o.testedOut).toBe(true);
    expect(mods.find((m) => m.slug === 'network-fundamentals')!.locked).toBe(false);
  });

  it('validates labs on the server from the submitted topology', async () => {
    const lab = activity('first-network-lab').content as LabContent;
    const unsolved = buildNetwork(lab.spec);
    const fail = await app.inject({ method: 'POST', url: '/api/v1/activities/first-network-lab/attempts', headers: H(), payload: { network: unsolved, hintsUsed: 0, durationSec: 30 } });
    expect(fail.json().passed).toBe(false);
    expect(fail.json().debrief).toBeNull();

    const solved = buildNetwork(lab.spec);
    apply(solved, solutions['first-network-lab']);
    const ok = await app.inject({ method: 'POST', url: '/api/v1/activities/first-network-lab/attempts', headers: H(), payload: { network: solved, hintsUsed: 1, durationSec: 300 } });
    expect(ok.json().passed).toBe(true);
    expect(ok.json().score).toBe(90);
    expect(ok.json().debrief).toMatch(/You built a LAN/);
  });

  it('rejects tampered topologies', async () => {
    const lab = activity('first-network-lab').content as LabContent;
    const net = buildNetwork(lab.spec);
    const extra = await app.inject({ method: 'POST', url: '/api/v1/activities/first-network-lab/attempts', headers: H(), payload: { network: { ...net, devices: net.devices.slice(1) }, hintsUsed: 0 } });
    expect(extra.statusCode).toBe(422);
    const junk = await app.inject({ method: 'POST', url: '/api/v1/activities/first-network-lab/attempts', headers: H(), payload: { network: { version: 1, devices: 'x' } } });
    expect(junk.statusCode).toBe(422);
  });

  it('builds a dashboard from real progress', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/me/dashboard', headers: { cookie } });
    const d = r.json();
    expect(d.counts.lessons.done).toBe(1);
    expect(d.counts.quizzes.done).toBe(1);
    expect(d.counts.labs.done).toBe(1);
    expect(d.goal.doneToday).toBeGreaterThan(0);
    expect(d.streak).toBe(1);
    expect(d.plan.length).toBeGreaterThan(0);
    expect(d.skillMap.find((s: { slug: string }) => s.slug === 'net-basics').evidence).toBeGreaterThan(0);
  });

  it('saves and isolates topologies per user', async () => {
    const net = buildNetwork((activity('first-network-lab').content as LabContent).spec);
    const c = await app.inject({ method: 'POST', url: '/api/v1/me/topologies', headers: H(), payload: { name: 'My lab', data: net } });
    expect(c.statusCode).toBe(201);
    const id = c.json().topology.id;
    const anon = await app.inject({ method: 'GET', url: `/api/v1/me/topologies/${id}` });
    expect(anon.statusCode).toBe(401);
    const del = await app.inject({ method: 'DELETE', url: `/api/v1/me/topologies/${id}`, headers: H() });
    expect(del.statusCode).toBe(204);
  });
});
