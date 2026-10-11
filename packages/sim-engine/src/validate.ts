// Declarative lab validation. The same code runs in the browser (live task checklist) and on
// the server (authoritative grading of a submitted topology).
import type { DeviceKind, Network } from './types';
import { HOST_KINDS } from './types';
import { clearRuntime, findDevice, findIface, ifaceOperUp, vlanAllowed } from './network';
import { buildRoutingTable } from './routing';
import { ping } from './sim';
import { diagnose, type Issue } from './diagnose';
import { inSubnet, isValidIp, networkNum, ipToNum, broadcastNum, parseCidr } from './ip';

export type Check =
  | { type: 'ping'; from: string; to: string; expect?: 'success' | 'fail'; label?: string }
  | { type: 'hostConfig'; device: string; ip?: string; network?: string; gateway?: string; label?: string }
  | { type: 'interfaceIp'; device: string; iface: string; ip?: string; network?: string; label?: string }
  | { type: 'interfaceUp'; device: string; iface: string; label?: string }
  | { type: 'vlanExists'; device: string; vlan: number; name?: string; label?: string }
  | { type: 'portAccessVlan'; device: string; iface: string; vlan: number; label?: string }
  | { type: 'portMode'; device: string; iface: string; mode: 'access' | 'trunk'; label?: string }
  | { type: 'trunkAllows'; device: string; iface: string; vlans: number[]; label?: string }
  | { type: 'routeExists'; device: string; network: string; nextHop?: string; label?: string }
  | { type: 'deviceCount'; kind: DeviceKind; min: number; label?: string }
  | { type: 'pingMatrix'; kinds?: DeviceKind[]; label?: string }
  | { type: 'noErrors'; label?: string };

export interface LabTask {
  id: string;
  title: string;
  description?: string;
  checks: Check[];
}

export interface CheckResult {
  passed: boolean;
  label: string;
  message: string;
}

export interface TaskResult {
  id: string;
  title: string;
  passed: boolean;
  checks: CheckResult[];
}

export interface ValidationResult {
  passed: boolean;
  tasks: TaskResult[];
  issues: Issue[];
  passedChecks: number;
  totalChecks: number;
}

function resolveTarget(net: Network, to: string): string | undefined {
  if (isValidIp(to)) return to;
  const d = findDevice(net, to);
  return d?.interfaces.find((i) => i.ip)?.ip;
}

function isUsableHost(ip: string, cidr: string): boolean {
  const c = parseCidr(cidr);
  if (!c || !inSubnet(ip, c.ip, c.prefix)) return false;
  const n = ipToNum(ip);
  return c.prefix > 30 || (n !== networkNum(n, c.prefix) && n !== broadcastNum(n, c.prefix));
}

