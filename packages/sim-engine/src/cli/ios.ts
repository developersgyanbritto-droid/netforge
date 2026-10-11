// IOS-style CLI for simulated routers and switches. Commands are matched against a whitelist
// grammar (unique-prefix abbreviations like IOS) and operate on the in-memory Network only.
import type { Device, DeviceKind, Iface, Network, SimEvent } from '../types';
import {
  addStaticRoute,
  addSubinterface,
  addVlan,
  formatVlanList,
  getDevice,
  ifaceOperUp,
  ifaceStatus,
  normalizeIfaceName,
  parseVlanList,
  peerOf,
  removeStaticRoute,
  removeVlan,
  renameDevice,
  SimError,
  findIface,
} from '../network';
import { ipToNum, isValidIp, maskToPrefix, networkNum, numToIp, prefixToMask } from '../ip';
import { buildRoutingTable } from '../routing';
import { ping, traceroute } from '../sim';

export type IosMode = 'user' | 'priv' | 'config' | 'config-if' | 'config-vlan';

export interface IosSession {
  deviceId: string;
  mode: IosMode;
  iface?: string;
  vlan?: number;
}

export interface CliResult {
  output: string;
  changed: boolean;
  events?: SimEvent[];
}

interface Ctx {
  net: Network;
  s: IosSession;
  dev: Device;
  changed: boolean;
  events?: SimEvent[];
}

type Handler = (ctx: Ctx, args: string[]) => string | void;

interface Cmd {
  modes: IosMode[];
  pattern: string[];
  kinds?: DeviceKind[];
  help?: string;
  run: Handler;
}

const PARAM: Record<string, (t: string) => boolean> = {
  '<ip>': isValidIp,
  '<mask>': (t) => isValidIp(t) && maskToPrefix(t) !== null,
  '<num>': (t) => /^\d{1,5}$/.test(t),
  '<iface>': (t) => normalizeIfaceName(t) !== null,
  '<ip|iface>': (t) => isValidIp(t) || normalizeIfaceName(t) !== null,
  '<word>': (t) => /^[A-Za-z0-9_.-]{1,32}$/.test(t),
  '<vlans>': (t) => parseVlanList(t) !== null,
  '<rest>': () => true,
};
const isParam = (t: string) => t.startsWith('<');

export const longIfaceName = (n: string) =>
  n.replace(/^Fa(?=\d)/, 'FastEthernet').replace(/^Gi(?=\d)/, 'GigabitEthernet');

const pad = (s: string, n: number) => (s.length >= n ? s + ' ' : s + ' '.repeat(n - s.length));

const SHOW = ['user', 'priv'] as IosMode[];
const ROUTER: DeviceKind[] = ['router'];
const SWITCH: DeviceKind[] = ['switch'];

function currentIface(ctx: Ctx): Iface {
  const i = findIface(ctx.dev, ctx.s.iface!);
  if (!i) throw new SimError('% Interface no longer exists');
  return i;
}

// ---------- show output builders (exported for UI inspectors) ----------

export function showIpInterfaceBrief(net: Network, dev: Device): string {
  const rows = [pad('Interface', 23) + pad('IP-Address', 16) + 'OK? Method ' + pad('Status', 22) + 'Protocol'];
  for (const i of dev.interfaces) {
    const st = ifaceStatus(net, dev, i);
    rows.push(pad(longIfaceName(i.name), 23) + pad(i.ip ?? 'unassigned', 16) + pad(i.ip ? 'YES' : 'YES', 4) + pad(i.ip ? 'manual' : 'unset', 7) + pad(st.status, 22) + st.protocol);
  }
  return rows.join('\n');
}

