// Compact, human-authored topology format used by curriculum content and tests.
import type { DeviceKind, Network } from './types';
import {
  addDevice,
  addStaticRoute,
  addSubinterface,
  addVlan,
  connect,
  createNetwork,
  getDevice,
  getIface,
  setGateway,
  setIfaceIp,
  setSwitchport,
} from './network';
import { parseCidr } from './ip';

export interface IfaceSpec {
  /** CIDR "192.168.1.1/24" */
  ip?: string;
  up?: boolean;
  mode?: 'access' | 'trunk';
  vlan?: number;
  allowed?: number[] | 'all';
  native?: number;
  dot1q?: number;
  description?: string;
}

export interface DeviceSpec {
  id: string;
  kind: DeviceKind;
  name?: string;
  x: number;
  y: number;
  /** Hosts: CIDR on the single NIC */
  ip?: string;
  gateway?: string;
  interfaces?: Record<string, IfaceSpec>;
  /** Switch VLAN database: { "10": "SALES" } */
  vlans?: Record<string, string>;
  /** Routers: "10.0.0.0/8 via 192.168.1.2" or "0.0.0.0/0 via Gi0/1" */
  routes?: string[];
}

export interface TopologySpec {
  devices: DeviceSpec[];
  /** [deviceA, ifaceA, deviceB, ifaceB] */
  links: [string, string, string, string][];
}

function cidr(s: string): { ip: string; prefix: number } {
  const c = parseCidr(s);
  if (!c) throw new Error(`Invalid CIDR ${s}`);
  return c;
}

export function buildNetwork(spec: TopologySpec): Network {
  const net = createNetwork();
  for (const d of spec.devices) {
    addDevice(net, d.kind, { id: d.id, name: d.name, x: d.x, y: d.y });
  }
  for (const d of spec.devices) {
    const dev = getDevice(net, d.id);
    if (d.vlans) for (const [id, name] of Object.entries(d.vlans)) addVlan(net, d.id, Number(id), name);
    if (d.ip) {
      const c = cidr(d.ip);
      setIfaceIp(net, d.id, dev.interfaces[0].name, c.ip, c.prefix);
    }
    if (d.gateway) setGateway(net, d.id, d.gateway);
    for (const [name, cfg] of Object.entries(d.interfaces ?? {})) {
      const iface = name.includes('.') ? addSubinterface(net, d.id, name) : getIface(dev, name);
      if (iface.parent) iface.dot1q = cfg.dot1q ?? Number(iface.name.split('.')[1]);
      if (cfg.ip) {
        const c = cidr(cfg.ip);
        setIfaceIp(net, d.id, iface.name, c.ip, c.prefix);
      }
      if (cfg.up !== undefined) iface.adminUp = cfg.up;
      if (cfg.description) iface.description = cfg.description;
      if (cfg.mode || cfg.vlan !== undefined || cfg.allowed || cfg.native !== undefined) {
        setSwitchport(net, d.id, iface.name, {
          ...(cfg.mode ? { mode: cfg.mode } : {}),
          ...(cfg.vlan !== undefined ? { accessVlan: cfg.vlan } : {}),
          ...(cfg.allowed ? { allowedVlans: cfg.allowed } : {}),
          ...(cfg.native !== undefined ? { nativeVlan: cfg.native } : {}),
        });
      }
    }
    for (const r of d.routes ?? []) {
      const m = r.match(/^(\S+)\s+via\s+(\S+)$/);
      if (!m) throw new Error(`Invalid route "${r}"`);
      const c = cidr(m[1]);
      const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(m[2]);
      addStaticRoute(net, d.id, isIp ? { network: c.ip, prefix: c.prefix, nextHop: m[2] } : { network: c.ip, prefix: c.prefix, exitIface: getIface(dev, m[2]).name });
    }
  }
  for (const [a, ai, b, bi] of spec.links) connect(net, a, b, ai, bi);
  return net;
}
