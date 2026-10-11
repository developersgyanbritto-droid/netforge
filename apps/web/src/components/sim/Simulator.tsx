'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, ChevronRight, Info, Pause, Play, RotateCcw, SkipForward, Stethoscope, XCircle } from 'lucide-react';
import { diagnose, freeIfaces, type DeviceKind, type Network } from '@netforge/sim-engine';
import { Badge, Button, Modal, Select } from '@/components/ui';
import { SimContext, createSimStore, useSim, useSimApi, type SimState } from './store';
import { STEP_MS, TopologyCanvas } from './Canvas';
import { DeviceIcon, KIND_LABEL } from './icons';
import { DevicePanel } from './DevicePanel';
import { EventLog } from './EventLog';
import type { StoreApi } from 'zustand';

export function SimProvider({ store, children }: { store: StoreApi<SimState>; children: ReactNode }) {
  return <SimContext.Provider value={store}>{children}</SimContext.Provider>;
}

/** Creates a store once per mount. `initial` changes are ignored after mount — use store.setNet. */
export function useSimStore(initial: Network, editable: boolean): StoreApi<SimState> {
  const ref = useRef<StoreApi<SimState> | null>(null);
  if (!ref.current) ref.current = createSimStore(initial, { editable });
  return ref.current;
}

export function usePlayback() {
  const playing = useSim((s) => s.playing);
  const speed = useSim((s) => s.speed);
  const api = useSimApi();
  useEffect(() => {
    if (!playing) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      api.setState((s) => ({ tick: s.maxTick, playing: false }));
      return;
    }
    const t = setInterval(() => {
      const s = api.getState();
      if (s.tick >= s.maxTick) api.setState({ playing: false });
      else api.setState({ tick: s.tick + 1 });
    }, STEP_MS / speed);
    return () => clearInterval(t);
  }, [playing, speed, api]);
}

const PALETTE: DeviceKind[] = ['pc', 'laptop', 'server', 'switch', 'router'];

function Palette() {
  const add = useSim((s) => s.add);
  const count = useSim((s) => s.net.devices.length);
  return (
    <div className="flex items-center gap-1" role="toolbar" aria-label="Add devices">
      {PALETTE.map((k) => (
        <button
          key={k}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('application/x-netforge-device', k);
            e.dataTransfer.effectAllowed = 'copy';
          }}
          onClick={() => add(k, 80 + (count % 5) * 120, 60 + Math.floor(count / 5) * 120)}
          className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-fg transition hover:border-accent hover:bg-surface-2"
          title={`Add ${KIND_LABEL[k]} (click or drag onto the canvas)`}
        >
          <DeviceIcon kind={k} size={18} />
          {KIND_LABEL[k]}
        </button>
      ))}
    </div>
  );
}

function PingTool() {
  const net = useSim((s) => s.net);
  const runPing = useSim((s) => s.runPing);
  const sources = net.devices.filter((d) => d.kind !== 'switch');
  const targets = net.devices.flatMap((d) => d.interfaces.filter((i) => i.ip).map((i) => ({ label: `${d.name} ${d.kind === 'router' ? i.name + ' ' : ''}(${i.ip})`, ip: i.ip! })));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [result, setResult] = useState<{ ok: boolean; summary: string } | null>(null);
  const src = sources.find((d) => d.id === from) ? from : (sources[0]?.id ?? '');
  const dst = targets.find((t) => t.ip === to) ? to : (targets.find((t) => !net.devices.find((d) => d.id === src)?.interfaces.some((i) => i.ip === t.ip))?.ip ?? '');
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-muted">Ping</span>
      <Select value={src} onChange={(e) => setFrom(e.target.value)} className="h-8 w-auto max-w-[150px] text-xs" aria-label="Ping source">
        {sources.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </Select>
      <ChevronRight className="h-3.5 w-3.5 text-faint" aria-hidden />
      <Select value={dst} onChange={(e) => setTo(e.target.value)} className="h-8 w-auto max-w-[210px] text-xs" aria-label="Ping destination">
        {targets.map((t) => (
          <option key={t.label} value={t.ip}>
            {t.label}
          </option>
        ))}
      </Select>
      <Button size="sm" disabled={!src || !dst} onClick={() => setResult(runPing(src, dst))}>
        <Play className="h-3.5 w-3.5" /> Send
      </Button>
      {result && (
        <span className={clsx('flex max-w-[360px] items-center gap-1 truncate text-xs', result.ok ? 'text-success' : 'text-danger')} title={result.summary}>
          {result.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
          {result.summary}
        </span>
      )}
    </div>
  );
}

export function PlaybackControls() {
  const playing = useSim((s) => s.playing);
  const tick = useSim((s) => s.tick);
  const maxTick = useSim((s) => s.maxTick);
  const events = useSim((s) => s.events);
  const speed = useSim((s) => s.speed);
  const api = useSimApi();
  if (!events.length) return null;
  const min = events[0]?.tick ?? 0;
  return (
    <div className="flex items-center gap-1" aria-label="Playback">
      <Button size="sm" variant="ghost" onClick={() => api.setState({ tick: min, playing: true })} title="Replay" aria-label="Replay">
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
      <Button size="sm" variant="ghost" onClick={() => api.setState({ playing: !playing, tick: !playing && tick >= maxTick ? min : tick })} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => api.setState({ playing: false, tick: Math.min(tick + 1, maxTick) })} title="Step" aria-label="Step forward">
        <SkipForward className="h-3.5 w-3.5" />
      </Button>
      <input
        type="range"
        min={min}
        max={maxTick}
        value={tick}
        onChange={(e) => api.setState({ playing: false, tick: Number(e.target.value) })}
        className="w-24 accent-[var(--accent)]"
        aria-label="Simulation step"
      />
      <span className="w-14 text-right font-mono text-[11px] text-muted">
        {tick - min}/{maxTick - min}
      </span>
      <Select value={speed} onChange={(e) => api.setState({ speed: Number(e.target.value) })} className="h-7 w-[78px] pr-6 pl-2 text-xs" aria-label="Speed">
        <option value={0.5}>0.5×</option>
        <option value={1}>1×</option>
        <option value={2}>2×</option>
        <option value={4}>4×</option>
      </Select>
    </div>
  );
}

