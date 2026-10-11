import type { Device, Frame, Iface, IpPacket, Link, LinkEnd, Network, PingResult, SimEvent } from './types';
import { BROADCAST_MAC } from './types';
import { getDevice, getIface, peerOf, vlanAllowed } from './network';
import { deviceOwnsIp, routeFor } from './routing';
import { isValidIp } from './ip';

interface Delivery {
  tick: number;
  link: Link;
  from: LinkEnd;
  to: LinkEnd;
  frame: Frame;
}

interface InboxItem {
  deviceId: string;
  packet: IpPacket;
}

export interface SimOptions {
  /** Hard cap on frames processed per run — protects the browser from loops. */
  maxFrames?: number;
}

export function describeFrame(f: Frame): string {
  const tag = f.vlan !== undefined ? ` [802.1Q VLAN ${f.vlan}]` : '';
  if (f.arp) {
    return f.arp.op === 'request'
      ? `ARP request: who has ${f.arp.targetIp}? Tell ${f.arp.senderIp}${tag}`
      : `ARP reply: ${f.arp.senderIp} is at ${f.arp.senderMac}${tag}`;
  }
  if (f.ip) {
    const t = f.ip.icmp.type.replace('-', ' ');
    return `ICMP ${t} ${f.ip.src} → ${f.ip.dst} (TTL ${f.ip.ttl})${tag}`;
  }
  return `Frame ${f.srcMac} → ${f.dstMac}${tag}`;
}

export class Simulator {
  readonly events: SimEvent[] = [];
  readonly inbox: InboxItem[] = [];
  private queue: Delivery[] = [];
  private head = 0;
  private seq = 0;
  private processed = 0;
  private readonly maxFrames: number;
  stormDetected = false;
  /** Packets waiting for ARP resolution, keyed by device|iface|nextHop */
  private pending = new Map<string, { device: Device; iface: Iface; nextHop: string; packets: IpPacket[] }>();
  tick = 0;

  constructor(readonly net: Network, opts: SimOptions = {}) {
    this.maxFrames = opts.maxFrames ?? 3000;
  }

  emit(e: Omit<SimEvent, 'seq' | 'tick'> & { tick?: number }): void {
    this.events.push({ ...e, tick: e.tick ?? this.tick, seq: this.seq++ });
  }

  // ---------- transmission ----------

  private transmit(device: Device, physName: string, frame: Frame, tick: number): void {
    const iface = getIface(device, physName);
    if (!iface.adminUp) {
      this.emit({ kind: 'drop', tick, deviceId: device.id, frame, message: `${device.name} cannot send out ${iface.name}: the interface is administratively down (shutdown).` });
      return;
    }
    const peer = peerOf(this.net, device.id, iface.name);
    if (!peer) {
      this.emit({ kind: 'drop', tick, deviceId: device.id, frame, message: `${device.name} ${iface.name} has no cable connected, so the frame goes nowhere.` });
      return;
    }
    if (!peer.iface.adminUp) {
      this.emit({ kind: 'drop', tick, deviceId: device.id, frame, message: `The link ${device.name} ${iface.name} ↔ ${peer.device.name} ${peer.iface.name} is down because ${peer.device.name} ${peer.iface.name} is shut down.` });
      return;
    }
    const from = { device: device.id, iface: iface.name };
    const to = { device: peer.device.id, iface: peer.iface.name };
    this.queue.push({ tick: tick + 1, link: peer.link, from, to, frame });
    this.emit({ kind: 'frame', tick: tick + 1, linkId: peer.link.id, from, to, frame, deviceId: device.id, message: `${device.name} → ${peer.device.name}: ${describeFrame(frame)}` });
  }

  /** Sends out a logical interface, adding an 802.1Q tag for sub-interfaces. */
  private out(device: Device, logical: Iface, frame: Frame, tick: number): void {
    if (logical.parent) {
      this.transmit(device, logical.parent, { ...frame, vlan: logical.dot1q }, tick);
    } else {
      this.transmit(device, logical.name, frame, tick);
    }
  }

