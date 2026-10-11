import type { TopologySpec } from '@netforge/sim-engine';

/** PC — cable — PC */
export const twoPcs: TopologySpec = {
  devices: [
    { id: 'pc1', kind: 'pc', x: 120, y: 160, ip: '192.168.1.10/24' },
    { id: 'pc2', kind: 'pc', x: 460, y: 160, ip: '192.168.1.11/24' },
  ],
  links: [['pc1', 'Fa0', 'pc2', 'Fa0']],
};

/** A small LAN: 3 PCs + server on one switch. */
export const smallLan: TopologySpec = {
  devices: [
    { id: 'pc1', kind: 'pc', x: 60, y: 280, ip: '192.168.1.10/24', gateway: '192.168.1.1' },
    { id: 'pc2', kind: 'pc', x: 230, y: 280, ip: '192.168.1.11/24', gateway: '192.168.1.1' },
    { id: 'lap1', kind: 'laptop', x: 400, y: 280, ip: '192.168.1.12/24', gateway: '192.168.1.1' },
    { id: 'srv1', kind: 'server', x: 560, y: 120, ip: '192.168.1.100/24', gateway: '192.168.1.1' },
    { id: 'sw1', kind: 'switch', x: 260, y: 110 },
  ],
  links: [
    ['pc1', 'Fa0', 'sw1', 'Fa0/1'],
    ['pc2', 'Fa0', 'sw1', 'Fa0/2'],
    ['lap1', 'Fa0', 'sw1', 'Fa0/3'],
    ['srv1', 'Fa0', 'sw1', 'Fa0/24'],
  ],
};

/** Two LANs joined by a router. */
export function twoLans(opts: { routerUp?: boolean; routerIps?: boolean; hostIps?: boolean } = {}): TopologySpec {
  const { routerUp = true, routerIps = true, hostIps = true } = opts;
  return {
    devices: [
      { id: 'pc1', kind: 'pc', x: 40, y: 300, ...(hostIps ? { ip: '192.168.1.10/24', gateway: '192.168.1.1' } : {}) },
      { id: 'pc2', kind: 'pc', x: 200, y: 300, ...(hostIps ? { ip: '192.168.1.11/24', gateway: '192.168.1.1' } : {}) },
      { id: 'pc3', kind: 'pc', x: 420, y: 300, ...(hostIps ? { ip: '192.168.2.10/24', gateway: '192.168.2.1' } : {}) },
      { id: 'srv1', kind: 'server', x: 580, y: 300, ...(hostIps ? { ip: '192.168.2.100/24', gateway: '192.168.2.1' } : {}) },
      { id: 'sw1', kind: 'switch', x: 120, y: 170 },
      { id: 'sw2', kind: 'switch', x: 500, y: 170 },
      {
        id: 'r1',
        kind: 'router',
        x: 310,
        y: 40,
        interfaces: {
          'Gi0/0': { ...(routerIps ? { ip: '192.168.1.1/24' } : {}), up: routerUp },
          'Gi0/1': { ...(routerIps ? { ip: '192.168.2.1/24' } : {}), up: routerUp },
        },
      },
    ],
    links: [
      ['pc1', 'Fa0', 'sw1', 'Fa0/1'],
      ['pc2', 'Fa0', 'sw1', 'Fa0/2'],
      ['sw1', 'Gi0/1', 'r1', 'Gi0/0'],
      ['pc3', 'Fa0', 'sw2', 'Fa0/1'],
      ['srv1', 'Fa0', 'sw2', 'Fa0/2'],
      ['sw2', 'Gi0/1', 'r1', 'Gi0/1'],
    ],
  };
}

/** HQ and Branch routers connected by a /30 point-to-point link. */
export function twoSites(opts: { r1Routes?: string[]; r2Routes?: string[] } = {}): TopologySpec {
  return {
    devices: [
      { id: 'pc1', kind: 'pc', name: 'HQ-PC', x: 40, y: 280, ip: '10.1.1.10/24', gateway: '10.1.1.1' },
      { id: 'sw1', kind: 'switch', name: 'HQ-SW', x: 40, y: 150 },
      { id: 'r1', kind: 'router', name: 'HQ-R', x: 200, y: 40, interfaces: { 'Gi0/0': { ip: '10.1.1.1/24', up: true }, 'Gi0/1': { ip: '172.16.12.1/30', up: true } }, routes: opts.r1Routes ?? [] },
      { id: 'r2', kind: 'router', name: 'Branch-R', x: 440, y: 40, interfaces: { 'Gi0/0': { ip: '10.2.2.1/24', up: true }, 'Gi0/1': { ip: '172.16.12.2/30', up: true } }, routes: opts.r2Routes ?? [] },
      { id: 'sw2', kind: 'switch', name: 'Branch-SW', x: 600, y: 150 },
      { id: 'pc2', kind: 'pc', name: 'Branch-PC', x: 600, y: 280, ip: '10.2.2.10/24', gateway: '10.2.2.1' },
    ],
    links: [
      ['pc1', 'Fa0', 'sw1', 'Fa0/1'],
      ['sw1', 'Gi0/1', 'r1', 'Gi0/0'],
      ['r1', 'Gi0/1', 'r2', 'Gi0/1'],
      ['r2', 'Gi0/0', 'sw2', 'Gi0/1'],
      ['sw2', 'Fa0/1', 'pc2', 'Fa0'],
    ],
  };
}
