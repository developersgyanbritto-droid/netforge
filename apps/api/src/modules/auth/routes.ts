import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db';
import { conflict, parse, unauthorized } from '../../lib/errors';
import { createSession, destroySession, publicUser, requireUser } from '../../lib/auth';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../../lib/password';

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z
    .string()
    .min(10, 'Use at least 10 characters')
    .max(200)
    .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), 'Include at least one letter and one number'),
  displayName: z.string().trim().min(2).max(60),
  experience: z.enum(['beginner', 'some', 'experienced']).default('beginner'),
  dailyGoalMinutes: z.number().int().min(10).max(240).default(30),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

export async function authRoutes(app: FastifyInstance) {
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.post('/auth/register', strict, async (req, reply) => {
    const body = parse(registerSchema, req.body);
    if (await prisma.user.findUnique({ where: { email: body.email } })) throw conflict('An account with this email already exists');
    const user = await prisma.user.create({
      data: {
        email: body.email,
        displayName: body.displayName,
        passwordHash: await hashPassword(body.password),
        experience: body.experience,
        dailyGoalMinutes: body.dailyGoalMinutes,
      },
    });
    await prisma.notification.create({
      data: { userId: user.id, type: 'welcome', title: 'Welcome to NetForge', body: 'Start with "What is a network?" — or take a checkpoint quiz to test out of modules you already know.' },
    });
    await createSession(reply, req, user.id);
    return reply.code(201).send({ user: publicUser(user) });
  });

  app.post('/auth/login', strict, async (req, reply) => {
    const body = parse(loginSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    const ok = await verifyPassword(body.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw unauthorized('Incorrect email or password');
    await createSession(reply, req, user.id);
    return { user: publicUser(user) };
  });

  app.post('/auth/logout', async (req, reply) => {
    requireUser(req);
    await destroySession(req, reply);
    return reply.code(204).send();
  });

  app.get('/auth/me', async (req) => ({ user: req.user ? publicUser(req.user) : null }));
}
