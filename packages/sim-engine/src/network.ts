import type { Device, DeviceKind, Iface, Link, Network, StaticRoute, SwitchportConfig } from './types';
import { isValidIp } from './ip';

export class SimError extends Error {}

export function createNetwork(): Network {
  return { version: 1, devices: [], links: [], macCounter: 1, idCounter: 1 };
}

/** Copy-on-write helper: returns a modified deep copy, leaving the input untouched. */
export function produce<T>(net: Network, fn: (draft: Network) => T): { net: Network; result: T } {
  const draft = structuredClone(net);
  const result = fn(draft);
  return { net: draft, result };
}

export function nextMac(net: Network): string {
  // Deterministic, Cisco-dotted format: 0060.5cXX.XXXX
  const h = (net.macCounter++ & 0xffffff).toString(16).padStart(6, '0');
  return `0060.5c${h.slice(0, 2)}.${h.slice(2)}`;
}

const DEFAULT_PREFIX: Record<DeviceKind, string> = {
  pc: 'PC',
  laptop: 'Laptop',
  server: 'Server',
  switch: 'Switch',
  router: 'Router',
};

function defaultSwitchport(): SwitchportConfig {
  return { mode: 'access', accessVlan: 1, allowedVlans: 'all', nativeVlan: 1 };
}

function defaultInterfaceNames(kind: DeviceKind): string[] {
  switch (kind) {
    case 'switch':
      return [...Array.from({ length: 24 }, (_, i) => `Fa0/${i + 1}`), 'Gi0/1', 'Gi0/2'];
    case 'router':
      return ['Gi0/0', 'Gi0/1', 'Gi0/2'];
    default:
      return ['Fa0'];
  }
}

export function uniqueName(net: Network, base: string): string {
  const names = new Set(net.devices.map((d) => d.name.toLowerCase()));
  for (let i = 1; ; i++) {
    const candidate = `${base}${i}`;
    if (!names.has(candidate.toLowerCase())) return candidate;
  }
}

export interface AddDeviceOptions {
  id?: string;
  name?: string;
  x?: number;
  y?: number;
}

export function addDevice(net: Network, kind: DeviceKind, opts: AddDeviceOptions = {}): Device {
  const id = opts.id ?? `d${net.idCounter++}`;
  if (net.devices.some((d) => d.id === id)) throw new SimError(`Device id ${id} already exists`);
  const name = opts.name ?? uniqueName(net, DEFAULT_PREFIX[kind]);
  if (!isValidDeviceName(name)) throw new SimError(`Invalid device name "${name}"`);
  if (net.devices.some((d) => d.name.toLowerCase() === name.toLowerCase()))
    throw new SimError(`A device named ${name} already exists`);
  const device: Device = {
    id,
    name,
    kind,
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    interfaces: defaultInterfaceNames(kind).map((n) => ({
      name: n,
      mac: nextMac(net),
      // Cisco routers ship with interfaces administratively down; switches and hosts are up.
      adminUp: kind !== 'router',
      ...(kind === 'switch' ? { switchport: defaultSwitchport() } : {}),
    })),
  };
  if (kind === 'switch') {
    device.vlans = [{ id: 1, name: 'default' }];
    device.macTable = [];
  }
  if (kind === 'router') device.staticRoutes = [];
  if (kind !== 'switch') device.arp = [];
  net.devices.push(device);
  return device;
}

export function isValidDeviceName(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(name);
}

export function getDevice(net: Network, idOrName: string): Device {
  const d =
    net.devices.find((x) => x.id === idOrName) ??
    net.devices.find((x) => x.name.toLowerCase() === idOrName.toLowerCase());
  if (!d) throw new SimError(`Unknown device ${idOrName}`);
  return d;
}

export function findDevice(net: Network, idOrName: string): Device | undefined {
  try {
    return getDevice(net, idOrName);
  } catch {
    return undefined;
  }
}

export function getIface(device: Device, name: string): Iface {
  const canonical = normalizeIfaceName(name) ?? name;
  const i = device.interfaces.find((x) => x.name.toLowerCase() === canonical.toLowerCase());
  if (!i) throw new SimError(`${device.name} has no interface ${name}`);
  return i;
}

export function findIface(device: Device, name: string): Iface | undefined {
  try {
    return getIface(device, name);
  } catch {
    return undefined;
  }
}

/**
 * Accepts IOS-style abbreviations: f0/1, fa0/1, fastethernet 0/1, g0/0.10, gig0/0, gi0/1...
 * Returns the canonical short name (Fa0/1, Gi0/0.10) or null if unparsable.
 */
export function normalizeIfaceName(input: string): string | null {
  const s = input.replace(/\s+/g, '').toLowerCase();
  const m = s.match(/^([a-z]+)(\d+(?:\/\d+)*(?:\.\d+)?)$/);
  if (!m) return null;
  const [, word, num] = m;
  if ('fastethernet'.startsWith(word)) return `Fa${num}`;
  if ('gigabitethernet'.startsWith(word)) return `Gi${num}`;
  return null;
}