export function showIpRoute(net: Network, dev: Device): string {
  const table = buildRoutingTable(net, dev);
  const def = table.find((r) => r.prefix === 0);
  const lines = [
    'Codes: L - local, C - connected, S - static, * - candidate default',
    '',
    def ? `Gateway of last resort is ${def.nextHop ?? def.iface} to network 0.0.0.0` : 'Gateway of last resort is not set',
    '',
  ];
  if (!table.length) lines.push('      (no routes — configure IP addresses and bring interfaces up)');
  for (const r of table) {
    const code = pad(r.code, 9);
    if (r.code === 'C' || r.code === 'L') lines.push(`${code}${r.network}/${r.prefix} is directly connected, ${longIfaceName(r.iface!)}`);
    else if (r.nextHop) lines.push(`${code}${r.network}/${r.prefix} [1/0] via ${r.nextHop}${r.iface ? `, ${longIfaceName(r.iface)}` : ''}`);
    else lines.push(`${code}${r.network}/${r.prefix} is directly connected, ${longIfaceName(r.iface!)}`);
  }
  return lines.join('\n');
}

export function showVlanBrief(net: Network, dev: Device): string {
  const lines = [
    pad('VLAN', 5) + pad('Name', 33) + pad('Status', 10) + 'Ports',
    '---- -------------------------------- --------- -------------------------------',
  ];
  for (const v of dev.vlans ?? []) {
    const ports = dev.interfaces.filter((i) => i.switchport?.mode === 'access' && i.switchport.accessVlan === v.id).map((i) => i.name);
    const chunks: string[] = [];
    for (let k = 0; k < ports.length; k += 4) chunks.push(ports.slice(k, k + 4).join(', '));
    lines.push(pad(String(v.id), 5) + pad(v.name, 33) + pad('active', 10) + (chunks[0] ?? ''));
    for (const c of chunks.slice(1)) lines.push(' '.repeat(48) + c);
  }
  return lines.join('\n');
}

export function showMacTable(dev: Device): string {
  const lines = [
    '          Mac Address Table',
    '-------------------------------------------',
    '',
    'Vlan    Mac Address       Type        Ports',
    '----    -----------       --------    -----',
  ];
  const rows = [...(dev.macTable ?? [])].sort((a, b) => a.vlan - b.vlan || a.port.localeCompare(b.port));
  for (const e of rows) lines.push(`${String(e.vlan).padStart(4)}    ${pad(e.mac, 18)}${pad('DYNAMIC', 12)}${e.port}`);
  lines.push(`Total Mac Addresses for this criterion: ${rows.length}`);
  return lines.join('\n');
}

export function showArp(dev: Device): string {
  const lines = ['Protocol  Address          Age (min)  Hardware Addr   Type   Interface'];
  for (const i of dev.interfaces) if (i.ip) lines.push(`Internet  ${pad(i.ip, 17)}${pad('       -', 11)}${pad(i.mac, 16)}ARPA   ${longIfaceName(i.name)}`);
  for (const e of dev.arp ?? []) lines.push(`Internet  ${pad(e.ip, 17)}${pad('       0', 11)}${pad(e.mac, 16)}ARPA   ${longIfaceName(e.iface)}`);
  return lines.join('\n');
}

function showTrunks(net: Network, dev: Device): string {
  const trunks = dev.interfaces.filter((i) => i.switchport?.mode === 'trunk');
  if (!trunks.length) return '';
  const a = [pad('Port', 12) + pad('Mode', 13) + pad('Encapsulation', 15) + pad('Status', 14) + 'Native vlan'];
  for (const t of trunks) a.push(pad(t.name, 12) + pad('on', 13) + pad('802.1q', 15) + pad(ifaceOperUp(net, dev, t) ? 'trunking' : 'not-trunking', 14) + t.switchport!.nativeVlan);
  a.push('', pad('Port', 12) + 'Vlans allowed on trunk');
  for (const t of trunks) a.push(pad(t.name, 12) + (t.switchport!.allowedVlans === 'all' ? '1-4094' : formatVlanList(t.switchport!.allowedVlans)));
  return a.join('\n');
}