export function DiagnosticsList({ onSelect }: { onSelect?: (id: string) => void }) {
  const net = useSim((s) => s.net);
  const select = useSim((s) => s.select);
  const issues = useMemo(() => diagnose(net), [net]);
  if (!issues.length) return <p className="flex items-center gap-1.5 text-sm text-success"><CheckCircle2 className="h-4 w-4" /> No configuration problems detected.</p>;
  return (
    <ul className="space-y-1.5">
      {issues.map((i, k) => (
        <li key={k}>
          <button
            onClick={() => i.deviceId && (onSelect ?? select)(i.deviceId)}
            className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-2"
          >
            {i.severity === 'error' ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" /> : i.severity === 'warning' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" />}
            <span>{i.message}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ConnectDialog() {
  const pending = useSim((s) => s.pendingConnect);
  const net = useSim((s) => s.net);
  const link = useSim((s) => s.link);
  const cancel = useSim((s) => s.cancelConnect);
  const [ai, setAi] = useState('');
  const [bi, setBi] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const a = pending && net.devices.find((d) => d.id === pending.a);
  const b = pending && net.devices.find((d) => d.id === pending.b);
  const fa = a ? freeIfaces(net, a) : [];
  const fb = b ? freeIfaces(net, b) : [];
  useEffect(() => {
    setAi(fa[0]?.name ?? '');
    setBi(fb[0]?.name ?? '');
    setErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.a, pending?.b]);
  if (!pending || !a || !b) return null;
  return (
    <Modal open onClose={cancel} title={`Connect ${a.name} ↔ ${b.name}`}>
      <div className="space-y-4">
        <p className="text-sm text-muted">Choose which port to use on each device. Copper Ethernet cable.</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { d: a, free: fa, v: ai, set: setAi },
            { d: b, free: fb, v: bi, set: setBi },
          ].map(({ d, free, v, set }) => (
            <label key={d.id} className="space-y-1 text-sm">
              <span className="font-medium">{d.name}</span>
              {free.length ? (
                <Select value={v} onChange={(e) => set(e.target.value)} className="font-mono">
                  {free.map((i) => (
                    <option key={i.name} value={i.name}>
                      {i.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <p className="text-xs text-danger">No free ports</p>
              )}
            </label>
          ))}
        </div>
        {err && <p className="text-sm text-danger">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={cancel}>
            Cancel
          </Button>
          <Button disabled={!ai || !bi} onClick={() => setErr(link(a.id, b.id, ai, bi))}>
            Connect
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ErrorToast() {
  const err = useSim((s) => s.lastError);
  const clear = useSim((s) => s.clearError);
  useEffect(() => {
    if (!err) return;
    const t = setTimeout(clear, 5000);
    return () => clearTimeout(t);
  }, [err, clear]);
  if (!err) return null;
  return (
    <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-md bg-danger px-3 py-1.5 text-sm text-white shadow-lg" role="alert">
      {err}
    </div>
  );
}

export interface SimulatorProps {
  /** full: sandbox/lab layout; embed: compact lesson block */
  mode?: 'full' | 'embed';
  height?: number;
  toolbarExtra?: ReactNode;
  actions?: { label: string; from: string; to: string }[];
  /** Hide the automatic diagnostics (troubleshooting challenges must be solved by the learner) */
  diagnostics?: boolean;
}

/** Must be rendered inside <SimProvider>. */
export function Simulator({ mode = 'full', height, toolbarExtra, actions, diagnostics = true }: SimulatorProps) {
  usePlayback();
  const selectedId = useSim((s) => s.selectedId);
  const selectedLinkId = useSim((s) => s.selectedLinkId);
  const editable = useSim((s) => s.editable);
  const add = useSim((s) => s.add);
  const unlink = useSim((s) => s.unlink);
  const runPing = useSim((s) => s.runPing);
  const net = useSim((s) => s.net);
  const [bottom, setBottom] = useState<'events' | 'diagnose'>('events');
  const [lastAction, setLastAction] = useState<{ label: string; ok: boolean; summary: string } | null>(null);
  const issues = useMemo(() => diagnose(net).filter((i) => i.severity !== 'info').length, [net]);

  const link = net.links.find((l) => l.id === selectedLinkId);
  const linkLabel = link && `${net.devices.find((d) => d.id === link.a.device)?.name} ${link.a.iface} ↔ ${net.devices.find((d) => d.id === link.b.device)?.name} ${link.b.iface}`;

  if (mode === 'embed') {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          {actions?.map((a) => (
            <Button
              key={a.label}
              size="sm"
              variant="secondary"
              onClick={() => {
                const r = runPing(a.from, a.to);
                setLastAction({ label: a.label, ...r });
              }}
            >
              <Play className="h-3.5 w-3.5 text-accent" /> {a.label}
            </Button>
          ))}
          <div className="ml-auto">
            <PlaybackControls />
          </div>
        </div>
        <div className="relative">
          <ErrorToast />
          <TopologyCanvas height={height ?? 340} />
        </div>
        {lastAction && (
          <div className={clsx('flex items-start gap-2 border-t border-border px-3 py-2 text-sm', lastAction.ok ? 'text-success' : 'text-danger')}>
            {lastAction.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>
              <strong>{lastAction.label}:</strong> {lastAction.summary}
            </span>
          </div>
        )}
        <details className="border-t border-border px-3 py-2" open={!!lastAction}>
          <summary className="cursor-pointer text-[13px] font-medium text-muted select-none">Step-by-step explanation &amp; packet inspector</summary>
          <div className="pt-2">
            <EventLog maxHeight={220} />
          </div>
        </details>
        {selectedId && (
          <div className="border-t border-border">
            <DevicePanel deviceId={selectedId} compact />
          </div>
        )}
        <ConnectDialog />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-3 py-2">
        {editable && <Palette />}
        <PingTool />
        <div className="ml-auto flex items-center gap-2">
          <PlaybackControls />
          {toolbarExtra}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative min-h-[320px] flex-1">
          <ErrorToast />
          <TopologyCanvas height={height ?? '100%'} onDropKind={editable ? (k, x, y) => add(k, x, y) : undefined} />
          {!net.devices.length && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted">Drag devices from the toolbar to start building.</div>
          )}
        </div>
        <aside className="flex max-h-[560px] w-full shrink-0 flex-col border-t border-border lg:max-h-none lg:w-[340px] lg:border-t-0 lg:border-l" aria-label="Device details">
          {selectedId ? (
            <DevicePanel deviceId={selectedId} />
          ) : link ? (
            <div className="space-y-3 p-4">
              <h3 className="font-semibold">Cable</h3>
              <p className="font-mono text-sm">{linkLabel}</p>
              <Button variant="danger" size="sm" onClick={() => unlink(link.id)}>
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="space-y-3 p-5 text-sm text-muted">
              <p className="font-medium text-fg">Select a device</p>
              <ul className="list-disc space-y-1 pl-4">
                <li>Click a device to configure it, inspect its tables or open its CLI.</li>
                <li>Hover a device and drag its blue dot onto another device to connect a cable.</li>
                <li>Use <strong>Ping</strong> in the toolbar to send a packet and watch each hop.</li>
                <li>Select a cable or device and press Delete to remove it{editable ? '' : ' (devices are fixed in this lab)'}.</li>
              </ul>
            </div>
          )}
        </aside>
      </div>
      <div className="border-t border-border">
        <div className="flex items-center gap-1 px-3 pt-1.5">
          <button onClick={() => setBottom('events')} className={clsx('rounded-md px-2.5 py-1 text-[13px] font-medium', bottom === 'events' ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg')}>
            Packet flow
          </button>
          {diagnostics && <button onClick={() => setBottom('diagnose')} className={clsx('flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium', bottom === 'diagnose' ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg')}>
            <Stethoscope className="h-3.5 w-3.5" /> Diagnose {issues > 0 && <Badge tone="warning">{issues}</Badge>}
          </button>}
        </div>
        <div className="max-h-[220px] overflow-y-auto px-3 py-2">{bottom === 'events' || !diagnostics ? <EventLog maxHeight={150} /> : <DiagnosticsList />}</div>
      </div>
      <ConnectDialog />
    </div>
  );
}
