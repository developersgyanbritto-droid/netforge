import { buildApp } from './app';
import { config } from './config';
import { prisma } from './db';
import { syncAchievements } from './modules/progress/service';

const app = await buildApp();
await syncAchievements();
await app.listen({ port: config.port, host: config.host });
app.log.warn(`NetForge API listening on http://${config.host}:${config.port}/api/v1`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  });
}
