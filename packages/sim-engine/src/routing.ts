import type { Device, Iface, Network } from './types';
import { findIface, ifaceOperUp } from './network';
import { inSubnet, ipToNum, networkNum, numToIp } from './ip';

export interface RouteEntry {
  code: 'C' | 'L' | 'S' | 'S*';
  network: string;
  prefix: number;
  ad: number;
  nextHop?: string;
  iface?: string;
}

/** Routing table as the router would install it (only usable routes appear). */
export function buildRoutingTable(net: Network, router: Device): RouteEntry[] {
  const table: RouteEntry[] = [];
  for (const i of router.interfaces) {
    if (!i.ip || i.prefix === undefined || !ifaceOperUp(net, router, i)) continue;
    table.push({ code: 'C', network: numToIp(networkNum(ipToNum(i.ip), i.prefix)), prefix: i.prefix, ad: 0, iface: i.name });
    if (i.prefix < 32) table.push({ code: 'L', network: i.ip, prefix: 32, ad: 0, iface: i.name });
  }
  const connected = [...table];
  for (const r of router.staticRoutes ?? []) {
    const code = r.prefix === 0 ? 'S*' : 'S';
    if (r.exitIface) {
      const out = findIface(router, r.exitIface);
      if (out && ifaceOperUp(net, router, out)) table.push({ code, network: r.network, prefix: r.prefix, ad: 1, iface: out.name, nextHop: r.nextHop });
      continue;
    }
    if (r.nextHop && resolveRecursive(router, connected, router.staticRoutes ?? [], r.nextHop, 0)) {
      table.push({ code, network: r.network, prefix: r.prefix, ad: 1, nextHop: r.nextHop });
    }
  }
  return table.sort((a, b) => ipToNum(a.network) - ipToNum(b.network) || a.prefix - b.prefix);
}

function resolveRecursive(
  router: Device,
  connected: RouteEntry[],
  statics: NonNullable<Device['staticRoutes']>,
  ip: string,
  depth: number,
): boolean {
  if (depth > 4) return false;
  if (connected.some((c) => c.code === 'C' && inSubnet(ip, c.network, c.prefix))) return true;
  const via = statics
    .filter((s) => s.nextHop && s.nextHop !== ip && inSubnet(ip, s.network, s.prefix))
    .sort((a, b) => b.prefix - a.prefix)[0];
  return !!via && resolveRecursive(router, connected, statics, via.nextHop!, depth + 1);
}

/** Longest-prefix match; ties broken by administrative distance. */
export function lookup(table: RouteEntry[], dst: string): RouteEntry | undefined {
  let best: RouteEntry | undefined;
  for (const e of table) {
    if (e.code === 'L') continue;
    if (!inSubnet(dst, e.network, e.prefix)) continue;
    if (!best || e.prefix > best.prefix || (e.prefix === best.prefix && e.ad < best.ad)) best = e;
  }
  return best;
}

export interface ForwardDecision {
  iface: Iface;
  nextHop: string;
  route?: RouteEntry;
}

export type RouteResult = { ok: true; decision: ForwardDecision } | { ok: false; reason: string };

/** Where would this L3 device send a packet for `dst`? */
export function routeFor(net: Network, device: Device, dst: string): RouteResult {
  if (device.kind === 'router') {
    const table = buildRoutingTable(net, device);
    let entry = lookup(table, dst);
    if (!entry) {
      return {
        ok: false,
        reason: `${device.name} has no route to ${dst}. Its routing table has no matching network and no default route (0.0.0.0/0).`,
      };
    }
    const first = entry;
    let nextHop = entry.code === 'C' ? dst : (entry.nextHop ?? dst);
    // resolve recursive next hops down to a connected network
    for (let depth = 0; !entry.iface && depth < 5; depth++) {
      const via = lookup(table, entry.nextHop!);
      if (!via) return { ok: false, reason: `${device.name} cannot reach next hop ${entry.nextHop}` };
      if (via.code === 'C') {
        entry = { ...entry, iface: via.iface };
        break;
      }
      nextHop = via.nextHop ?? nextHop;
      entry = via;
    }
    const iface = entry.iface ? findIface(device, entry.iface) : undefined;
    if (!iface) return { ok: false, reason: `${device.name} could not resolve an exit interface for ${dst}` };
    return { ok: true, decision: { iface, nextHop, route: first } };
  }

  // End host: one configured NIC (first with an IP)
  const nic = device.interfaces.find((i) => i.ip && i.prefix !== undefined);
  if (!nic) return { ok: false, reason: `${device.name} has no IP address configured, so it cannot send IP packets.` };
  if (!ifaceOperUp(net, device, nic)) {
    return { ok: false, reason: `${device.name}'s network interface ${nic.name} is down (cable unplugged or the other end is shut down).` };
  }
  if (inSubnet(dst, nic.ip!, nic.prefix!)) return { ok: true, decision: { iface: nic, nextHop: dst } };
  if (!device.gateway) {
    return {
      ok: false,
      reason: `${dst} is not in ${device.name}'s local network (${numToIp(networkNum(ipToNum(nic.ip!), nic.prefix!))}/${nic.prefix}) and no default gateway is configured, so ${device.name} has nowhere to send it.`,
    };
  }
  if (!inSubnet(device.gateway, nic.ip!, nic.prefix!)) {
    return {
      ok: false,
      reason: `${device.name}'s default gateway ${device.gateway} is not inside its own network ${numToIp(networkNum(ipToNum(nic.ip!), nic.prefix!))}/${nic.prefix}. A host can only reach a gateway on its local network.`,
    };
  }
  return { ok: true, decision: { iface: nic, nextHop: device.gateway } };
}

export function deviceOwnsIp(device: Device, ip: string): boolean {
  return device.interfaces.some((i) => i.ip === ip);
}
