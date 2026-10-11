'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { ArrowRightLeft, Ban, BookOpen, CheckCircle2, GitBranch, Radio, Route, Share2, TriangleAlert, Waypoints } from 'lucide-react';
import type { Frame, SimEvent, SimEventKind } from '@netforge/sim-engine';
import { useSim } from './store';

const ICON: Record<SimEventKind, typeof Radio> = {
  frame: ArrowRightLeft,
  arp: Radio,
  learn: BookOpen,
  flood: Share2,
  forward: GitBranch,
  route: Route,
  deliver: CheckCircle2,
  drop: Ban,
  info: Waypoints,
  storm: TriangleAlert,
};

const TONE: Partial<Record<SimEventKind, string>> = {
  drop: 'text-danger',
  storm: 'text-danger',
  deliver: 'text-success',
  arp: 'text-l2',
  learn: 'text-l2',
  flood: 'text-l2',
  forward: 'text-l2',
  route: 'text-l3',
};

export function EventLog({ maxHeight = 260 }: { maxHeight?: number }) {
  const events = useSim((s) => s.events);
  const tick = useSim((s) => s.tick);
  const playing = useSim((s) => s.playing);
  const maxTick = useSim((s) => s.maxTick);
  const selectedSeq = useSim((s) => s.selectedEventSeq);
  const selectEvent = useSim((s) => s.selectEvent);
  const net = useSim((s) => s.net);
  const [showAll, setShowAll] = useState(false);
  const list = useRef<HTMLOListElement>(null);

  const visible = useMemo(
    () => events.filter((e) => (playing || tick < maxTick ? e.tick <= tick : true)).filter((e) => showAll || (e.kind !== 'info' && e.kind !== 'frame')),
    [events, tick, playing, maxTick, showAll],
  );
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [visible.length]);

  const name = (id?: string) => net.devices.find((d) => d.id === id)?.name ?? '';
  const selected = events.find((e) => e.seq === selectedSeq) ?? null;

  if (!events.length) {
    return <p className="px-1 py-3 text-sm text-muted">Run a ping or a command to see what happens, step by step.</p>;
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-muted">What happened — {visible.length} step{visible.length === 1 ? '' : 's'}</span>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-[var(--accent)]" />
            Show every frame
          </label>
        </div>
        <ol ref={list} className="space-y-0.5 overflow-y-auto pr-1" style={{ maxHeight }} aria-label="Simulation events">
          {visible.map((e) => {
            const Icon = ICON[e.kind];
            return (
              <li key={e.seq}>
                <button
                  onClick={() => selectEvent(e.seq)}
                  className={clsx(
                    'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition hover:bg-surface-2',
                    e.seq === selectedSeq && 'bg-accent-soft',
                    e.tick === tick && (playing || tick < maxTick) && 'bg-surface-2',
                  )}
                >
                  <Icon className={clsx('mt-0.5 h-3.5 w-3.5 shrink-0', TONE[e.kind] ?? 'text-muted')} aria-hidden />
                  <span className="min-w-0">
                    {e.deviceId && e.kind !== 'frame' && <span className="mr-1 font-semibold">{name(e.deviceId)}</span>}
                    <span className={clsx(e.kind === 'drop' || e.kind === 'storm' ? 'text-danger' : 'text-fg/90')}>{e.message.replace(new RegExp(`^${name(e.deviceId)}:? `), '')}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <PacketInspector event={selected} />
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | number | undefined }) {
  if (v === undefined) return null;
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <dt className="text-muted">{k}</dt>
      <dd className="font-mono">{v}</dd>
    </div>
  );
}

export function PacketInspector({ event }: { event: SimEvent | null }) {
  const frame: Frame | undefined = event?.frame;
  if (!event) {
    return <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted">Select a step to inspect its frame headers.</div>;
  }
  if (!frame) {
    return <div className="rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted">This step is a device decision — it has no frame on the wire. Pick a step with a frame (enable “Show every frame”).</div>;
  }
  return (
    <div className="space-y-2 text-xs" aria-label="Packet inspector">
      <section className="rounded-lg border border-l2/40 bg-surface p-2.5">
        <h4 className="mb-1 font-semibold text-l2">Ethernet II (Layer 2)</h4>
        <dl>
          <Row k="Destination MAC" v={frame.dstMac} />
          <Row k="Source MAC" v={frame.srcMac} />
          {frame.vlan !== undefined && <Row k="802.1Q VLAN tag" v={frame.vlan} />}
          <Row k="EtherType" v={frame.etherType === 'ARP' ? '0x0806 (ARP)' : '0x0800 (IPv4)'} />
        </dl>
      </section>
      {frame.arp && (
        <section className="rounded-lg border border-border bg-surface p-2.5">
          <h4 className="mb-1 font-semibold">ARP {frame.arp.op}</h4>
          <dl>
            <Row k="Sender MAC" v={frame.arp.senderMac} />
            <Row k="Sender IP" v={frame.arp.senderIp} />
            <Row k="Target MAC" v={frame.arp.targetMac} />
            <Row k="Target IP" v={frame.arp.targetIp} />
          </dl>
        </section>
      )}
      {frame.ip && (
        <section className="rounded-lg border border-l3/40 bg-surface p-2.5">
          <h4 className="mb-1 font-semibold text-l3">IPv4 (Layer 3)</h4>
          <dl>
            <Row k="Source IP" v={frame.ip.src} />
            <Row k="Destination IP" v={frame.ip.dst} />
            <Row k="TTL" v={frame.ip.ttl} />
            <Row k="Protocol" v="1 (ICMP)" />
          </dl>
          <h4 className="mb-1 mt-2 font-semibold">ICMP</h4>
          <dl>
            <Row k="Type" v={frame.ip.icmp.type} />
            <Row k="Sequence" v={frame.ip.icmp.seq} />
          </dl>
        </section>
      )}
    </div>
  );
}