export function removeDevice(net: Network, id: string): void {
  const d = getDevice(net, id);
  net.links = net.links.filter((l) => l.a.device !== d.id && l.b.device !== d.id);
  net.devices = net.devices.filter((x) => x.id !== d.id);
  // forget learned state pointing at the removed device's MACs
  const macs = new Set(d.interfaces.map((i) => i.mac));
  for (const other of net.devices) {
    if (other.arp) other.arp = other.arp.filter((e) => !macs.has(e.mac));
    if (other.macTable) other.macTable = other.macTable.filter((e) => !macs.has(e.mac));
  }
}

export function renameDevice(net: Network, id: string, name: string): void {
  const d = getDevice(net, id);
  if (!isValidDeviceName(name))
    throw new SimError('Names must start with a letter and contain only letters, digits, - or _ (max 32)');
  if (net.devices.some((x) => x.id !== d.id && x.name.toLowerCase() === name.toLowerCase()))
    throw new SimError(`A device named ${name} already exists`);
  d.name = name;
}

export function linkOf(net: Network, deviceId: string, iface: string): Link | undefined {
  return net.links.find(
    (l) => (l.a.device === deviceId && l.a.iface === iface) || (l.b.device === deviceId && l.b.iface === iface),
  );
}

export function peerOf(net: Network, deviceId: string, iface: string): { device: Device; iface: Iface; link: Link } | undefined {
  const link = linkOf(net, deviceId, iface);
  if (!link) return undefined;
  const end = link.a.device === deviceId && link.a.iface === iface ? link.b : link.a;
  const device = net.devices.find((d) => d.id === end.device);
  if (!device) return undefined;
  return { device, iface: getIface(device, end.iface), link };
}

export function isPhysical(i: Iface): boolean {
  return !i.parent;
}

export function freeIfaces(net: Network, device: Device): Iface[] {
  return device.interfaces.filter((i) => isPhysical(i) && !linkOf(net, device.id, i.name));
}

export function connect(net: Network, aId: string, bId: string, aIface?: string, bIface?: string): Link {
  const a = getDevice(net, aId);
  const b = getDevice(net, bId);
  if (a.id === b.id) throw new SimError('Cannot connect a device to itself');
  const ai = aIface ? getIface(a, aIface) : freeIfaces(net, a)[0];
  const bi = bIface ? getIface(b, bIface) : freeIfaces(net, b)[0];
  if (!ai) throw new SimError(`${a.name} has no free ports`);
  if (!bi) throw new SimError(`${b.name} has no free ports`);
  if (!isPhysical(ai) || !isPhysical(bi)) throw new SimError('Cables connect to physical interfaces only');
  if (linkOf(net, a.id, ai.name)) throw new SimError(`${a.name} ${ai.name} is already connected`);
  if (linkOf(net, b.id, bi.name)) throw new SimError(`${b.name} ${bi.name} is already connected`);
  const link: Link = { id: `l${net.idCounter++}`, a: { device: a.id, iface: ai.name }, b: { device: b.id, iface: bi.name } };
  net.links.push(link);
  return link;
}

export function disconnect(net: Network, linkId: string): void {
  net.links = net.links.filter((l) => l.id !== linkId);
}

/** Line protocol status: physical needs both ends admin-up; sub-interfaces follow their parent. */
export function ifaceOperUp(net: Network, device: Device, iface: Iface): boolean {
  if (!iface.adminUp) return false;
  if (iface.parent) {
    const parent = findIface(device, iface.parent);
    return !!parent && ifaceOperUp(net, device, parent);
  }
  const peer = peerOf(net, device.id, iface.name);
  return !!peer && peer.iface.adminUp;
}

export function ifaceStatus(net: Network, device: Device, iface: Iface): { status: string; protocol: string } {
  if (!iface.adminUp) return { status: 'administratively down', protocol: 'down' };
  const up = ifaceOperUp(net, device, iface);
  return { status: up ? 'up' : 'down', protocol: up ? 'up' : 'down' };
}

// ---------- configuration helpers (used by UI panels and CLI) ----------

export function setIfaceIp(net: Network, deviceId: string, ifaceName: string, ip: string | null, prefix?: number): void {
  const d = getDevice(net, deviceId);
  if (d.kind === 'switch') throw new SimError('Layer 2 switch ports do not take IP addresses in this simulator');
  const i = getIface(d, ifaceName);
  if (ip === null) {
    delete i.ip;
    delete i.prefix;
    return;
  }
  if (!isValidIp(ip)) throw new SimError(`Invalid IP address ${ip}`);
  if (prefix === undefined || prefix < 1 || prefix > 32) throw new SimError('Invalid subnet mask');
  i.ip = ip;
  i.prefix = prefix;
}

