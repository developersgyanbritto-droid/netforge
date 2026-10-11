import { buildNetwork } from '@netforge/sim-engine';
import { parseContent, type ModuleDef } from './schema';
import { orientation, fundamentals, osiTcpip } from './modules/foundations';
import { switching, ipv4, subnetting } from './modules/addressing';
import { routing, vlans, interVlan } from './modules/routing-switching';
import { services, security, troubleshooting, projects, mikrotik } from './modules/advanced';

export * from './schema';
export * from './meta';

export const modules: ModuleDef[] = [
  orientation,
  fundamentals,
  osiTcpip,
  switching,
  ipv4,
  subnetting,
  routing,
  vlans,
  interVlan,
  services,
  security,
  troubleshooting,
  projects,
  mikrotik,
];

/** Throws with a readable list of problems if the curriculum is inconsistent. */
export function validateCurriculum(mods: ModuleDef[] = modules): void {
  const problems: string[] = [];
  const moduleSlugs = new Set(mods.map((m) => m.slug));
  const activitySlugs = new Set<string>();
  for (const m of mods) {
    for (const p of m.prerequisites) if (!moduleSlugs.has(p)) problems.push(`${m.slug}: unknown prerequisite ${p}`);
    for (const a of m.activities) {
      if (activitySlugs.has(a.slug)) problems.push(`duplicate activity slug ${a.slug}`);
      activitySlugs.add(a.slug);
      const parsed = parseContent(a.type, a.content);
      if (!parsed.success) {
        problems.push(`${a.slug}: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
        continue;
      }
      const c = parsed.data as { spec?: Parameters<typeof buildNetwork>[0]; blocks?: { type: string; spec?: Parameters<typeof buildNetwork>[0] }[] };
      try {
        if (c.spec) buildNetwork(c.spec);
        for (const b of c.blocks ?? []) if (b.type === 'topology' && b.spec) buildNetwork(b.spec);
      } catch (e) {
        problems.push(`${a.slug}: topology error ${(e as Error).message}`);
      }
    }
  }
  if (problems.length) throw new Error(`Curriculum validation failed:\n- ${problems.join('\n- ')}`);
}