export function showRunningConfig(net: Network, dev: Device): string {
  const L: string[] = ['Building configuration...', '', 'Current configuration:', '!', `hostname ${dev.name}`, '!'];
  if (dev.kind === 'switch') {
    for (const v of dev.vlans ?? []) if (v.id !== 1) L.push(`vlan ${v.id}`, ` name ${v.name}`, '!');
  }
  for (const i of dev.interfaces) {
    L.push(`interface ${longIfaceName(i.name)}`);
    if (i.description) L.push(` description ${i.description}`);
    if (i.dot1q !== undefined) L.push(` encapsulation dot1Q ${i.dot1q}`);
    if (i.switchport) {
      const sp = i.switchport;
      if (sp.mode === 'trunk') {
        if (sp.nativeVlan !== 1) L.push(` switchport trunk native vlan ${sp.nativeVlan}`);
        if (sp.allowedVlans !== 'all') L.push(` switchport trunk allowed vlan ${formatVlanList(sp.allowedVlans)}`);
        L.push(' switchport mode trunk');
      } else {
        if (sp.accessVlan !== 1) L.push(` switchport access vlan ${sp.accessVlan}`);
        L.push(' switchport mode access');
      }
    }
    if (i.ip) L.push(` ip address ${i.ip} ${prefixToMask(i.prefix!)}`);
    else if (dev.kind === 'router') L.push(' no ip address');
    if (!i.adminUp) L.push(' shutdown');
    L.push('!');
  }
  for (const r of dev.staticRoutes ?? []) L.push(`ip route ${r.network} ${prefixToMask(r.prefix)} ${r.nextHop ?? longIfaceName(r.exitIface!)}`);
  L.push('!', 'end');
  void net;
  return L.join('\n');
}

// ---------- ping / traceroute formatting ----------

function iosPing(ctx: Ctx, ip: string): string {
  const out = ping(ctx.net, ctx.dev.id, ip, { count: 5 });
  ctx.events = out.events;
  ctx.changed = true;
  const marks = out.results.map((r) => (r.status === 'success' ? '!' : r.status === 'unreachable' ? 'U' : r.status === 'ttl-exceeded' ? '&' : '.')).join('');
  const ok = out.results.filter((r) => r.status === 'success').length;
  const lines = [
    'Type escape sequence to abort.',
    `Sending 5, 100-byte ICMP Echos to ${ip}, timeout is 2 seconds:`,
    marks,
    `Success rate is ${Math.round((ok / 5) * 100)} percent (${ok}/5)`,
  ];
  const fail = out.results.find((r) => r.status !== 'success');
  if (fail?.reason) lines.push('', `[NetForge] Why: ${fail.reason}`);
  return lines.join('\n');
}

function iosTrace(ctx: Ctx, ip: string): string {
  const out = traceroute(ctx.net, ctx.dev.id, ip);
  ctx.events = out.events;
  ctx.changed = true;
  const lines = ['Type escape sequence to abort.', `Tracing the route to ${ip}`, ''];
  for (const h of out.hops) {
    if (h.status === 'timeout') lines.push(`  ${h.ttl}  *  *  *`);
    else lines.push(`  ${h.ttl} ${h.ip ?? '*'}${h.status === 'unreachable' ? ' !H' : ''}`);
  }
  return lines.join('\n');
}

// ---------- command table ----------

