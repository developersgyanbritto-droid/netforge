// Static analysis of a network configuration that explains *why* something will fail.
// Used for error-based learning: labs surface these as guidance instead of "wrong".
import type { Device, Network } from './types';
import { HOST_KINDS } from './types';
import { linkOf, peerOf } from './network';
import { broadcastNum, inSubnet, ipToNum, networkNum, numToIp } from './ip';
import { buildRoutingTable } from './routing';

export type Severity = 'error' | 'warning' | 'info';

export interface Issue {
  code: string;
  severity: Severity;
  deviceId?: string;
  iface?: string;
  message: string;
}

const netStr = (ip: string, prefix: number) => `${numToIp(networkNum(ipToNum(ip), prefix))}/${prefix}`;

export function diagnose(net: Network): Issue[] {
  const issues: Issue[] = [];
  const add = (i: Issue) => issues.push(i);
  const isHost = (d: Device) => HOST_KINDS.includes(d.kind);

  // Duplicate IPs
  const owners = new Map<string, string[]>();
  for (const d of net.devices)
    for (const i of d.interfaces) if (i.ip) owners.set(i.ip, [...(owners.get(i.ip) ?? []), d.name]);
  for (const [ip, names] of owners)
    if (names.length > 1)
      add({ code: 'duplicate-ip', severity: 'error', message: `${ip} is configured on more than one device (${names.join(', ')}). Every IP address on a network must be unique, otherwise ARP replies conflict.` });

  for (const d of net.devices) {
    if (!net.links.some((l) => l.a.device === d.id || l.b.device === d.id))
      add({ code: 'isolated', severity: 'info', deviceId: d.id, message: `${d.name} is not connected to anything.` });

    if (isHost(d)) {
      const nic = d.interfaces[0];
      if (!nic.ip || nic.prefix === undefined) {
        add({ code: 'host-no-ip', severity: 'warning', deviceId: d.id, iface: nic.name, message: `${d.name} has no IP address, so it cannot communicate using IP.` });
        continue;
      }
      if (nic.prefix <= 30) {
        const n = ipToNum(nic.ip);
        if (n === networkNum(n, nic.prefix))
          add({ code: 'host-network-address', severity: 'error', deviceId: d.id, message: `${d.name} uses ${nic.ip}, which is the network address of ${netStr(nic.ip, nic.prefix)}. The first address identifies the network itself and cannot be assigned to a host.` });
        if (n === broadcastNum(n, nic.prefix))
          add({ code: 'host-broadcast-address', severity: 'error', deviceId: d.id, message: `${d.name} uses ${nic.ip}, the broadcast address of ${netStr(nic.ip, nic.prefix)}. The last address is reserved for broadcasts.` });
      }
      if (!d.gateway) {
        add({ code: 'host-no-gateway', severity: 'info', deviceId: d.id, message: `${d.name} has no default gateway: it can reach devices in ${netStr(nic.ip, nic.prefix)} only.` });
      } else if (!inSubnet(d.gateway, nic.ip, nic.prefix)) {
        add({ code: 'gateway-outside-subnet', severity: 'error', deviceId: d.id, message: `${d.name} belongs to ${netStr(nic.ip, nic.prefix)}, but its gateway ${d.gateway} belongs to ${netStr(d.gateway, nic.prefix)}. The gateway must be an address inside the host's own network.` });
      } else if (!owners.has(d.gateway)) {
        add({ code: 'gateway-missing', severity: 'warning', deviceId: d.id, message: `${d.name}'s gateway ${d.gateway} is not configured on any device. Configure that address on the router interface facing this network.` });
      }
    }

    if (d.kind === 'router') {
      const withIp = d.interfaces.filter((i) => i.ip && i.prefix !== undefined);
      for (const i of withIp) {
        if (!i.adminUp)
          add({ code: 'iface-shutdown', severity: 'warning', deviceId: d.id, iface: i.name, message: `${d.name} ${i.name} has IP ${i.ip} but is administratively down. Router interfaces start shut down — use "no shutdown".` });
        else if (!i.parent && !linkOf(net, d.id, i.name))
          add({ code: 'iface-unplugged', severity: 'warning', deviceId: d.id, iface: i.name, message: `${d.name} ${i.name} has an IP address but no cable, so its connected route is not installed.` });
        if (i.parent && i.dot1q === undefined)
          add({ code: 'subif-no-encap', severity: 'error', deviceId: d.id, iface: i.name, message: `${d.name} ${i.name} has no "encapsulation dot1Q <vlan>" — the router cannot tell which VLAN it belongs to.` });
      }
      for (let a = 0; a < withIp.length; a++)
        for (let b = a + 1; b < withIp.length; b++) {
          const x = withIp[a];
          const y = withIp[b];
          const p = Math.min(x.prefix!, y.prefix!);
          if (inSubnet(x.ip!, y.ip!, p))
            add({ code: 'overlapping-subnets', severity: 'error', deviceId: d.id, message: `${d.name} has overlapping networks on ${x.name} (${netStr(x.ip!, x.prefix!)}) and ${y.name} (${netStr(y.ip!, y.prefix!)}). Each router interface must be in a different network.` });
        }
      const table = buildRoutingTable(net, d);
      for (const r of d.staticRoutes ?? []) {
        if (r.nextHop && !table.some((t) => t.code.startsWith('S') && t.network === r.network && t.prefix === r.prefix))
          add({ code: 'route-unresolvable', severity: 'warning', deviceId: d.id, message: `${d.name}'s static route to ${r.network}/${r.prefix} via ${r.nextHop} is not used: the next hop is not in any of its connected (up) networks.` });
        if (r.nextHop && withIp.some((i) => i.ip === r.nextHop))
          add({ code: 'route-self-nexthop', severity: 'error', deviceId: d.id, message: `${d.name}'s route to ${r.network}/${r.prefix} points to its own address ${r.nextHop}. The next hop must be the neighbouring router's address.` });
      }
    }

    if (d.kind === 'switch') {
      const vlanIds = new Set((d.vlans ?? []).map((v) => v.id));
      for (const p of d.interfaces) {
        const sp = p.switchport;
        if (!sp) continue;
        const peer = peerOf(net, d.id, p.name);
        if (sp.mode === 'access' && !vlanIds.has(sp.accessVlan) && peer)
          add({ code: 'vlan-missing', severity: 'error', deviceId: d.id, iface: p.name, message: `${d.name} ${p.name} is assigned to VLAN ${sp.accessVlan}, but VLAN ${sp.accessVlan} does not exist on ${d.name}. Create it with "vlan ${sp.accessVlan}".` });
        if (!peer) continue;
        if (!p.adminUp)
          add({ code: 'port-shutdown', severity: 'warning', deviceId: d.id, iface: p.name, message: `${d.name} ${p.name} is shut down, so ${peer.device.name} is disconnected.` });
        if (peer.device.kind === 'switch' && peer.iface.switchport) {
          const ps = peer.iface.switchport;
          if (d.id < peer.device.id) {
            if (sp.mode !== ps.mode)
              add({ code: 'trunk-mode-mismatch', severity: 'warning', deviceId: d.id, iface: p.name, message: `The link ${d.name} ${p.name} (${sp.mode}) ↔ ${peer.device.name} ${peer.iface.name} (${ps.mode}) has mismatched modes. Links between switches carrying several VLANs should be trunks on both ends.` });
            else if (sp.mode === 'trunk' && sp.nativeVlan !== ps.nativeVlan)
              add({ code: 'native-vlan-mismatch', severity: 'warning', deviceId: d.id, iface: p.name, message: `Native VLAN mismatch on ${d.name} ${p.name} (${sp.nativeVlan}) ↔ ${peer.device.name} ${peer.iface.name} (${ps.nativeVlan}). Untagged traffic will leak between VLANs.` });
          }
        }
        if (peer.device.kind === 'router') {
          const hasSubifs = peer.device.interfaces.some((i) => i.parent === peer.iface.name);
          if (hasSubifs && sp.mode === 'access')
            add({ code: 'router-on-stick-access', severity: 'error', deviceId: d.id, iface: p.name, message: `${peer.device.name} uses 802.1Q sub-interfaces on ${peer.iface.name}, so ${d.name} ${p.name} must be a trunk ("switchport mode trunk").` });
        }
        if (sp.mode === 'trunk' && sp.allowedVlans !== 'all') {
          const missing = [...vlanIds].filter((v) => v !== 1 && !(sp.allowedVlans as number[]).includes(v));
          if (missing.length)
            add({ code: 'trunk-vlan-pruned', severity: 'info', deviceId: d.id, iface: p.name, message: `Trunk ${d.name} ${p.name} does not allow VLAN(s) ${missing.join(', ')}.` });
        }
      }
    }
  }

  const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}
