// Reference solutions used only by tests to prove every lab is solvable.
import type { DeviceKind, Network } from '@netforge/sim-engine';
import { addDevice, connect, parseCidr, runIos, setGateway, setIfaceIp } from '@netforge/sim-engine';

export type Step =
  | { cli: string; lines: string[] }
  | { host: string; ip: string; gateway?: string }
  | { add: DeviceKind; id: string }
  | { connect: [string, string, string?, string?] };

export function apply(net: Network, steps: Step[]): void {
  for (const s of steps) {
    if ('cli' in s) {
      const session = { deviceId: s.cli, mode: 'user' as const };
      for (const line of ['enable', 'configure terminal', ...s.lines]) {
        const out = runIos(net, session as never, line).output;
        if (/^% /m.test(out) && !/Creating vlan/.test(out)) throw new Error(`${s.cli}: "${line}" → ${out}`);
      }
    } else if ('host' in s) {
      const c = parseCidr(s.ip)!;
      setIfaceIp(net, s.host, 'Fa0', c.ip, c.prefix);
      setGateway(net, s.host, s.gateway ?? null);
    } else if ('add' in s) {
      addDevice(net, s.add, { id: s.id });
    } else {
      const [a, b, ai, bi] = s.connect;
      connect(net, a, b, ai, bi);
    }
  }
}

const ifUp = (name: string, ip: string, mask: string) => [`interface ${name}`, `ip address ${ip} ${mask}`, 'no shutdown'];