const COMMANDS: Cmd[] = [
  { modes: ['user'], pattern: ['enable'], help: 'Enter privileged EXEC mode', run: (c) => void (c.s.mode = 'priv') },
  { modes: ['priv'], pattern: ['disable'], help: 'Return to user EXEC mode', run: (c) => void (c.s.mode = 'user') },
  { modes: ['priv'], pattern: ['configure', 'terminal'], help: 'Enter configuration mode', run: (c) => { c.s.mode = 'config'; return 'Enter configuration commands, one per line.  End with CNTL/Z.'; } },
  { modes: ['user', 'priv', 'config', 'config-if', 'config-vlan'], pattern: ['exit'], help: 'Exit current mode', run: (c) => {
    if (c.s.mode === 'config-if' || c.s.mode === 'config-vlan') { c.s.mode = 'config'; delete c.s.iface; delete c.s.vlan; }
    else if (c.s.mode === 'config') c.s.mode = 'priv';
    else c.s.mode = 'user';
  } },
  { modes: ['config', 'config-if', 'config-vlan'], pattern: ['end'], help: 'Exit to privileged EXEC mode', run: (c) => { c.s.mode = 'priv'; delete c.s.iface; delete c.s.vlan; } },

  { modes: SHOW, pattern: ['ping', '<ip>'], help: 'Send ICMP echo requests', run: (c, [ip]) => iosPing(c, ip) },
  { modes: SHOW, pattern: ['traceroute', '<ip>'], help: 'Trace the route to a destination', run: (c, [ip]) => iosTrace(c, ip) },
  { modes: SHOW, pattern: ['show', 'ip', 'interface', 'brief'], help: 'Interface IP and status summary', run: (c) => showIpInterfaceBrief(c.net, c.dev) },
  { modes: SHOW, pattern: ['show', 'ip', 'route'], kinds: ROUTER, help: 'Routing table', run: (c) => showIpRoute(c.net, c.dev) },
  { modes: SHOW, pattern: ['show', 'ip', 'arp'], kinds: ROUTER, help: 'ARP cache', run: (c) => showArp(c.dev) },
  { modes: SHOW, pattern: ['show', 'arp'], kinds: ROUTER, help: 'ARP cache', run: (c) => showArp(c.dev) },
  { modes: SHOW, pattern: ['show', 'vlan', 'brief'], kinds: SWITCH, help: 'VLAN summary', run: (c) => showVlanBrief(c.net, c.dev) },
  { modes: SHOW, pattern: ['show', 'vlan'], kinds: SWITCH, help: 'VLAN summary', run: (c) => showVlanBrief(c.net, c.dev) },
  { modes: SHOW, pattern: ['show', 'mac', 'address-table'], kinds: SWITCH, help: 'MAC address table', run: (c) => showMacTable(c.dev) },
  { modes: SHOW, pattern: ['show', 'interfaces', 'trunk'], kinds: SWITCH, help: 'Trunk ports', run: (c) => showTrunks(c.net, c.dev) },
  { modes: ['priv'], pattern: ['show', 'running-config'], help: 'Current configuration', run: (c) => showRunningConfig(c.net, c.dev) },
  { modes: ['priv'], pattern: ['clear', 'mac', 'address-table', 'dynamic'], kinds: SWITCH, help: 'Clear learned MAC addresses', run: (c) => { c.dev.macTable = []; c.changed = true; } },
  { modes: ['priv'], pattern: ['clear', 'mac', 'address-table'], kinds: SWITCH, run: (c) => { c.dev.macTable = []; c.changed = true; } },
  { modes: ['priv'], pattern: ['clear', 'arp-cache'], kinds: ROUTER, help: 'Clear the ARP cache', run: (c) => { c.dev.arp = []; c.changed = true; } },

  { modes: ['config'], pattern: ['hostname', '<word>'], help: 'Set the device name', run: (c, [n]) => { renameDevice(c.net, c.dev.id, n); c.changed = true; } },
  { modes: ['config', 'config-if', 'config-vlan'], pattern: ['interface', '<iface>'], help: 'Select an interface to configure', run: (c, [n]) => {
    const canonical = normalizeIfaceName(n)!;
    let i = findIface(c.dev, canonical);
    if (!i && canonical.includes('.')) {
      if (c.dev.kind !== 'router') throw new SimError('% Sub-interfaces are only supported on routers');
      if (!findIface(c.dev, canonical.split('.')[0])) throw new SimError('% Invalid interface');
      i = addSubinterface(c.net, c.dev.id, canonical);
      c.changed = true;
    }
    if (!i) throw new SimError(`% Invalid interface ${n} — this device has ${c.dev.interfaces.filter((x) => !x.parent).map((x) => x.name).slice(0, 4).join(', ')}...`);
    c.s.mode = 'config-if';
    c.s.iface = i.name;
    delete c.s.vlan;
  } },
  { modes: ['config'], pattern: ['no', 'interface', '<iface>'], kinds: ROUTER, help: 'Delete a sub-interface', run: (c, [n]) => {
    const i = findIface(c.dev, n);
    if (!i?.parent) throw new SimError('% Only sub-interfaces can be deleted');
    c.dev.interfaces = c.dev.interfaces.filter((x) => x !== i);
    c.changed = true;
  } },
  { modes: ['config', 'config-vlan', 'config-if'], pattern: ['vlan', '<num>'], kinds: SWITCH, help: 'Create/enter a VLAN', run: (c, [n]) => { addVlan(c.net, c.dev.id, Number(n)); c.s.mode = 'config-vlan'; c.s.vlan = Number(n); delete c.s.iface; c.changed = true; } },
  { modes: ['config'], pattern: ['no', 'vlan', '<num>'], kinds: SWITCH, help: 'Delete a VLAN', run: (c, [n]) => { removeVlan(c.net, c.dev.id, Number(n)); c.changed = true; } },
  { modes: ['config-vlan'], pattern: ['name', '<word>'], kinds: SWITCH, help: 'Name the VLAN', run: (c, [n]) => { addVlan(c.net, c.dev.id, c.s.vlan!, n); c.changed = true; } },
  { modes: ['config'], pattern: ['ip', 'route', '<ip>', '<mask>', '<ip|iface>'], kinds: ROUTER, help: 'Add a static route', run: (c, [net, mask, via]) => {
    const prefix = maskToPrefix(mask)!;
    const network = numToIp(networkNum(ipToNum(net), prefix));
    if (network !== net) throw new SimError(`% Inconsistent address and mask (did you mean ${network}?)`);
    if (isValidIp(via)) addStaticRoute(c.net, c.dev.id, { network, prefix, nextHop: via });
    else {
      const out = findIface(c.dev, via);
      if (!out) throw new SimError(`% Invalid interface ${via}`);
      addStaticRoute(c.net, c.dev.id, { network, prefix, exitIface: out.name });
    }
    c.changed = true;
  } },
  { modes: ['config'], pattern: ['no', 'ip', 'route', '<ip>', '<mask>', '<ip|iface>'], kinds: ROUTER, run: (c, [net, mask, via]) => {
    const iface = !isValidIp(via) ? findIface(c.dev, via)?.name : via;
    if (!removeStaticRoute(c.net, c.dev.id, net, maskToPrefix(mask)!, iface)) return '% No matching route to delete';
    c.changed = true;
  } },
  { modes: ['config'], pattern: ['no', 'ip', 'route', '<ip>', '<mask>'], kinds: ROUTER, help: 'Remove a static route', run: (c, [net, mask]) => {
    if (!removeStaticRoute(c.net, c.dev.id, net, maskToPrefix(mask)!)) return '% No matching route to delete';
    c.changed = true;
  } },

  // interface configuration
  { modes: ['config-if'], pattern: ['ip', 'address', '<ip>', '<mask>'], kinds: ROUTER, help: 'Set the interface IP address', run: (c, [ip, mask]) => {
    const i = currentIface(c);
    const prefix = maskToPrefix(mask)!;
    const n = ipToNum(ip);
    if (prefix <= 30 && (n === networkNum(n, prefix) || n === (networkNum(n, prefix) | (~ipToNum(mask) >>> 0)) >>> 0))
      throw new SimError(`% Bad mask /${prefix} for address ${ip} (that is the network or broadcast address)`);
    const clash = c.dev.interfaces.find((x) => x !== i && x.ip && networkNum(ipToNum(x.ip), Math.min(prefix, x.prefix!)) === networkNum(n, Math.min(prefix, x.prefix!)));
    if (clash) throw new SimError(`% ${numToIp(networkNum(n, prefix))} overlaps with ${longIfaceName(clash.name)}`);
    i.ip = ip;
    i.prefix = prefix;
    c.changed = true;
  } },
  { modes: ['config-if'], pattern: ['no', 'ip', 'address'], kinds: ROUTER, help: 'Remove the IP address', run: (c) => { const i = currentIface(c); delete i.ip; delete i.prefix; c.changed = true; } },
  { modes: ['config-if'], pattern: ['shutdown'], help: 'Disable the interface', run: (c) => { currentIface(c).adminUp = false; c.changed = true; return linkMsg(c, false); } },
  { modes: ['config-if'], pattern: ['no', 'shutdown'], help: 'Enable the interface', run: (c) => { currentIface(c).adminUp = true; c.changed = true; return linkMsg(c, true); } },
  { modes: ['config-if'], pattern: ['description', '<rest>'], help: 'Interface description', run: (c, [d]) => { currentIface(c).description = d.slice(0, 80); c.changed = true; } },
  { modes: ['config-if'], pattern: ['encapsulation', 'dot1q', '<num>'], kinds: ROUTER, help: '802.1Q VLAN for this sub-interface', run: (c, [v]) => {
    const i = currentIface(c);
    if (!i.parent) throw new SimError('% Configure encapsulation on a sub-interface (e.g. interface g0/0.10)');
    const vlan = Number(v);
    if (vlan < 1 || vlan > 4094) throw new SimError('% VLAN must be 1-4094');
    const dup = c.dev.interfaces.find((x) => x !== i && x.parent === i.parent && x.dot1q === vlan);
    if (dup) throw new SimError(`% VLAN ${vlan} is already used by ${dup.name}`);
    i.dot1q = vlan;
    c.changed = true;
  } },
  { modes: ['config-if'], pattern: ['switchport', 'mode', 'access'], kinds: SWITCH, help: 'Make this an access port', run: (c) => sp(c, { mode: 'access' }) },
  { modes: ['config-if'], pattern: ['switchport', 'mode', 'trunk'], kinds: SWITCH, help: 'Make this a trunk port', run: (c) => sp(c, { mode: 'trunk' }) },
  { modes: ['config-if'], pattern: ['switchport', 'access', 'vlan', '<num>'], kinds: SWITCH, help: 'Assign the access VLAN', run: (c, [v]) => {
    const vlan = Number(v);
    if (vlan < 1 || vlan > 4094) throw new SimError('% VLAN must be 1-4094');
    const created = !c.dev.vlans?.some((x) => x.id === vlan);
    if (created) addVlan(c.net, c.dev.id, vlan);
    sp(c, { accessVlan: vlan });
    // IOS auto-creates the VLAN in this case and prints this message
    if (created) return `% Access VLAN does not exist. Creating vlan ${vlan}`;
  } },
  { modes: ['config-if'], pattern: ['switchport', 'trunk', 'native', 'vlan', '<num>'], kinds: SWITCH, help: 'Set the native (untagged) VLAN', run: (c, [v]) => sp(c, { nativeVlan: Number(v) }) },
  { modes: ['config-if'], pattern: ['switchport', 'trunk', 'allowed', 'vlan', 'all'], kinds: SWITCH, run: (c) => sp(c, { allowedVlans: 'all' }) },
  { modes: ['config-if'], pattern: ['switchport', 'trunk', 'allowed', 'vlan', 'add', '<vlans>'], kinds: SWITCH, run: (c, [l]) => {
    const cur = currentIface(c).switchport!.allowedVlans;
    if (cur === 'all') return;
    sp(c, { allowedVlans: [...new Set([...cur, ...parseVlanList(l)!])].sort((a, b) => a - b) });
  } },
  { modes: ['config-if'], pattern: ['switchport', 'trunk', 'allowed', 'vlan', 'remove', '<vlans>'], kinds: SWITCH, run: (c, [l]) => {
    const cur = currentIface(c).switchport!.allowedVlans;
    const rm = new Set(parseVlanList(l)!);
    const base = cur === 'all' ? Array.from({ length: 4094 }, (_, k) => k + 1) : cur;
    sp(c, { allowedVlans: base.filter((v) => !rm.has(v)) });
  } },
  { modes: ['config-if'], pattern: ['switchport', 'trunk', 'allowed', 'vlan', '<vlans>'], kinds: SWITCH, help: 'Limit VLANs carried by the trunk', run: (c, [l]) => sp(c, { allowedVlans: parseVlanList(l)! }) },
];