  // ---------- layer 3 send path ----------

  /** Route and send an IP packet originated or forwarded by `device`. Returns false when it could not be sent. */
  sendIp(device: Device, packet: IpPacket, tick: number): boolean {
    const r = routeFor(this.net, device, packet.dst);
    if (!r.ok) {
      this.emit({ kind: 'drop', tick, deviceId: device.id, layer: 3, message: r.reason });
      return false;
    }
    const { iface, nextHop, route } = r.decision;
    if (device.kind === 'router') {
      const via =
        route && route.code !== 'C'
          ? `static route ${route.network}/${route.prefix}${route.nextHop ? ` via ${route.nextHop}` : ''}`
          : `directly connected network`;
      this.emit({ kind: 'route', tick, deviceId: device.id, layer: 3, message: `${device.name} looks up ${packet.dst} in its routing table → ${via}, exit ${iface.name}${nextHop !== packet.dst ? `, next hop ${nextHop}` : ''}.` });
    } else if (nextHop === packet.dst) {
      this.emit({ kind: 'route', tick, deviceId: device.id, layer: 3, message: `${device.name}: ${packet.dst} is in my local network, so I deliver it directly (no router needed).` });
    } else {
      this.emit({ kind: 'route', tick, deviceId: device.id, layer: 3, message: `${device.name}: ${packet.dst} is on a different network, so I send it to my default gateway ${nextHop}.` });
    }
    this.sendVia(device, iface, nextHop, packet, tick);
    return true;
  }

  private sendVia(device: Device, iface: Iface, nextHop: string, packet: IpPacket, tick: number): void {
    const entry = device.arp?.find((e) => e.ip === nextHop && e.iface === iface.name);
    if (entry) {
      this.out(device, iface, { srcMac: iface.mac, dstMac: entry.mac, etherType: 'IPv4', ip: packet }, tick);
      return;
    }
    const key = `${device.id}|${iface.name}|${nextHop}`;
    const waiting = this.pending.get(key);
    if (waiting) {
      waiting.packets.push(packet);
      return;
    }
    this.pending.set(key, { device, iface, nextHop, packets: [packet] });
    this.emit({ kind: 'arp', tick, deviceId: device.id, layer: 2, message: `${device.name} does not know the MAC address of ${nextHop} (not in its ARP cache), so it broadcasts an ARP request and holds the packet.` });
    this.out(
      device,
      iface,
      {
        srcMac: iface.mac,
        dstMac: BROADCAST_MAC,
        etherType: 'ARP',
        arp: { op: 'request', senderMac: iface.mac, senderIp: iface.ip!, targetMac: '0000.0000.0000', targetIp: nextHop },
      },
      tick,
    );
  }

  private learnArp(device: Device, ip: string, mac: string, iface: string): void {
    device.arp ??= [];
    const e = device.arp.find((x) => x.ip === ip && x.iface === iface);
    if (e) e.mac = mac;
    else device.arp.push({ ip, mac, iface });
  }

  // ---------- receive path ----------

  run(): void {
    while (this.head < this.queue.length) {
      if (this.processed >= this.maxFrames) {
        this.stormDetected = true;
        this.emit({
          kind: 'storm',
          message: `Simulation stopped after ${this.maxFrames} frames: frames are circulating endlessly. This is a broadcast storm caused by a switching loop — real networks use Spanning Tree Protocol (STP) to block redundant paths.`,
        });
        this.queue = [];
        this.head = 0;
        break;
      }
      const d = this.queue[this.head++];
      this.processed++;
      this.tick = Math.max(this.tick, d.tick);
      const device = this.net.devices.find((x) => x.id === d.to.device);
      if (!device) continue;
      if (device.kind === 'switch') this.switchReceive(device, d.to.iface, d.frame, d.tick);
      else this.l3Receive(device, d.to.iface, d.frame, d.tick);
    }
    this.queue = [];
    this.head = 0;
    // Anything still waiting on ARP will never be sent (not reported during a storm — misleading).
    for (const p of this.stormDetected ? [] : this.pending.values()) {
      this.emit({
        kind: 'drop',
        deviceId: p.device.id,
        layer: 2,
        message: `${p.device.name} never received an ARP reply for ${p.nextHop}, so the waiting packet is discarded. No reachable device on the ${p.iface.name} segment owns ${p.nextHop} (wrong address, wrong VLAN, or a broken link).`,
      });
    }
    this.pending.clear();
  }

