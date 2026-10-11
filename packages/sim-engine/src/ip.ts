// IPv4 arithmetic. Addresses are handled as unsigned 32-bit numbers internally and as
// dotted-decimal strings at the edges (JSON documents, UI, CLI).

export type IpNum = number;

const OCTET = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

export function isValidIp(s: string): boolean {
  const parts = s.trim().split('.');
  return parts.length === 4 && parts.every((p) => OCTET.test(p));
}

export function ipToNum(s: string): IpNum {
  if (!isValidIp(s)) throw new Error(`Invalid IPv4 address: ${s}`);
  return s
    .trim()
    .split('.')
    .reduce((acc, p) => ((acc << 8) | Number(p)) >>> 0, 0);
}

export function numToIp(n: IpNum): string {
  return [24, 16, 8, 0].map((sh) => (n >>> sh) & 255).join('.');
}

export function prefixToMaskNum(prefix: number): IpNum {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw new Error(`Invalid prefix /${prefix}`);
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

export function prefixToMask(prefix: number): string {
  return numToIp(prefixToMaskNum(prefix));
}

/** Returns the prefix length for a dotted mask, or null if the mask is not contiguous. */
export function maskToPrefix(mask: string): number | null {
  if (!isValidIp(mask)) return null;
  const n = ipToNum(mask);
  const inv = ~n >>> 0;
  // contiguous mask => inverted mask + 1 is a power of two
  if (((inv + 1) & inv) >>> 0 !== 0) return null;
  let bits = 0;
  for (let i = 31; i >= 0; i--) if ((n >>> i) & 1) bits++;
  return bits;
}

export function networkNum(ip: IpNum, prefix: number): IpNum {
  return (ip & prefixToMaskNum(prefix)) >>> 0;
}

export function broadcastNum(ip: IpNum, prefix: number): IpNum {
  return (networkNum(ip, prefix) | (~prefixToMaskNum(prefix) >>> 0)) >>> 0;
}

export function sameSubnet(a: string, b: string, prefix: number): boolean {
  return networkNum(ipToNum(a), prefix) === networkNum(ipToNum(b), prefix);
}

export function inSubnet(ip: string, network: string, prefix: number): boolean {
  return networkNum(ipToNum(ip), prefix) === networkNum(ipToNum(network), prefix);
}

export function hostCount(prefix: number): number {
  if (prefix >= 31) return prefix === 31 ? 2 : 1; // RFC 3021 point-to-point, /32 host route
  return 2 ** (32 - prefix) - 2;
}

export interface SubnetInfo {
  address: string;
  prefix: number;
  mask: string;
  wildcard: string;
  network: string;
  broadcast: string;
  firstHost: string | null;
  lastHost: string | null;
  usableHosts: number;
  totalAddresses: number;
  addressType: AddressType;
  isNetworkAddress: boolean;
  isBroadcastAddress: boolean;
}

export function subnetInfo(address: string, prefix: number): SubnetInfo {
  const ip = ipToNum(address);
  const net = networkNum(ip, prefix);
  const bc = broadcastNum(ip, prefix);
  const total = 2 ** (32 - prefix);
  const hasHosts = prefix <= 30;
  return {
    address,
    prefix,
    mask: prefixToMask(prefix),
    wildcard: numToIp(~prefixToMaskNum(prefix) >>> 0),
    network: numToIp(net),
    broadcast: numToIp(bc),
    firstHost: hasHosts ? numToIp(net + 1) : prefix === 31 ? numToIp(net) : numToIp(net),
    lastHost: hasHosts ? numToIp(bc - 1) : prefix === 31 ? numToIp(bc) : numToIp(net),
    usableHosts: hostCount(prefix),
    totalAddresses: total,
    addressType: classifyIp(address),
    isNetworkAddress: prefix <= 30 && ip === net,
    isBroadcastAddress: prefix <= 30 && ip === bc,
  };
}

export type AddressType =
  | 'private'
  | 'public'
  | 'loopback'
  | 'apipa'
  | 'multicast'
  | 'broadcast'
  | 'unspecified'
  | 'reserved'
  | 'cgnat';

export function classifyIp(address: string): AddressType {
  const n = ipToNum(address);
  const inR = (net: string, p: number) => networkNum(n, p) === ipToNum(net);
  if (n === 0) return 'unspecified';
  if (n === 0xffffffff) return 'broadcast';
  if (inR('127.0.0.0', 8)) return 'loopback';
  if (inR('169.254.0.0', 16)) return 'apipa';
  if (inR('224.0.0.0', 4)) return 'multicast';
  if (inR('240.0.0.0', 4) || inR('0.0.0.0', 8)) return 'reserved';
  if (inR('10.0.0.0', 8) || inR('172.16.0.0', 12) || inR('192.168.0.0', 16)) return 'private';
  if (inR('100.64.0.0', 10)) return 'cgnat';
  return 'public';
}

/** Classful class letter — historical, taught for context only. */
export function ipClass(address: string): 'A' | 'B' | 'C' | 'D' | 'E' {
  const first = ipToNum(address) >>> 24;
  if (first < 128) return 'A';
  if (first < 192) return 'B';
  if (first < 224) return 'C';
  if (first < 240) return 'D';
  return 'E';
}

export function toBinary(address: string, groupDots = true): string {
  const s = ipToNum(address).toString(2).padStart(32, '0');
  return groupDots ? s.match(/.{8}/g)!.join('.') : s;
}

/** Split a network into 2^bits equal subnets. */
export function splitSubnet(network: string, prefix: number, newPrefix: number): { network: string; prefix: number }[] {
  if (newPrefix < prefix || newPrefix > 32) throw new Error('New prefix must be longer than the original');
  const base = networkNum(ipToNum(network), prefix);
  const count = 2 ** (newPrefix - prefix);
  if (count > 4096) throw new Error('Too many subnets to list');
  const size = 2 ** (32 - newPrefix);
  return Array.from({ length: count }, (_, i) => ({ network: numToIp((base + i * size) >>> 0), prefix: newPrefix }));
}

/** Smallest prefix able to hold `hosts` usable addresses. */
export function prefixForHosts(hosts: number): number {
  for (let p = 30; p >= 0; p--) if (hostCount(p) >= hosts) return p;
  return 0;
}

/** Smallest number of borrowed bits giving at least `subnets` subnets. */
export function bitsForSubnets(subnets: number): number {
  let b = 0;
  while (2 ** b < subnets) b++;
  return b;
}

export interface VlsmRequest {
  name: string;
  hosts: number;
}
export interface VlsmAllocation extends VlsmRequest {
  network: string;
  prefix: number;
  firstHost: string;
  lastHost: string;
  broadcast: string;
  usable: number;
}

/** Variable-length subnet allocation, largest requirement first. Throws when space runs out. */
export function vlsm(network: string, prefix: number, reqs: VlsmRequest[]): VlsmAllocation[] {
  const start = networkNum(ipToNum(network), prefix);
  const end = broadcastNum(start, prefix);
  let cursor = start;
  const sorted = [...reqs].sort((a, b) => b.hosts - a.hosts);
  return sorted.map((r) => {
    const p = prefixForHosts(r.hosts);
    const size = 2 ** (32 - p);
    // align cursor to the block size
    if (cursor % size !== 0) cursor = Math.ceil(cursor / size) * size;
    const bc = cursor + size - 1;
    if (bc > end) throw new Error(`Not enough address space for ${r.name} (${r.hosts} hosts)`);
    const alloc: VlsmAllocation = {
      ...r,
      network: numToIp(cursor >>> 0),
      prefix: p,
      firstHost: numToIp((cursor + 1) >>> 0),
      lastHost: numToIp((bc - 1) >>> 0),
      broadcast: numToIp(bc >>> 0),
      usable: hostCount(p),
    };
    cursor = bc + 1;
    return alloc;
  });
}

/** Parses "a.b.c.d/nn" or "a.b.c.d m.m.m.m". */
export function parseCidr(s: string): { ip: string; prefix: number } | null {
  const t = s.trim();
  const slash = t.match(/^(\S+)\/(\d{1,2})$/);
  if (slash) {
    const prefix = Number(slash[2]);
    if (isValidIp(slash[1]) && prefix >= 0 && prefix <= 32) return { ip: slash[1], prefix };
    return null;
  }
  const sp = t.split(/\s+/);
  if (sp.length === 2 && isValidIp(sp[0])) {
    const prefix = maskToPrefix(sp[1]);
    if (prefix !== null) return { ip: sp[0], prefix };
  }
  return null;
}