function sp(c: Ctx, patch: Partial<NonNullable<Iface['switchport']>>): void {
  const i = currentIface(c);
  i.switchport = { ...i.switchport!, ...patch };
  c.changed = true;
}

function linkMsg(c: Ctx, up: boolean): string | void {
  const i = currentIface(c);
  if (i.parent) return;
  const peer = peerOf(c.net, c.dev.id, i.name);
  const name = longIfaceName(i.name);
  if (!up) return `%LINK-5-CHANGED: Interface ${name}, changed state to administratively down`;
  if (!peer) return `%LINK-5-CHANGED: Interface ${name}, changed state to down  (no cable connected)`;
  if (!peer.iface.adminUp) return `%LINK-5-CHANGED: Interface ${name}, changed state to down  (${peer.device.name} ${peer.iface.name} is shut down)`;
  return `%LINK-5-CHANGED: Interface ${name}, changed state to up\n%LINEPROTO-5-UPDOWN: Line protocol on Interface ${name}, changed state to up`;
}

// ---------- matching ----------

function tokenize(line: string): string[] {
  // join "gigabitethernet 0/1" / "fa 0/1" into one token
  return line
    .trim()
    .replace(/\b(f|fa|fas|fast\w*|g|gi|gig\w*)\s+(\d+\/\d+(?:\.\d+)?)\b/gi, '$1$2')
    .split(/\s+/)
    .filter(Boolean);
}