  private switchReceive(sw: Device, portName: string, frame: Frame, tick: number): void {
    const port = getIface(sw, portName);
    const sp = port.switchport!;
    let vlan: number;
    if (sp.mode === 'access') {
      if (frame.vlan !== undefined) {
        this.emit({ kind: 'drop', tick, deviceId: sw.id, layer: 2, frame, message: `${sw.name} ${port.name} is an access port but received a frame tagged for VLAN ${frame.vlan}. Access ports expect untagged frames — the other end is probably a trunk while this side is not.` });
        return;
      }
      vlan = sp.accessVlan;
    } else {
      vlan = frame.vlan ?? sp.nativeVlan;
      if (!vlanAllowed(sp, vlan)) {
        this.emit({ kind: 'drop', tick, deviceId: sw.id, layer: 2, frame, message: `${sw.name} drops the frame: VLAN ${vlan} is not in the allowed VLAN list of trunk ${port.name}.` });
        return;
      }
    }
    if (!sw.vlans?.some((v) => v.id === vlan)) {
      this.emit({ kind: 'drop', tick, deviceId: sw.id, layer: 2, frame, message: `${sw.name} drops the frame: VLAN ${vlan} does not exist in its VLAN database. Create it with "vlan ${vlan}".` });
      return;
    }

    // MAC learning
    sw.macTable ??= [];
    const known = sw.macTable.find((e) => e.mac === frame.srcMac && e.vlan === vlan);
    if (!known) {
      sw.macTable.push({ mac: frame.srcMac, vlan, port: port.name });
      this.emit({ kind: 'learn', tick, deviceId: sw.id, layer: 2, message: `${sw.name} learns that ${frame.srcMac} is reachable via ${port.name} (VLAN ${vlan}) and stores it in its MAC address table.` });
    } else if (known.port !== port.name) {
      known.port = port.name;
      this.emit({ kind: 'learn', tick, deviceId: sw.id, layer: 2, message: `${sw.name} updates ${frame.srcMac}: now seen on ${port.name}.` });
    }

    const egressPorts = (): Iface[] =>
      sw.interfaces.filter((p) => {
        if (p.name === port.name || !p.adminUp || !p.switchport) return false;
        if (!peerOf(this.net, sw.id, p.name)) return false;
        return p.switchport.mode === 'access' ? p.switchport.accessVlan === vlan : vlanAllowed(p.switchport, vlan);
      });

    const isBroadcast = frame.dstMac === BROADCAST_MAC;
    const dst = isBroadcast ? undefined : sw.macTable.find((e) => e.mac === frame.dstMac && e.vlan === vlan);
    if (!dst) {
      const ports = egressPorts();
      this.emit({
        kind: 'flood',
        tick,
        deviceId: sw.id,
        layer: 2,
        message: isBroadcast
          ? `${sw.name} received a broadcast, so it floods it out every other port in VLAN ${vlan} (${ports.map((p) => p.name).join(', ') || 'none'}).`
          : `${sw.name} does not know where ${frame.dstMac} is yet (unknown unicast), so it floods the frame out every other port in VLAN ${vlan}.`,
      });
      for (const p of ports) this.switchEgress(sw, p, frame, vlan, tick);
      return;
    }
    if (dst.port === port.name) {
      this.emit({ kind: 'drop', tick, deviceId: sw.id, layer: 2, message: `${sw.name} filters the frame: the destination is on the same port it arrived on.` });
      return;
    }
    const outPort = egressPorts().find((p) => p.name === dst.port);
    if (!outPort) {
      this.emit({ kind: 'drop', tick, deviceId: sw.id, layer: 2, message: `${sw.name} knows ${frame.dstMac} is on ${dst.port}, but that port can no longer carry VLAN ${vlan}.` });
      return;
    }
    this.emit({ kind: 'forward', tick, deviceId: sw.id, layer: 2, message: `${sw.name} finds ${frame.dstMac} in its MAC table and forwards the frame only out ${outPort.name}.` });
    this.switchEgress(sw, outPort, frame, vlan, tick);
  }

