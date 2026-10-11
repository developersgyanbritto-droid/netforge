import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Role } from '@prisma/client';
import { prisma } from '../db';
import { config } from '../config';
import { forbidden, unauthorized } from './errors';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  xp: number;
  dailyGoalMinutes: number;
  experience: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
    sessionId: string | null;
  }
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export const publicUser = (u: SessionUser) => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  role: u.role,
  xp: u.xp,
  dailyGoalMinutes: u.dailyGoalMinutes,
  experience: u.experience,
});

export async function createSession(reply: FastifyReply, req: FastifyRequest, userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.sessionDays * 86400_000);
  await prisma.session.create({
    data: { tokenHash: sha256(token), userId, expiresAt, ip: req.ip, userAgent: req.headers['user-agent']?.slice(0, 255) },
  });
  reply.setCookie(config.sessionCookie, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    path: '/',
    expires: expiresAt,
  });
}

export async function destroySession(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (req.sessionId) await prisma.session.deleteMany({ where: { id: req.sessionId } });
  reply.clearCookie(config.sessionCookie, { path: '/' });
}

/** Resolves the session cookie on every request; sliding expiry refreshed at most daily. */
export function registerAuth(app: FastifyInstance): void {
  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);
  app.addHook('onRequest', async (req) => {
    const token = req.cookies[config.sessionCookie];
    if (!token || token.length > 100) return;
    const session = await prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: { select: { id: true, email: true, displayName: true, role: true, xp: true, dailyGoalMinutes: true, experience: true } } },
    });
    if (!session || session.expiresAt < new Date()) return;
    req.user = session.user;
    req.sessionId = session.id;
    const remaining = session.expiresAt.getTime() - Date.now();
    if (remaining < (config.sessionDays - 1) * 86400_000) {
      await prisma.session.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() + config.sessionDays * 86400_000) } });
    }
  });
}

export function requireUser(req: FastifyRequest): SessionUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function requireRole(req: FastifyRequest, ...roles: Role[]): SessionUser {
  const u = requireUser(req);
  if (!roles.includes(u.role)) throw forbidden();
  return u;
}

/**
 * CSRF defence for cookie-authenticated mutations: require a custom header (cannot be sent
 * cross-site without a CORS preflight, which this API never grants) and, when present,
 * an allowed Origin.
 */
export function registerCsrf(app: FastifyInstance): void {
  app.addHook('onRequest', async (req) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
    if (req.headers['x-nf-request'] !== '1') throw forbidden('Missing request header', 'CSRF');
    const origin = req.headers.origin;
    if (origin && !config.appOrigins.includes(origin)) throw forbidden('Origin not allowed', 'CSRF');
  });
}