type MatchResult =
  | { ok: true; cmd: Cmd; args: string[] }
  | { ok: false; error: 'invalid'; pos: number }
  | { ok: false; error: 'incomplete' | 'ambiguous' };

function available(dev: Device, mode: IosMode): Cmd[] {
  return COMMANDS.filter((c) => c.modes.includes(mode) && (!c.kinds || c.kinds.includes(dev.kind)));
}

function match(cmds: Cmd[], tokens: string[]): MatchResult {
  let cands = cmds;
  let restMatch: { cmd: Cmd; at: number } | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const lower = t.toLowerCase();
    const rest = cands.find((c) => c.pattern[i] === '<rest>');
    if (rest && !restMatch) restMatch = { cmd: rest, at: i };
    const kw = cands.filter((c) => c.pattern[i] && !isParam(c.pattern[i]));
    const exact = kw.filter((c) => c.pattern[i] === lower);
    let kwSurv = exact;
    let ambiguous = false;
    if (!exact.length) {
      kwSurv = kw.filter((c) => c.pattern[i].startsWith(lower));
      ambiguous = new Set(kwSurv.map((c) => c.pattern[i])).size > 1;
    }
    const paramSurv = cands.filter((c) => c.pattern[i] && isParam(c.pattern[i]) && c.pattern[i] !== '<rest>' && PARAM[c.pattern[i]](t));
    if (ambiguous && !paramSurv.length) return { ok: false, error: 'ambiguous' };
    const surv = [...(ambiguous ? [] : kwSurv), ...paramSurv];
    if (!surv.length) {
      if (restMatch) break;
      return { ok: false, error: 'invalid', pos: i };
    }
    cands = surv;
  }
  const complete = cands.find((c) => c.pattern.length === tokens.length);
  const pick = complete ?? (restMatch && tokens.length > restMatch.at ? restMatch.cmd : undefined);
  if (!pick) return { ok: false, error: cands.length ? 'incomplete' : 'invalid', pos: tokens.length } as MatchResult;
  const args: string[] = [];
  pick.pattern.forEach((p, i) => {
    if (p === '<rest>') args.push(tokens.slice(i).join(' '));
    else if (isParam(p)) args.push(tokens[i]);
  });
  return { ok: true, cmd: pick, args };
}