export function setGateway(net: Network, deviceId: string, gw: string | null): void {
  const d = getDevice(net, deviceId);
  if (d.kind === 'router' || d.kind === 'switch') throw new SimError('Only end hosts have a default gateway setting');
  if (gw === null || gw === '') {
    delete d.gateway;
    return;
  }
  if (!isValidIp(gw)) throw new SimError(`Invalid gateway ${gw}`);
  d.gateway = gw;
}

export function setAdminUp(net: Network, deviceId: string, ifaceName: string, up: boolean): void {
  getIface(getDevice(net, deviceId), ifaceName).adminUp = up;
}

export function addSubinterface(net: Network, deviceId: string, name: string): Iface {
  const d = getDevice(net, deviceId);
  if (d.kind !== 'router') throw new SimError('Sub-interfaces are supported on routers only');
  const canonical = normalizeIfaceName(name);
  if (!canonical || !canonical.includes('.')) throw new SimError(`Invalid sub-interface ${name}`);
  const existing = findIface(d, canonical);
  if (existing) return existing;
  const parentName = canonical.split('.')[0];
  const parent = getIface(d, parentName);
  const sub: Iface = { name: canonical, mac: parent.mac, adminUp: true, parent: parent.name };
  d.interfaces.push(sub);
  return sub;
}

export function removeSubinterface(net: Network, deviceId: string, name: string): void {
  const d = getDevice(net, deviceId);
  const i = getIface(d, name);
  if (!i.parent) throw new SimError('Physical interfaces cannot be removed');
  d.interfaces = d.interfaces.filter((x) => x !== i);
}

export function setSwitchport(net: Network, deviceId: string, ifaceName: string, patch: Partial<SwitchportConfig>): void {
  const d = getDevice(net, deviceId);
  if (d.kind !== 'switch') throw new SimError('Switchport settings apply to switches only');
  const i = getIface(d, ifaceName);
  i.switchport = { ...(i.switchport ?? defaultSwitchport()), ...patch };
}

export function addVlan(net: Network, deviceId: string, id: number, name?: string): void {
  const d = getDevice(net, deviceId);
  if (d.kind !== 'switch') throw new SimError('VLANs are configured on switches');
  if (!Number.isInteger(id) || id < 1 || id > 4094) throw new SimError('VLAN id must be between 1 and 4094');
  d.vlans ??= [];
  const existing = d.vlans.find((v) => v.id === id);
  const vname = name ?? `VLAN${String(id).padStart(4, '0')}`;
  if (existing) {
    if (name) existing.name = name;
  } else {
    d.vlans.push({ id, name: vname });
    d.vlans.sort((a, b) => a.id - b.id);
  }
}

export function removeVlan(net: Network, deviceId: string, id: number): void {
  const d = getDevice(net, deviceId);
  if (id === 1) throw new SimError('Default VLAN 1 may not be deleted');
  d.vlans = (d.vlans ?? []).filter((v) => v.id !== id);
  if (d.macTable) d.macTable = d.macTable.filter((e) => e.vlan !== id);
}

export function addStaticRoute(net: Network, deviceId: string, route: StaticRoute): void {
  const d = getDevice(net, deviceId);
  if (d.kind !== 'router') throw new SimError('Static routes are configured on routers');
  d.staticRoutes ??= [];
  const dup = d.staticRoutes.find(
    (r) => r.network === route.network && r.prefix === route.prefix && r.nextHop === route.nextHop && r.exitIface === route.exitIface,
  );
  if (!dup) d.staticRoutes.push(route);
}

export function removeStaticRoute(net: Network, deviceId: string, network: string, prefix: number, nextHop?: string): boolean {
  const d = getDevice(net, deviceId);
  const before = d.staticRoutes?.length ?? 0;
  d.staticRoutes = (d.staticRoutes ?? []).filter(
    (r) => !(r.network === network && r.prefix === prefix && (!nextHop || r.nextHop === nextHop || r.exitIface === nextHop)),
  );
  return d.staticRoutes.length !== before;
}

/** Clears learned ARP/MAC tables (e.g., before validation so results don't depend on history). */
export function clearRuntime(net: Network): void {
  for (const d of net.devices) {
    if (d.arp) d.arp = [];
    if (d.macTable) d.macTable = [];
  }
}

export function vlanAllowed(sp: SwitchportConfig, vlan: number): boolean {
  return sp.allowedVlans === 'all' || sp.allowedVlans.includes(vlan);
}

export function formatVlanList(list: 'all' | number[]): string {
  if (list === 'all') return 'ALL';
  const sorted = [...new Set(list)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    out.push(j > i ? `${sorted[i]}-${sorted[j]}` : `${sorted[i]}`);
    i = j;
  }
  return out.join(',') || 'none';
}

export function parseVlanList(s: string): number[] | null {
  const out: number[] = [];
  for (const part of s.split(',')) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b > 4094 || b < a) return null;
    for (let v = a; v <= b; v++) out.push(v);
  }
  return out;
}
