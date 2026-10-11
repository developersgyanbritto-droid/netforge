import { describe, expect, it } from 'vitest';
import {
  addDevice,
  buildNetwork,
  buildRoutingTable,
  classifyIp,
  connect,
  createNetwork,
  diagnose,
  getDevice,
  maskToPrefix,
  ping,
  prefixForHosts,
  setGateway,
  setIfaceIp,
  splitSubnet,
  subnetInfo,
  traceroute,
  validateLab,
  vlsm,
  generateSubnetQuestions,
  gradeSubnetAnswers,
  networkSchema,
  checkNetworkIntegrity,
} from '../src';
import { lanSpec, twoLans, twoRouters, vlanOffice } from './fixtures';

describe('IPv4 math', () => {
  it('computes subnet details', () => {
    const s = subnetInfo('172.16.45.200', 20);
    expect(s.network).toBe('172.16.32.0');
    expect(s.broadcast).toBe('172.16.47.255');
    expect(s.firstHost).toBe('172.16.32.1');
    expect(s.lastHost).toBe('172.16.47.254');
    expect(s.usableHosts).toBe(4094);
    expect(s.mask).toBe('255.255.240.0');
    expect(s.wildcard).toBe('0.0.15.255');
  });
  it('validates masks', () => {
    expect(maskToPrefix('255.255.255.192')).toBe(26);
    expect(maskToPrefix('255.0.255.0')).toBeNull();
    expect(maskToPrefix('0.0.0.0')).toBe(0);
  });
  it('classifies addresses', () => {
    expect(classifyIp('10.1.2.3')).toBe('private');
    expect(classifyIp('172.31.0.1')).toBe('private');
    expect(classifyIp('172.32.0.1')).toBe('public');
    expect(classifyIp('169.254.10.1')).toBe('apipa');
    expect(classifyIp('127.0.0.1')).toBe('loopback');
  });
  it('splits and allocates with VLSM', () => {
    expect(splitSubnet('192.168.0.0', 24, 26).map((s) => s.network)).toEqual(['192.168.0.0', '192.168.0.64', '192.168.0.128', '192.168.0.192']);
    expect(prefixForHosts(50)).toBe(26);
    const a = vlsm('192.168.10.0', 24, [
      { name: 'Guests', hosts: 20 },
      { name: 'Staff', hosts: 100 },
      { name: 'Link', hosts: 2 },
    ]);
    expect(a.map((x) => `${x.name} ${x.network}/${x.prefix}`)).toEqual(['Staff 192.168.10.0/25', 'Guests 192.168.10.128/27', 'Link 192.168.10.160/30']);
    expect(() => vlsm('192.168.10.0', 26, [{ name: 'Big', hosts: 100 }])).toThrow();
  });
});

describe('Layer 2 switching', () => {
  it('delivers ping on a flat LAN and learns ARP + MAC tables', () => {
    const net = buildNetwork(lanSpec);
    const out = ping(net, 'pc1', '192.168.1.11', { count: 2 });
    expect(out.results.map((r) => r.status)).toEqual(['success', 'success']);
    const sw = getDevice(net, 'sw1');
    expect(sw.macTable!.map((e) => e.port).sort()).toEqual(['Fa0/1', 'Fa0/2']);
    expect(getDevice(net, 'pc1').arp!.map((e) => e.ip)).toEqual(['192.168.1.11']);
    // the first ARP request is a broadcast that reaches PC3 too
    expect(out.events.some((e) => e.kind === 'flood')).toBe(true);
    expect(out.events.some((e) => e.kind === 'info' && e.deviceId === 'pc3')).toBe(true);
    // second echo uses known unicast forwarding
    expect(out.events.some((e) => e.kind === 'forward')).toBe(true);
  });

  it('times out for a non-existent host and explains the ARP failure', () => {
    const net = buildNetwork(lanSpec);
    const out = ping(net, 'pc1', '192.168.1.99', { count: 1 });
    expect(out.results[0].status).toBe('timeout');
    expect(out.results[0].reason).toMatch(/never received an ARP reply/);
  });

  it('detects a broadcast storm in a switching loop instead of hanging', () => {
    const net = buildNetwork({
      ...lanSpec,
      devices: [...lanSpec.devices, { id: 'sw2', kind: 'switch', x: 0, y: 0 }],
      links: [...lanSpec.links, ['sw1', 'Gi0/1', 'sw2', 'Gi0/1'], ['sw1', 'Gi0/2', 'sw2', 'Gi0/2']],
    });
    const out = ping(net, 'pc1', '192.168.1.99', { count: 1 });
    expect(out.storm).toBe(true);
    expect(out.events.at(-1)!.message).toMatch(/broadcast storm/);
  });
});