function helpFor(dev: Device, mode: IosMode, line: string): string {
  const endsWithSpace = /\s$/.test(line);
  const tokens = tokenize(line);
  const partial = endsWithSpace || !tokens.length ? '' : tokens.pop()!.toLowerCase();
  const n = tokens.length;
  const cmds = available(dev, mode).filter((c) => {
    if (c.pattern.length <= n) return false;
    return tokens.every((t, i) => (isParam(c.pattern[i]) ? PARAM[c.pattern[i]](t) : c.pattern[i].startsWith(t.toLowerCase())));
  });
  const seen = new Map<string, string>();
  for (const c of cmds) {
    const next = c.pattern[n];
    if (!next.startsWith(partial) && !isParam(next)) continue;
    if (!seen.has(next)) seen.set(next, n === 0 ? (c.help ?? '') : c.pattern.length === n + 1 ? (c.help ?? '') : '');
  }
  if (!seen.size) return '% Unrecognized command';
  return [...seen].map(([k, h]) => `  ${pad(k, 22)}${h}`).join('\n');
}

export function iosPrompt(net: Network, s: IosSession): string {
  const d = getDevice(net, s.deviceId);
  switch (s.mode) {
    case 'user':
      return `${d.name}>`;
    case 'priv':
      return `${d.name}#`;
    case 'config':
      return `${d.name}(config)#`;
    case 'config-if':
      return s.iface?.includes('.') ? `${d.name}(config-subif)#` : `${d.name}(config-if)#`;
    case 'config-vlan':
      return `${d.name}(config-vlan)#`;
  }
}

