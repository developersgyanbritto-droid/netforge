// Idempotent seed: curriculum (from @netforge/content), skills, certification mapping,
// achievements and two accounts. Learner progress is never seeded.
import { PrismaClient } from '@prisma/client';
import { certDomains, modules, skills, tracks, validateCurriculum } from '@netforge/content';
import { hashPassword } from '../src/lib/password';
import { syncAchievements } from '../src/modules/progress/service';

const prisma = new PrismaClient();

async function main() {
  validateCurriculum();

  for (const t of tracks) {
    await prisma.track.upsert({ where: { slug: t.slug }, create: t, update: { title: t.title, description: t.description, kind: t.kind, order: t.order } });
  }
  for (const s of skills) {
    await prisma.skill.upsert({ where: { slug: s.slug }, create: s, update: { name: s.name, domain: s.domain, description: s.description } });
  }
  const skillIds = new Map((await prisma.skill.findMany()).map((s) => [s.slug, s.id]));

  for (const d of certDomains) {
    const row = await prisma.certDomain.upsert({
      where: { cert_code: { cert: d.cert, code: d.code } },
      create: { cert: d.cert, code: d.code, title: d.title },
      update: { title: d.title },
    });
    await prisma.skillCertDomain.deleteMany({ where: { certDomainId: row.id } });
    await prisma.skillCertDomain.createMany({ data: d.skills.map((s) => ({ skillId: skillIds.get(s)!, certDomainId: row.id })) });
  }

  const trackIds = new Map((await prisma.track.findMany()).map((t) => [t.slug, t.id]));
  let order = 0;
  for (const m of modules) {
    const data = { trackId: trackIds.get(m.track)!, title: m.title, summary: m.summary, level: m.level, order: order++ };
    await prisma.module.upsert({ where: { slug: m.slug }, create: { slug: m.slug, ...data }, update: data });
  }
  const moduleIds = new Map((await prisma.module.findMany()).map((m) => [m.slug, m.id]));
  for (const m of modules) {
    const id = moduleIds.get(m.slug)!;
    await prisma.modulePrerequisite.deleteMany({ where: { moduleId: id } });
    await prisma.modulePrerequisite.createMany({ data: m.prerequisites.map((p) => ({ moduleId: id, requiresId: moduleIds.get(p)! })) });

    for (const [i, a] of m.activities.entries()) {
      const data = {
        moduleId: id,
        type: a.type,
        title: a.title,
        summary: a.summary,
        order: (i + 1) * 10,
        estMinutes: a.estMinutes,
        difficulty: a.difficulty ?? 1,
        xp: a.xp ?? 20,
        content: a.content as object,
      };
      const row = await prisma.activity.upsert({ where: { slug: a.slug }, create: { slug: a.slug, ...data }, update: data });
      await prisma.activitySkill.deleteMany({ where: { activityId: row.id } });
      await prisma.activitySkill.createMany({
        data: a.skills.map((s) => {
          const [slug, weight] = Array.isArray(s) ? s : [s, 1];
          return { activityId: row.id, skillId: skillIds.get(slug)!, weight };
        }),
      });
    }
  }

  await syncAchievements();

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@netforge.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe-Admin-2026';
  await prisma.user.upsert({
    where: { email: adminEmail },
    create: { email: adminEmail, displayName: 'Platform Admin', role: 'ADMIN', passwordHash: await hashPassword(adminPassword) },
    update: { role: 'ADMIN' },
  });
  await prisma.user.upsert({
    where: { email: 'student@netforge.local' },
    create: { email: 'student@netforge.local', displayName: 'Demo Student', passwordHash: await hashPassword('Student-Demo-2026') },
    update: {},
  });

  const counts = await prisma.activity.groupBy({ by: ['type'], _count: true });
  console.log(`Seeded ${modules.length} modules:`, Object.fromEntries(counts.map((c) => [c.type, c._count])));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