  private switchEgress(sw: Device, port: Iface, frame: Frame, vlan: number, tick: number): void {
    const sp = port.switchport!;
    const tagged = sp.mode === 'trunk' && vlan !== sp.nativeVlan;
    const out: Frame = { ...frame };
    if (tagged) out.vlan = vlan;
    else delete out.vlan;
    this.transmit(sw, port.name, out, tick);
  }

  private l3Receive(device: Device, physName: string, frame: Frame, tick: number): void {
    const phys = getIface(device, physName);
    if (!phys.adminUp) return;
    let logical: Iface | undefined = phys;
    if (frame.vlan !== undefined) {
      logical = device.interfaces.find((i) => i.parent === phys.name && i.dot1q === frame.vlan);
      if (!logical) {
        this.emit({ kind: 'drop', tick, deviceId: device.id, layer: 2, frame, message: `${device.name} received a frame tagged VLAN ${frame.vlan} on ${phys.name}, but has no sub-interface with "encapsulation dot1Q ${frame.vlan}".` });
        return;
      }
      if (!logical.adminUp) return;
    }
    if (frame.dstMac !== BROADCAST_MAC && frame.dstMac !== logical.mac) {
      this.emit({ kind: 'info', tick, deviceId: device.id, layer: 2, message: `${device.name} ignores the frame: the destination MAC ${frame.dstMac} is not its own.` });
      return;
    }

    if (frame.arp) {
      const a = frame.arp;
      if (a.targetIp !== logical.ip) {
        if (a.op === 'request')
          this.emit({ kind: 'info', tick, deviceId: device.id, layer: 2, message: `${device.name} receives the ARP request but ${a.targetIp} is not its address, so it stays silent.` });
        return;
      }
      this.learnArp(device, a.senderIp, a.senderMac, logical.name);
      if (a.op === 'request') {
        this.emit({ kind: 'arp', tick, deviceId: device.id, layer: 2, message: `${device.name} owns ${a.targetIp}: it caches ${a.senderIp} → ${a.senderMac} and sends an ARP reply directly back.` });
        this.out(
          device,
          logical,
          {
            srcMac: logical.mac,
            dstMac: a.senderMac,
            etherType: 'ARP',
            arp: { op: 'reply', senderMac: logical.mac, senderIp: logical.ip!, targetMac: a.senderMac, targetIp: a.senderIp },
          },
          tick,
        );
      } else {
        this.emit({ kind: 'arp', tick, deviceId: device.id, layer: 2, message: `${device.name} learns ${a.senderIp} is at ${a.senderMac} and sends the packets it was holding.` });
        const key = `${device.id}|${logical.name}|${a.senderIp}`;
        const waiting = this.pending.get(key);
        if (waiting) {
          this.pending.delete(key);
          for (const p of waiting.packets) this.out(device, logical, { srcMac: logical.mac, dstMac: a.senderMac, etherType: 'IPv4', ip: p }, tick);
        }
      }
      return;
    }

    if (!frame.ip) return;
    const pkt = frame.ip;
    if (!logical.ip) {
      this.emit({ kind: 'drop', tick, deviceId: device.id, layer: 3, message: `${device.name} ${logical.name} has no IP address, so it cannot process IP packets.` });
      return;
    }
    if (deviceOwnsIp(device, pkt.dst)) {
      this.localDeliver(device, pkt, tick);
      return;
    }
    if (device.kind !== 'router') {
      this.emit({ kind: 'drop', tick, deviceId: device.id, layer: 3, message: `${device.name} received a packet for ${pkt.dst}, which is not its address. End hosts do not forward packets.` });
      return;
    }
    this.forward(device, logical, pkt, tick);
  }