export const solutions: Record<string, Step[]> = {
  'first-network-lab': [
    { connect: ['pc1', 'sw1'] },
    { connect: ['pc2', 'sw1'] },
    { host: 'pc1', ip: '192.168.10.10/24' },
    { host: 'pc2', ip: '192.168.10.11/24' },
  ],
  'first-packet-lab': [{ host: 'pc3', ip: '192.168.1.20/24', gateway: '192.168.1.1' }],
  'switch-expansion-lab': [
    { add: 'laptop', id: 'new1' },
    { connect: ['new1', 'sw1'] },
    { host: 'new1', ip: '192.168.1.20/24' },
  ],
  'duplicate-ip-challenge': [{ host: 'pc3', ip: '192.168.1.12/24' }],
  'ipv4-host-config-lab': [
    { host: 'pc1', ip: '192.168.1.10/24', gateway: '192.168.1.1' },
    { host: 'pc2', ip: '192.168.1.11/24', gateway: '192.168.1.1' },
    { host: 'pc3', ip: '192.168.2.10/24', gateway: '192.168.2.1' },
    { host: 'srv1', ip: '192.168.2.100/24', gateway: '192.168.2.1' },
  ],
  'wrong-gateway-challenge': [{ host: 'pc1', ip: '192.168.1.10/24', gateway: '192.168.1.1' }],
  'office-addressing-lab': [
    { cli: 'r1', lines: [...ifUp('g0/0', '192.168.50.1', '255.255.255.192'), ...ifUp('g0/1', '192.168.50.65', '255.255.255.192'), ...ifUp('g0/2', '192.168.50.129', '255.255.255.192')] },
    { host: 'pc1', ip: '192.168.50.10/26', gateway: '192.168.50.1' },
    { host: 'pc2', ip: '192.168.50.70/26', gateway: '192.168.50.65' },
    { host: 'srv1', ip: '192.168.50.130/26', gateway: '192.168.50.129' },
  ],
  'router-basics-lab': [{ cli: 'r1', lines: [...ifUp('g0/0', '192.168.1.1', '255.255.255.0'), ...ifUp('gigabitethernet 0/1', '192.168.2.1', '255.255.255.0')] }],
  'static-routing-lab': [
    { cli: 'r1', lines: ['ip route 10.2.2.0 255.255.255.0 172.16.12.2'] },
    { cli: 'r2', lines: ['ip route 0.0.0.0 0.0.0.0 172.16.12.1'] },
  ],
  'default-route-lab': [
    { cli: 'r1', lines: ['ip route 0.0.0.0 0.0.0.0 172.16.12.2'] },
    { cli: 'r3', lines: ['ip route 0.0.0.0 0.0.0.0 172.16.23.1'] },
  ],
  'missing-route-challenge': [{ cli: 'r2', lines: ['no ip route 10.1.1.0 255.255.255.0', 'ip route 10.1.1.0 255.255.255.0 172.16.12.1'] }],
  'vlan-config-lab': [
    {
      cli: 'sw1',
      lines: ['vlan 10', 'name SALES', 'vlan 20', 'name ENG', 'exit', 'int fa0/1', 'switchport access vlan 10', 'int fa0/2', 'switchport access vlan 10', 'int fa0/11', 'switchport access vlan 20', 'int fa0/12', 'sw acc vl 20'],
    },
  ],
  'trunk-lab': [
    { cli: 'sw1', lines: ['interface g0/1', 'switchport mode trunk'] },
    { cli: 'sw2', lines: ['interface g0/1', 'switchport mode trunk'] },
  ],
  'vlan-missing-challenge': [{ cli: 'sw2', lines: ['vlan 20', 'name ENG'] }],
  'roas-lab': [
    { cli: 'sw1', lines: ['interface g0/2', 'switchport mode trunk'] },
    { cli: 'r1', lines: ['interface g0/0', 'no shutdown', 'interface g0/0.10', 'encapsulation dot1Q 10', 'ip address 10.10.0.1 255.255.255.0', 'interface g0/0.20', 'encapsulation dot1Q 20', 'ip address 10.20.0.1 255.255.255.0'] },
  ],
  'roas-troubleshoot': [{ cli: 'r1', lines: ['interface g0/0.20', 'encapsulation dot1Q 20'] }],
  'guest-isolation-lab': [{ cli: 'sw1', lines: ['vlan 30', 'name GUEST', 'interface fa0/10', 'switchport access vlan 30'] }],
  'interface-down-challenge': [{ cli: 'r1', lines: ['interface g0/1', 'no shutdown'] }],
  'multi-fault-challenge': [
    { host: 'pc2', ip: '10.2.2.10/24', gateway: '10.2.2.1' },
    { cli: 'r1', lines: ['interface g0/1', 'no shutdown'] },
  ],
  'home-network-project': [
    { add: 'switch', id: 'hsw' },
    { add: 'pc', id: 'h1' },
    { add: 'pc', id: 'h2' },
    { add: 'laptop', id: 'h3' },
    { add: 'server', id: 'nas' },
    { connect: ['r1', 'hsw', 'Gi0/0', 'Gi0/1'] },
    { connect: ['h1', 'hsw'] },
    { connect: ['h2', 'hsw'] },
    { connect: ['h3', 'hsw'] },
    { connect: ['nas', 'hsw'] },
    { cli: 'r1', lines: ifUp('g0/0', '192.168.0.1', '255.255.255.0') },
    { host: 'h1', ip: '192.168.0.10/24', gateway: '192.168.0.1' },
    { host: 'h2', ip: '192.168.0.11/24', gateway: '192.168.0.1' },
    { host: 'h3', ip: '192.168.0.12/24', gateway: '192.168.0.1' },
    { host: 'nas', ip: '192.168.0.50/24', gateway: '192.168.0.1' },
  ],
  'office-vlan-project': [
    {
      cli: 'sw1',
      lines: ['vlan 10', 'name STAFF', 'vlan 30', 'name GUEST', 'vlan 40', 'name SERVERS', 'int fa0/1', 'sw acc vlan 10', 'int fa0/2', 'sw acc vlan 10', 'int fa0/10', 'sw acc vlan 30', 'int fa0/20', 'sw acc vlan 40', 'int g0/1', 'switchport mode trunk'],
    },
    {
      cli: 'r1',
      lines: ['int g0/0', 'no shut', 'int g0/0.10', 'encap dot1q 10', 'ip add 10.10.10.1 255.255.255.0', 'int g0/0.30', 'encap dot1q 30', 'ip add 10.30.30.1 255.255.255.0', 'int g0/0.40', 'encap dot1q 40', 'ip add 10.40.40.1 255.255.255.0'],
    },
    { host: 'pc1', ip: '10.10.10.11/24', gateway: '10.10.10.1' },
    { host: 'pc2', ip: '10.10.10.12/24', gateway: '10.10.10.1' },
    { host: 'lap1', ip: '10.30.30.11/24', gateway: '10.30.30.1' },
    { host: 'srv1', ip: '10.40.40.10/24', gateway: '10.40.40.1' },
  ],
  'branch-routing-project': [
    { cli: 'r1', lines: [...ifUp('g0/0', '10.0.0.1', '255.255.255.0'), ...ifUp('g0/1', '172.16.1.1', '255.255.255.252'), ...ifUp('g0/2', '172.16.2.1', '255.255.255.252'), 'exit', 'ip route 10.1.0.0 255.255.255.0 172.16.1.2', 'ip route 10.2.0.0 255.255.255.0 172.16.2.2'] },
    { cli: 'r2', lines: [...ifUp('g0/0', '10.1.0.1', '255.255.255.0'), ...ifUp('g0/1', '172.16.1.2', '255.255.255.252'), 'exit', 'ip route 0.0.0.0 0.0.0.0 172.16.1.1'] },
    { cli: 'r3', lines: [...ifUp('g0/0', '10.2.0.1', '255.255.255.0'), ...ifUp('g0/1', '172.16.2.2', '255.255.255.252'), 'exit', 'ip route 0.0.0.0 0.0.0.0 172.16.2.1'] },
  ],
};
