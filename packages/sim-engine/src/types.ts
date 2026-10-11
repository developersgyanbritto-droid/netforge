export type DeviceKind = 'pc' | 'laptop' | 'server' | 'switch' | 'router';

export const L3_KINDS: readonly DeviceKind[] = ['pc', 'laptop', 'server', 'router'];
export const HOST_KINDS: readonly DeviceKind[] = ['pc', 'laptop', 'server'];

export interface SwitchportConfig {
  mode: 'access' | 'trunk';
  accessVlan: number;
  /** 'all' or an explicit list of VLAN ids */
  allowedVlans: 'all' | number[];
  nativeVlan: number;
}

export interface Iface {
  /** Short canonical name: Fa0, Fa0/1, Gi0/0, Gi0/0.10 */
  name: string;
  mac: string;
  adminUp: boolean;
  description?: string;
  ip?: string;
  prefix?: number;
  /** Switch ports only */
  switchport?: SwitchportConfig;
  /** Router sub-interfaces only */
  parent?: string;
  dot1q?: number;
}

export interface StaticRoute {
  network: string;
  prefix: number;
  /** Next-hop IP or exit interface name */
  nextHop?: string;
  exitIface?: string;
}

export interface ArpEntry {
  ip: string;
  mac: string;
  iface: string;
}

export interface MacEntry {
  mac: string;
  vlan: number;
  port: string;
}

export interface Device {
  id: string;
  name: string;
  kind: DeviceKind;
  x: number;
  y: number;
  interfaces: Iface[];
  /** Hosts */
  gateway?: string;
  /** Routers */
  staticRoutes?: StaticRoute[];
  /** Switches: VLAN database */
  vlans?: { id: number; name: string }[];
  /** Runtime state (learned by simulation) */
  arp?: ArpEntry[];
  macTable?: MacEntry[];
}

export interface LinkEnd {
  device: string;
  iface: string;
}

export interface Link {
  id: string;
  a: LinkEnd;
  b: LinkEnd;
}

export interface Network {
  version: 1;
  devices: Device[];
  links: Link[];
  macCounter: number;
  idCounter: number;
}

// ---------- Frames & packets ----------

export interface ArpPacket {
  op: 'request' | 'reply';
  senderMac: string;
  senderIp: string;
  targetMac: string;
  targetIp: string;
}

export type IcmpType = 'echo-request' | 'echo-reply' | 'time-exceeded' | 'dest-unreachable';

export interface IpPacket {
  src: string;
  dst: string;
  ttl: number;
  protocol: 'icmp';
  icmp: { type: IcmpType; id: number; seq: number; reason?: string };
}

export interface Frame {
  srcMac: string;
  dstMac: string;
  /** 802.1Q tag, only present on trunk links */
  vlan?: number;
  etherType: 'ARP' | 'IPv4';
  arp?: ArpPacket;
  ip?: IpPacket;
}

export const BROADCAST_MAC = 'ffff.ffff.ffff';

export type SimEventKind =
  | 'frame' // a frame crosses a link (animatable)
  | 'arp'
  | 'learn'
  | 'flood'
  | 'forward'
  | 'route'
  | 'deliver'
  | 'drop'
  | 'info'
  | 'storm';

export interface SimEvent {
  seq: number;
  tick: number;
  kind: SimEventKind;
  deviceId?: string;
  linkId?: string;
  from?: LinkEnd;
  to?: LinkEnd;
  frame?: Frame;
  layer?: 2 | 3;
  message: string;
}

export type PingStatus = 'success' | 'timeout' | 'unreachable' | 'ttl-exceeded' | 'error';

export interface PingResult {
  seq: number;
  status: PingStatus;
  /** For unreachable / ttl-exceeded: who reported it */
  from?: string;
  /** Plain-language explanation of what happened */
  reason?: string;
  hops?: number;
}
