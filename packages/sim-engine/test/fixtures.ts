import type { TopologySpec } from '../src';

export const lanSpec: TopologySpec = {
  devices: [
    { id: 'pc1', kind: 'pc', x: 0, y: 0, ip: '192.168.1.10/24', gateway: '192.168.1.1' },
    { id: 'pc2', kind: 'pc', x: 0, y: 0, ip: '192.168.1.11/24', gateway: '192.168.1.1' },
    { id: 'pc3', kind: 'pc', x: 0, y: 0, ip: '192.168.1.12/24', gateway: '192.168.1.1' },
    { id: 'sw1', kind: 'switch', x: 0, y: 0 },
  ],
  links: [
    ['pc1', 'Fa0', 'sw1', 'Fa0/1'],
    ['pc2', 'Fa0', 'sw1', 'Fa0/2'],
    ['pc3', 'Fa0', 'sw1', 'Fa0/3'],
  ],
};

/** Two LANs joined by one router. `up` controls whether router interfaces are enabled. */
export function twoLans(up = true): TopologySpec {
  return {
    devices: [
      { id: 'pc1', kind: 'pc', x: 0, y: 0, ip: '192.168.1.10/24', gateway: '192.168.1.1' },
      { id: 'pc2', kind: 'pc', x: 0, y: 0, ip: '192.168.2.10/24', gateway: '192.168.2.1' },
      { id: 'sw1', kind: 'switch', x: 0, y: 0 },
      { id: 'sw2', kind: 'switch', x: 0, y: 0 },
      {
        id: 'r1',
        kind: 'router',
        x: 0,
        y: 0,
        interfaces: { 'Gi0/0': { ip: '192.168.1.1/24', up }, 'Gi0/1': { ip: '192.168.2.1/24', up } },
      },
    ],
    links: [
      ['pc1', 'Fa0', 'sw1', 'Fa0/1'],
      ['sw1', 'Gi0/1', 'r1', 'Gi0/0'],
      ['pc2', 'Fa0', 'sw2', 'Fa0/1'],
      ['sw2', 'Gi0/1', 'r1', 'Gi0/1'],
    ],
  };
}

/** Two routers, three networks; static routes optional. */
export function twoRouters(withRoutes: boolean): TopologySpec {
  return {
    devices: [
      { id: 'pc1', kind: 'pc', x: 0, y: 0, ip: '10.1.0.10/24', gateway: '10.1.0.1' },
      { id: 'pc2', kind: 'pc', x: 0, y: 0, ip: '10.2.0.10/24', gateway: '10.2.0.1' },
      {
        id: 'r1',
        kind: 'router',
        x: 0,
        y: 0,
        interfaces: { 'Gi0/0': { ip: '10.1.0.1/24', up: true }, 'Gi0/1': { ip: '172.16.0.1/30', up: true } },
        routes: withRoutes ? ['10.2.0.0/24 via 172.16.0.2'] : [],
      },
      {
        id: 'r2',
        kind: 'router',
        x: 0,
        y: 0,
        interfaces: { 'Gi0/0': { ip: '10.2.0.1/24', up: true }, 'Gi0/1': { ip: '172.16.0.2/30', up: true } },
        routes: withRoutes ? ['0.0.0.0/0 via 172.16.0.1'] : [],
      },
    ],
    links: [
      ['pc1', 'Fa0', 'r1', 'Gi0/0'],
      ['r1', 'Gi0/1', 'r2', 'Gi0/1'],
      ['pc2', 'Fa0', 'r2', 'Gi0/0'],
    ],
  };
}

/** Two switches with VLAN 10/20, trunk between them, router-on-a-stick on SW1. */
export function vlanOffice(opts: { trunk?: boolean; vlan20OnSw2?: boolean; router?: boolean } = {}): TopologySpec {
  const { trunk = true, vlan20OnSw2 = true, router = true } = opts;
  return {
    devices: [
      { id: 'pcA', kind: 'pc', x: 0, y: 0, ip: '10.10.0.10/24', gateway: '10.10.0.1' },
      { id: 'pcB', kind: 'pc', x: 0, y: 0, ip: '10.20.0.10/24', gateway: '10.20.0.1' },
      { id: 'pcC', kind: 'pc', x: 0, y: 0, ip: '10.10.0.11/24', gateway: '10.10.0.1' },
      { id: 'pcD', kind: 'pc', x: 0, y: 0, ip: '10.20.0.11/24', gateway: '10.20.0.1' },
      {
        id: 'sw1',
        kind: 'switch',
        x: 0,
        y: 0,
        vlans: { '10': 'SALES', '20': 'ENG' },
        interfaces: {
          'Fa0/1': { vlan: 10 },
          'Fa0/2': { vlan: 20 },
          'Gi0/1': trunk ? { mode: 'trunk' } : {},
          'Gi0/2': { mode: 'trunk' },
        },
      },
      {
        id: 'sw2',
        kind: 'switch',
        x: 0,
        y: 0,
        vlans: vlan20OnSw2 ? { '10': 'SALES', '20': 'ENG' } : { '10': 'SALES' },
        interfaces: { 'Fa0/1': { vlan: 10 }, 'Fa0/2': { vlan: 20 }, 'Gi0/1': trunk ? { mode: 'trunk' } : {} },
      },
      ...(router
        ? [
            {
              id: 'r1',
              kind: 'router' as const,
              x: 0,
              y: 0,
              interfaces: {
                'Gi0/0': { up: true },
                'Gi0/0.10': { ip: '10.10.0.1/24' },
                'Gi0/0.20': { ip: '10.20.0.1/24' },
              },
            },
          ]
        : []),
    ],
    links: [
      ['pcA', 'Fa0', 'sw1', 'Fa0/1'],
      ['pcB', 'Fa0', 'sw1', 'Fa0/2'],
      ['pcC', 'Fa0', 'sw2', 'Fa0/1'],
      ['pcD', 'Fa0', 'sw2', 'Fa0/2'],
      ['sw1', 'Gi0/1', 'sw2', 'Gi0/1'],
      ...(router ? ([['sw1', 'Gi0/2', 'r1', 'Gi0/0']] as [string, string, string, string][]) : []),
    ],
  };
}