describe('Layer 3 routing', () => {
  it('fails while router interfaces are shut down, then works', () => {
    const down = buildNetwork(twoLans(false));
    const r = ping(down, 'pc1', '192.168.2.10', { count: 1 });
    expect(r.results[0].status).toBe('timeout');
    expect(diagnose(down).some((i) => i.code === 'iface-shutdown')).toBe(true);

    const up = buildNetwork(twoLans(true));
    const ok = ping(up, 'pc1', '192.168.2.10', { count: 1 });
    expect(ok.results[0].status).toBe('success');
    expect(ok.events.some((e) => e.kind === 'route' && e.deviceId === 'r1')).toBe(true);
  });

  it('explains a gateway in the wrong subnet', () => {
    const net = buildNetwork(twoLans(true));
    setGateway(net, 'pc1', '192.168.20.1');
    const r = ping(net, 'pc1', '192.168.2.10', { count: 1 });
    expect(r.results[0].status).toBe('error');
    expect(r.results[0].reason).toMatch(/not inside its own network/);
    expect(diagnose(net).find((i) => i.code === 'gateway-outside-subnet')!.message).toMatch(/192\.168\.1\.0\/24.*192\.168\.20\.0\/24/);
  });

  it('needs static routes between routers', () => {
    const none = buildNetwork(twoRouters(false));
    const r = ping(none, 'pc1', '10.2.0.10', { count: 1 });
    expect(r.results[0].status).toBe('unreachable');
    expect(r.results[0].reason).toMatch(/no route to 10\.2\.0\.10/);

    const net = buildNetwork(twoRouters(true));
    expect(ping(net, 'pc1', '10.2.0.10', { count: 1 }).results[0].status).toBe('success');
    const table = buildRoutingTable(net, getDevice(net, 'r2'));
    expect(table.find((t) => t.code === 'S*')!.nextHop).toBe('172.16.0.1');
    const tr = traceroute(net, 'pc1', '10.2.0.10');
    expect(tr.reached).toBe(true);
    expect(tr.hops.map((h) => h.ip)).toEqual(['10.1.0.1', '172.16.0.2', '10.2.0.10']);
  });

  it('reports TTL expiry', () => {
    const net = buildNetwork(twoRouters(true));
    const r = ping(net, 'pc1', '10.2.0.10', { count: 1, ttl: 1 });
    expect(r.results[0].status).toBe('ttl-exceeded');
  });

  it('builds networks programmatically', () => {
    const net = createNetwork();
    addDevice(net, 'pc', { id: 'a' });
    addDevice(net, 'pc', { id: 'b' });
    connect(net, 'a', 'b');
    setIfaceIp(net, 'a', 'Fa0', '10.0.0.1', 8);
    setIfaceIp(net, 'b', 'Fa0', '10.0.0.2', 8);
    expect(ping(net, 'a', '10.0.0.2', { count: 1 }).results[0].status).toBe('success');
    expect(getDevice(net, 'a').name).toBe('PC1');
  });
});

describe('VLANs', () => {
  it('isolates VLANs and routes between them with router-on-a-stick', () => {
    const net = buildNetwork(vlanOffice());
    // same VLAN across the trunk
    expect(ping(net, 'pcA', '10.10.0.11', { count: 1 }).results[0].status).toBe('success');
    // inter-VLAN via router sub-interfaces
    expect(ping(net, 'pcA', '10.20.0.11', { count: 1 }).results[0].status).toBe('success');
    const sw1 = getDevice(net, 'sw1');
    expect(new Set(sw1.macTable!.map((e) => e.vlan))).toEqual(new Set([10, 20]));
  });

  it('cannot reach other VLANs without a router', () => {
    const net = buildNetwork(vlanOffice({ router: false }));
    expect(ping(net, 'pcA', '10.10.0.11', { count: 1 }).results[0].status).toBe('success');
    expect(ping(net, 'pcA', '10.20.0.10', { count: 1 }).results[0].status).toBe('timeout');
  });

  it('drops traffic when the inter-switch link is not a trunk', () => {
    const net = buildNetwork(vlanOffice({ trunk: false }));
    const r = ping(net, 'pcA', '10.10.0.11', { count: 1 });
    expect(r.results[0].status).toBe('timeout');
  });

  it('drops traffic for a VLAN missing on one switch', () => {
    const net = buildNetwork(vlanOffice({ vlan20OnSw2: false }));
    const r = ping(net, 'pcD', '10.20.0.10', { count: 1 });
    expect(r.results[0].status).toBe('timeout');
    expect(r.events.some((e) => /VLAN 20 does not exist/.test(e.message))).toBe(true);
    expect(diagnose(net).some((i) => i.code === 'vlan-missing')).toBe(true);
  });
});

describe('lab validation', () => {
  it('validates tasks on a clean copy', () => {
    const net = buildNetwork(twoLans(false));
    const tasks = [
      { id: 't1', title: 'Enable interfaces', checks: [{ type: 'interfaceUp' as const, device: 'r1', iface: 'Gi0/0' }] },
      { id: 't2', title: 'Connectivity', checks: [{ type: 'ping' as const, from: 'pc1', to: 'pc2' }] },
    ];
    const bad = validateLab(net, tasks);
    expect(bad.passed).toBe(false);
    expect(bad.tasks[0].checks[0].message).toMatch(/no shutdown/);
    const good = validateLab(buildNetwork(twoLans(true)), tasks);
    expect(good.passed).toBe(true);
    expect(good.passedChecks).toBe(2);
    // the original network is not mutated by validation
    expect(getDevice(net, 'pc1').arp).toEqual([]);
  });
});

describe('subnet practice generator', () => {
  it('is deterministic and gradeable', () => {
    const a = generateSubnetQuestions(42, 8, 'hard');
    const b = generateSubnetQuestions(42, 8, 'hard');
    expect(a).toEqual(b);
    const answers = Object.fromEntries(a.map((q) => [q.id, q.answer]));
    expect(gradeSubnetAnswers(42, 8, 'hard', answers).score).toBe(100);
    expect(gradeSubnetAnswers(42, 8, 'hard', {}).score).toBe(0);
  });
});

describe('schema', () => {
  it('accepts engine output and rejects tampering', () => {
    const net = buildNetwork(vlanOffice());
    const parsed = networkSchema.parse(JSON.parse(JSON.stringify(net)));
    expect(checkNetworkIntegrity(parsed)).toBeNull();
    const bad = structuredClone(parsed);
    bad.links.push({ id: 'x', a: { device: 'pcA', iface: 'Fa0' }, b: { device: 'pcB', iface: 'Fa0' } });
    expect(checkNetworkIntegrity(bad)).toMatch(/more than one link/);
  });
});
