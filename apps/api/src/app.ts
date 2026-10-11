import Fastify, { type FastifyError } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { Prisma } from '@prisma/client';
import { AppError } from './lib/errors';
import { registerAuth, registerCsrf } from './lib/auth';
import { config } from './config';
import { authRoutes } from './modules/auth/routes';
import { learningRoutes } from './modules/learning/routes';
import { meRoutes } from './modules/me/routes';
import { adminRoutes } from './modules/admin/routes';

export async function buildApp(opts: { logger?: boolean } = {}) {
  const app = Fastify({
    logger: opts.logger ?? { level: config.isProd ? 'info' : 'warn' },
    bodyLimit: 1_000_000,
    trustProxy: true,
  });

  await app.register(helmet, { contentSecurityPolicy: false }); // JSON API; CSP is set by the web app
  await app.register(cookie);
  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });

  app.setErrorHandler((err: FastifyError | AppError | Error, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.status).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    const fe = err as FastifyError;
    if (fe.statusCode === 429) return reply.code(429).send({ error: { code: 'RATE_LIMITED', message: 'Too many requests — please slow down.' } });
    if (fe.validation || fe.statusCode === 400) return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: fe.message } });
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
      return reply.code(409).send({ error: { code: 'CONFLICT', message: 'That value is already in use' } });
    req.log.error(err);
    return reply.code(500).send({ error: { code: 'INTERNAL', message: 'Something went wrong on our side.' } });
  });
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found' } }));

  await app.register(
    async (api) => {
      registerAuth(api);
      registerCsrf(api);
      api.get('/health', async () => ({ ok: true }));
      await api.register(authRoutes);
      await api.register(learningRoutes);
      await api.register(meRoutes);
      await api.register(adminRoutes);
    },
    { prefix: '/api/v1' },
  );
  return app;
}