  private localDeliver(device: Device, pkt: IpPacket, tick: number): void {
    if (pkt.icmp.type === 'echo-request') {
      this.emit({ kind: 'deliver', tick, deviceId: device.id, layer: 3, message: `${device.name} receives the echo request from ${pkt.src} and answers with an echo reply.` });
      this.sendIp(device, { src: pkt.dst, dst: pkt.src, ttl: 64, protocol: 'icmp', icmp: { type: 'echo-reply', id: pkt.icmp.id, seq: pkt.icmp.seq } }, tick);
      return;
    }
    const what =
      pkt.icmp.type === 'echo-reply'
        ? `the echo reply from ${pkt.src} — the round trip worked`
        : pkt.icmp.type === 'time-exceeded'
          ? `ICMP Time Exceeded from ${pkt.src}`
          : `ICMP Destination Unreachable from ${pkt.src}`;
    this.emit({ kind: 'deliver', tick, deviceId: device.id, layer: 3, message: `${device.name} receives ${what}.` });
    this.inbox.push({ deviceId: device.id, packet: pkt });
  }

  private forward(router: Device, ingress: Iface, pkt: IpPacket, tick: number): void {
    const isError = pkt.icmp.type === 'time-exceeded' || pkt.icmp.type === 'dest-unreachable';
    const ttl = pkt.ttl - 1;
    if (ttl <= 0) {
      this.emit({ kind: 'drop', tick, deviceId: router.id, layer: 3, message: `${router.name} decrements the TTL to 0 and discards the packet${isError ? '' : ', sending an ICMP Time Exceeded message back to the source'}. TTL prevents packets from looping forever.` });
      if (!isError)
        this.sendIp(router, { src: ingress.ip!, dst: pkt.src, ttl: 64, protocol: 'icmp', icmp: { type: 'time-exceeded', id: pkt.icmp.id, seq: pkt.icmp.seq } }, tick);
      return;
    }
    const r = routeFor(this.net, router, pkt.dst);
    if (!r.ok) {
      this.emit({ kind: 'drop', tick, deviceId: router.id, layer: 3, message: r.reason });
      if (!isError)
        this.sendIp(router, { src: ingress.ip!, dst: pkt.src, ttl: 64, protocol: 'icmp', icmp: { type: 'dest-unreachable', id: pkt.icmp.id, seq: pkt.icmp.seq, reason: r.reason } }, tick);
      return;
    }
    this.emit({ kind: 'info', tick, deviceId: router.id, layer: 3, message: `${router.name} decrements TTL ${pkt.ttl} → ${ttl} and rewrites the Ethernet header for the next link (IP addresses stay the same).` });
    this.sendIp(router, { ...pkt, ttl }, tick);
  }
}

// ---------- high-level operations ----------

export interface PingOutput {
  results: PingResult[];
  events: SimEvent[];
  storm: boolean;
}

function lastFailure(events: SimEvent[], from: number): string | undefined {
  for (let i = events.length - 1; i >= from; i--) {
    const e = events[i];
    if (e.kind === 'drop' || e.kind === 'storm') return e.message;
  }
  return undefined;
}

function sourceDevice(net: Network, src: string): Device {
  const device = getDevice(net, src);
  if (device.kind === 'switch') throw new Error('Layer 2 switches cannot originate pings in this simulator');
  return device;
}

/**
 * Sends `count` ICMP echo requests from `src` to `dstIp`. MUTATES `net` (ARP and MAC tables
 * are learned just as on real devices) — wrap with `produce` for an immutable call.
 */
