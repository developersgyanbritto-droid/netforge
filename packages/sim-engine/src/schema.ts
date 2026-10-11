// Runtime validation for Network documents coming from untrusted clients.
import { z } from 'zod';

const ipStr = z.string().max(15).regex(/^\d{1,3}(\.\d{1,3}){3}$/);
const name = z.string().min(1).max(40);
const mac = z.string().regex(/^[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}$/);

export const LIMITS = { devices: 80, links: 200, interfacesPerDevice: 64, routes: 50, vlans: 64 } as const;

export const networkSchema = z.object({
  version: z.literal(1),
  macCounter: z.number().int().min(0).max(0xffffff),
  idCounter: z.number().int().min(0).max(1_000_000),
  devices: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        name,
        kind: z.enum(['pc', 'laptop', 'server', 'switch', 'router']),
        x: z.number().finite(),
        y: z.number().finite(),
        gateway: ipStr.optional(),
        interfaces: z
          .array(
            z.object({
              name: z.string().min(2).max(20),
              mac,
              adminUp: z.boolean(),
              description: z.string().max(80).optional(),
              ip: ipStr.optional(),
              prefix: z.number().int().min(0).max(32).optional(),
              parent: z.string().max(20).optional(),
              dot1q: z.number().int().min(1).max(4094).optional(),
              switchport: z
                .object({
                  mode: z.enum(['access', 'trunk']),
                  accessVlan: z.number().int().min(1).max(4094),
                  allowedVlans: z.union([z.literal('all'), z.array(z.number().int().min(1).max(4094)).max(4094)]),
                  nativeVlan: z.number().int().min(1).max(4094),
                })
                .optional(),
            }),
          )
          .max(LIMITS.interfacesPerDevice),
        staticRoutes: z
          .array(z.object({ network: ipStr, prefix: z.number().int().min(0).max(32), nextHop: ipStr.optional(), exitIface: z.string().max(20).optional() }))
          .max(LIMITS.routes)
          .optional(),
        vlans: z.array(z.object({ id: z.number().int().min(1).max(4094), name: z.string().max(32) })).max(LIMITS.vlans).optional(),
        arp: z.array(z.object({ ip: ipStr, mac, iface: z.string().max(20) })).max(256).optional(),
        macTable: z.array(z.object({ mac, vlan: z.number().int(), port: z.string().max(20) })).max(1024).optional(),
      }),
    )
    .max(LIMITS.devices),
  links: z
    .array(
      z.object({
        id: z.string().max(40),
        a: z.object({ device: z.string().max(40), iface: z.string().max(20) }),
        b: z.object({ device: z.string().max(40), iface: z.string().max(20) }),
      }),
    )
    .max(LIMITS.links),
});

export type NetworkInput = z.infer<typeof networkSchema>;

/** Referential integrity checks the Zod schema cannot express. */
export function checkNetworkIntegrity(net: NetworkInput): string | null {
  const ids = new Set<string>();
  for (const d of net.devices) {
    if (ids.has(d.id)) return `Duplicate device id ${d.id}`;
    ids.add(d.id);
  }
  const used = new Set<string>();
  for (const l of net.links) {
    for (const end of [l.a, l.b]) {
      const d = net.devices.find((x) => x.id === end.device);
      if (!d) return `Link ${l.id} references unknown device`;
      if (!d.interfaces.some((i) => i.name === end.iface && !i.parent)) return `Link ${l.id} references unknown interface`;
      const key = `${end.device}|${end.iface}`;
      if (used.has(key)) return `Interface ${end.iface} is used by more than one link`;
      used.add(key);
    }
  }
  return null;
}