export function evaluateCheck(net: Network, check: Check): CheckResult {
  const pass = (label: string, message = 'OK'): CheckResult => ({ passed: true, label, message });
  const fail = (label: string, message: string): CheckResult => ({ passed: false, label, message });
  const name = (id: string) => findDevice(net, id)?.name ?? id;

  switch (check.type) {
    case 'ping': {
      const expect = check.expect ?? 'success';
      const target = resolveTarget(net, check.to);
      const label = check.label ?? `${name(check.from)} ${expect === 'success' ? 'can' : 'cannot'} ping ${findDevice(net, check.to)?.name ?? check.to}`;
      const src = findDevice(net, check.from);
      if (!src) return fail(label, `Device ${check.from} no longer exists.`);
      if (!target) return fail(label, `${name(check.to)} has no IP address.`);
      const out = ping(net, src.id, target, { count: 1 });
      const ok = out.results[0]?.status === 'success';
      if (ok === (expect === 'success')) return pass(label, ok ? 'Reply received.' : 'Traffic is blocked as required.');
      return fail(label, ok ? `${src.name} can still reach ${target}, but it should not.` : (out.results[0]?.reason ?? 'No reply.'));
    }
    case 'hostConfig': {
      const label = check.label ?? `${name(check.device)} has the correct IP settings`;
      const d = findDevice(net, check.device);
      const nic = d?.interfaces[0];
      if (!d || !nic) return fail(label, 'Device not found.');
      if (!nic.ip) return fail(label, `${d.name} has no IP address yet.`);
      if (check.ip && nic.ip !== check.ip) return fail(label, `${d.name} should use ${check.ip} (currently ${nic.ip}).`);
      if (check.network) {
        const c = parseCidr(check.network)!;
        if (!isUsableHost(nic.ip, check.network)) return fail(label, `${nic.ip} is not a usable host address in ${check.network}.`);
        if (nic.prefix !== c.prefix) return fail(label, `${d.name} should use a /${c.prefix} mask (currently /${nic.prefix}).`);
      }
      if (check.gateway && d.gateway !== check.gateway)
        return fail(label, d.gateway ? `${d.name}'s gateway is ${d.gateway}; it should be ${check.gateway}.` : `${d.name} has no default gateway.`);
      return pass(label);
    }
    case 'interfaceIp': {
      const d = findDevice(net, check.device);
      const label = check.label ?? `${name(check.device)} ${check.iface} has ${check.ip ?? `an address in ${check.network}`}`;
      const i = d && findIface(d, check.iface);
      if (!d || !i) return fail(label, `${name(check.device)} ${check.iface} does not exist.`);
      if (!i.ip) return fail(label, `${d.name} ${i.name} has no IP address.`);
      if (check.ip) {
        const c = parseCidr(check.ip);
        const want = c ?? { ip: check.ip, prefix: i.prefix };
        if (i.ip !== want.ip || (c && i.prefix !== c.prefix)) return fail(label, `${d.name} ${i.name} is ${i.ip}/${i.prefix}; expected ${check.ip}.`);
      }
      if (check.network && !isUsableHost(i.ip, check.network)) return fail(label, `${i.ip} is not a usable address in ${check.network}.`);
      return pass(label);
    }
    case 'interfaceUp': {
      const d = findDevice(net, check.device);
      const label = check.label ?? `${name(check.device)} ${check.iface} is up`;
      const i = d && findIface(d, check.iface);
      if (!d || !i) return fail(label, `${check.iface} does not exist.`);
      if (!i.adminUp) return fail(label, `${d.name} ${i.name} is administratively down — use "no shutdown".`);
      if (!ifaceOperUp(net, d, i)) return fail(label, `${d.name} ${i.name} is enabled but the link is down (check the cable and the other end).`);
      return pass(label);
    }
    case 'vlanExists': {
      const d = findDevice(net, check.device);
      const label = check.label ?? `VLAN ${check.vlan}${check.name ? ` (${check.name})` : ''} exists on ${name(check.device)}`;
      const v = d?.vlans?.find((x) => x.id === check.vlan);
      if (!v) return fail(label, `VLAN ${check.vlan} is not in ${name(check.device)}'s VLAN database.`);
      if (check.name && v.name.toLowerCase() !== check.name.toLowerCase()) return fail(label, `VLAN ${check.vlan} is named "${v.name}", expected "${check.name}".`);
      return pass(label);
    }
    case 'portAccessVlan': {
      const d = findDevice(net, check.device);
      const label = check.label ?? `${name(check.device)} ${check.iface} is an access port in VLAN ${check.vlan}`;
      const sp = d && findIface(d, check.iface)?.switchport;
      if (!sp) return fail(label, `${check.iface} is not a switch port.`);
      if (sp.mode !== 'access') return fail(label, `${check.iface} is a ${sp.mode} port, not an access port.`);
      if (sp.accessVlan !== check.vlan) return fail(label, `${check.iface} is in VLAN ${sp.accessVlan}, expected VLAN ${check.vlan}.`);
      return pass(label);
    }
    case 'portMode': {
      const d = findDevice(net, check.device);
      const label = check.label ?? `${name(check.device)} ${check.iface} is a ${check.mode} port`;
      const sp = d && findIface(d, check.iface)?.switchport;
      if (!sp) return fail(label, `${check.iface} is not a switch port.`);
      return sp.mode === check.mode ? pass(label) : fail(label, `${check.iface} is in ${sp.mode} mode.`);
    }
    case 'trunkAllows': {
      const d = findDevice(net, check.device);
      const label = check.label ?? `${name(check.device)} ${check.iface} trunk carries VLANs ${check.vlans.join(', ')}`;
      const sp = d && findIface(d, check.iface)?.switchport;
      if (!sp || sp.mode !== 'trunk') return fail(label, `${check.iface} is not a trunk.`);
      const missing = check.vlans.filter((v) => !vlanAllowed(sp, v));
      return missing.length ? fail(label, `VLAN(s) ${missing.join(', ')} are not allowed on the trunk.`) : pass(label);
    }
    case 'routeExists': {
      const d = findDevice(net, check.device);
      const c = parseCidr(check.network)!;
      const label = check.label ?? `${name(check.device)} has a route to ${check.network}`;
      if (!d || d.kind !== 'router') return fail(label, 'Router not found.');
      const table = buildRoutingTable(net, d);
      const r = table.find(
        (e) => e.code !== 'L' && e.prefix === c.prefix && ipToNum(e.network) === networkNum(ipToNum(c.ip), c.prefix),
      );
      if (!r) return fail(label, `There is no usable route to ${check.network} in ${d.name}'s routing table.`);
      if (check.nextHop && r.nextHop !== check.nextHop && r.code !== 'C') return fail(label, `The route uses next hop ${r.nextHop}, expected ${check.nextHop}.`);
      return pass(label);
    }
    case 'deviceCount': {
      const n = net.devices.filter((d) => d.kind === check.kind).length;
      const label = check.label ?? `At least ${check.min} ${check.kind} device(s)`;
      return n >= check.min ? pass(label, `${n} present.`) : fail(label, `Only ${n} ${check.kind} device(s) — add ${check.min - n} more.`);
    }
    case 'pingMatrix': {
      const kinds = check.kinds ?? HOST_KINDS;
      const hosts = net.devices.filter((d) => kinds.includes(d.kind));
      const label = check.label ?? 'Every host can reach every other host';
      if (hosts.length < 2) return fail(label, 'Add at least two hosts.');
      const pairs = hosts.flatMap((a, i) => hosts.slice(i + 1).map((b) => [a, b] as const)).slice(0, 60);
      for (const [a, b] of pairs) {
        const ip = b.interfaces.find((i) => i.ip)?.ip;
        if (!ip) return fail(label, `${b.name} has no IP address.`);
        const out = ping(net, a.id, ip, { count: 1 });
        if (out.results[0]?.status !== 'success') return fail(label, `${a.name} cannot reach ${b.name}: ${out.results[0]?.reason ?? 'no reply'}`);
      }
      return pass(label, `${pairs.length} host pairs verified.`);
    }
    case 'noErrors': {
      const label = check.label ?? 'No configuration errors remain';
      const errs = diagnose(net).filter((i) => i.severity === 'error');
      return errs.length ? fail(label, errs[0].message) : pass(label);
    }
  }
}

/** Validates on a clean copy so earlier learner pings do not influence the outcome. */
export function validateLab(network: Network, tasks: LabTask[]): ValidationResult {
  const net = structuredClone(network);
  clearRuntime(net);
  let passedChecks = 0;
  let totalChecks = 0;
  const results = tasks.map((t) => {
    const checks = t.checks.map((c) => evaluateCheck(net, c));
    totalChecks += checks.length;
    passedChecks += checks.filter((c) => c.passed).length;
    return { id: t.id, title: t.title, passed: checks.every((c) => c.passed), checks };
  });
  return { passed: results.every((r) => r.passed), tasks: results, issues: diagnose(net), passedChecks, totalChecks };
}