export function ping(net: Network, src: string, dstIp: string, opts: { count?: number; ttl?: number } = {}): PingOutput {
  const count = opts.count ?? 4;
  if (!isValidIp(dstIp)) throw new Error(`Invalid destination ${dstIp}`);
  const device = sourceDevice(net, src);
  const sim = new Simulator(net);
  const results: PingResult[] = [];
  for (let seq = 1; seq <= count; seq++) {
    const start = sim.events.length;
    sim.tick += seq === 1 ? 0 : 1;
    if (deviceOwnsIp(device, dstIp)) {
      sim.emit({ kind: 'deliver', deviceId: device.id, layer: 3, message: `${dstIp} is ${device.name}'s own address; the reply is generated locally (loopback).` });
      results.push({ seq, status: 'success', hops: 0 });
      continue;
    }
    const r = routeFor(net, device, dstIp);
    if (!r.ok) {
      sim.emit({ kind: 'drop', deviceId: device.id, layer: 3, message: r.reason });
      results.push({ seq, status: 'error', reason: r.reason });
      continue;
    }
    const pkt: IpPacket = { src: r.decision.iface.ip!, dst: dstIp, ttl: opts.ttl ?? 64, protocol: 'icmp', icmp: { type: 'echo-request', id: 1, seq } };
    sim.emit({ kind: 'info', deviceId: device.id, layer: 3, message: `${device.name} builds an ICMP echo request: source ${pkt.src}, destination ${dstIp}, TTL ${pkt.ttl}.` });
    sim.sendIp(device, pkt, sim.tick);
    sim.run();
    const got = sim.inbox.find((m) => m.deviceId === device.id && m.packet.icmp.seq === seq);
    if (got?.packet.icmp.type === 'echo-reply') {
      results.push({ seq, status: 'success', hops: 64 - got.packet.ttl });
    } else if (got?.packet.icmp.type === 'dest-unreachable') {
      results.push({ seq, status: 'unreachable', from: got.packet.src, reason: got.packet.icmp.reason ?? lastFailure(sim.events, start) });
    } else if (got?.packet.icmp.type === 'time-exceeded') {
      results.push({ seq, status: 'ttl-exceeded', from: got.packet.src, reason: `TTL expired in transit at ${got.packet.src}.` });
    } else {
      results.push({ seq, status: 'timeout', reason: lastFailure(sim.events, start) ?? 'No reply was received.' });
    }
    if (sim.stormDetected) break;
  }
  return { results, events: sim.events, storm: sim.stormDetected };
}

export interface TraceHop {
  ttl: number;
  ip?: string;
  status: 'hop' | 'reached' | 'unreachable' | 'timeout';
}

export function traceroute(net: Network, src: string, dstIp: string, maxHops = 15): { hops: TraceHop[]; events: SimEvent[]; reached: boolean } {
  if (!isValidIp(dstIp)) throw new Error(`Invalid destination ${dstIp}`);
  const device = sourceDevice(net, src);
  const sim = new Simulator(net);
  const hops: TraceHop[] = [];
  let timeouts = 0;
  for (let ttl = 1; ttl <= maxHops; ttl++) {
    sim.tick += 1;
    const r = routeFor(net, device, dstIp);
    if (!r.ok) {
      sim.emit({ kind: 'drop', deviceId: device.id, layer: 3, message: r.reason });
      hops.push({ ttl, status: 'unreachable' });
      break;
    }
    const pkt: IpPacket = { src: r.decision.iface.ip!, dst: dstIp, ttl, protocol: 'icmp', icmp: { type: 'echo-request', id: 2, seq: ttl } };
    sim.sendIp(device, pkt, sim.tick);
    sim.run();
    const got = sim.inbox.find((m) => m.deviceId === device.id && m.packet.icmp.seq === ttl);
    if (!got) {
      hops.push({ ttl, status: 'timeout' });
      if (++timeouts >= 3 || sim.stormDetected) break;
      continue;
    }
    timeouts = 0;
    if (got.packet.icmp.type === 'echo-reply') {
      hops.push({ ttl, ip: got.packet.src, status: 'reached' });
      return { hops, events: sim.events, reached: true };
    }
    if (got.packet.icmp.type === 'dest-unreachable') {
      hops.push({ ttl, ip: got.packet.src, status: 'unreachable' });
      break;
    }
    hops.push({ ttl, ip: got.packet.src, status: 'hop' });
  }
  return { hops, events: sim.events, reached: false };
}