/** Executes one line. MUTATES `net` and `session`. */
export function runIos(net: Network, session: IosSession, rawLine: string): CliResult {
  const dev = getDevice(net, session.deviceId);
  const line = rawLine.replace(/\t/g, ' ');
  if (!line.trim()) return { output: '', changed: false };
  if (line.trim().endsWith('?')) return { output: helpFor(dev, session.mode, line.trim().slice(0, -1)), changed: false };

  let tokens = tokenize(line);
  let mode = session.mode;
  // "do <exec command>" from configuration modes
  if (mode.startsWith('config') && tokens[0]?.toLowerCase() === 'do' && tokens.length > 1) {
    tokens = tokens.slice(1);
    mode = 'priv';
  }
  const m = match(available(dev, mode), tokens);
  if (!m.ok) {
    if (m.error === 'ambiguous') return { output: `% Ambiguous command:  "${line.trim()}"`, changed: false };
    if (m.error === 'incomplete') return { output: '% Incomplete command.', changed: false };
    const prompt = iosPrompt(net, session);
    const offset = prompt.length + line.indexOf(tokens['pos' in m ? m.pos : tokens.length] ?? '');
    return { output: `${' '.repeat(Math.max(0, offset))}^\n% Invalid input detected at '^' marker.`, changed: false };
  }
  const ctx: Ctx = { net, s: session, dev, changed: false };
  try {
    const out = m.cmd.run(ctx, m.args);
    return { output: out ?? '', changed: ctx.changed, events: ctx.events };
  } catch (e) {
    if (e instanceof SimError || e instanceof Error) return { output: e.message.startsWith('%') ? e.message : `% ${e.message}`, changed: false };
    throw e;
  }
}
