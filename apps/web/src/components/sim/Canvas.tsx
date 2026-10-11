'use client';

import { memo, useCallback, useMemo, useRef, type DragEvent } from 'react';
import {
  Background,
  BaseEdge,
  ConnectionMode,
  Controls,
  EdgeLabelRenderer,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getStraightPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import clsx from 'clsx';
import type { Device, DeviceKind, Frame, Link, SimEvent } from '@netforge/sim-engine';
import { useSim } from './store';
import { DeviceIcon } from './icons';

const STEP_MS = 650;

interface DeviceData extends Record<string, unknown> {
  device: Device;
  active: boolean;
  dropped: boolean;
}

interface Packet {
  key: string;
  reverse: boolean;
  color: string;
  label: string;
}

interface LinkData extends Record<string, unknown> {
  link: Link;
  up: boolean;
  packets: Packet[];
  stepMs: number;
}

function frameColor(f?: Frame): { color: string; label: string } {
  if (!f) return { color: 'var(--muted)', label: '' };
  if (f.arp) return { color: 'var(--l2)', label: 'ARP' };
  const t = f.ip?.icmp.type;
  if (t === 'echo-reply') return { color: 'var(--success)', label: 'ICMP' };
  if (t === 'time-exceeded' || t === 'dest-unreachable') return { color: 'var(--warning)', label: 'ICMP' };
  return { color: 'var(--accent)', label: 'ICMP' };
}

const DeviceNode = memo(function DeviceNode({ data, selected }: NodeProps<Node<DeviceData>>) {
  const d = data.device;
  const ip = d.interfaces.find((i) => i.ip)?.ip;
  return (
    <div className="group relative flex w-[96px] flex-col items-center" title={`${d.name} (${d.kind})`}>
      <div
        className={clsx(
          'relative flex h-14 w-14 items-center justify-center rounded-xl border bg-surface text-fg transition',
          selected ? 'border-accent ring-2 ring-accent/30' : 'border-border',
          data.active && 'nf-active border-accent',
          data.dropped && 'border-danger ring-2 ring-danger/30',
        )}
      >
        <DeviceIcon kind={d.kind} size={38} />
        {/* center handle used by all edges */}
        <Handle id="c" type="source" position={Position.Top} className="!pointer-events-none !h-px !w-px !min-h-0 !min-w-0 !border-0 !bg-transparent" style={{ top: '50%', left: '50%' }} isConnectableStart={false} isConnectableEnd />
        {/* visible connector: drag onto another device to cable them */}
        <Handle
          id="out"
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-surface !bg-accent opacity-0 transition group-hover:opacity-100"
          title="Drag to another device to connect a cable"
        />
      </div>
      <div className="mt-1 max-w-full truncate rounded bg-surface/80 px-1 text-center text-[11px] font-semibold leading-tight">{d.name}</div>
      {ip && <div className="font-mono text-[10px] leading-tight text-muted">{ip}</div>}
    </div>
  );
});

const LinkEdge = memo(function LinkEdge({ id, sourceX, sourceY, targetX, targetY, data, selected }: EdgeProps<Edge<LinkData>>) {
  const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const up = data?.up ?? true;
  const at = (t: number) => ({ x: sourceX + (targetX - sourceX) * t, y: sourceY + (targetY - sourceY) * t });
  const la = at(0.26);
  const lb = at(0.74);
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{ stroke: selected ? 'var(--accent)' : up ? 'var(--border-strong)' : 'var(--danger)', strokeWidth: selected ? 3 : 2, strokeDasharray: up ? undefined : '6 5' }}
        interactionWidth={14}
      />
      {data?.packets.map((p) => (
        <g key={p.key}>
          <circle r="7" fill={p.color} stroke="var(--surface)" strokeWidth="2">
            <animateMotion dur={`${data.stepMs}ms`} path={path} fill="freeze" keyPoints={p.reverse ? '1;0' : '0;1'} keyTimes="0;1" calcMode="linear" />
          </circle>
        </g>
      ))}
      <EdgeLabelRenderer>
        {data && (
          <>
            <div className="nodrag nopan pointer-events-none absolute rounded bg-surface px-1 font-mono text-[9.5px] text-muted" style={{ transform: `translate(-50%,-50%) translate(${la.x}px,${la.y}px)` }}>
              {data.link.a.iface}
            </div>
            <div className="nodrag nopan pointer-events-none absolute rounded bg-surface px-1 font-mono text-[9.5px] text-muted" style={{ transform: `translate(-50%,-50%) translate(${lb.x}px,${lb.y}px)` }}>
              {data.link.b.iface}
            </div>
          </>
        )}
      </EdgeLabelRenderer>
    </>
  );
});

const nodeTypes = { device: DeviceNode };
const edgeTypes = { link: LinkEdge };

function CanvasInner({ height, onDropKind }: { height: number | string; onDropKind?: (kind: DeviceKind, x: number, y: number) => void }) {
  const net = useSim((s) => s.net);
  const selectedId = useSim((s) => s.selectedId);
  const selectedLinkId = useSim((s) => s.selectedLinkId);
  const events = useSim((s) => s.events);
  const tick = useSim((s) => s.tick);
  const speed = useSim((s) => s.speed);
  const select = useSim((s) => s.select);
  const selectLink = useSim((s) => s.selectLink);
  const move = useSim((s) => s.move);
  const requestConnect = useSim((s) => s.requestConnect);
  const unlink = useSim((s) => s.unlink);
  const remove = useSim((s) => s.remove);
  const editable = useSim((s) => s.editable);
  const { screenToFlowPosition } = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);

  const tickEvents = useMemo(() => events.filter((e) => e.tick === tick), [events, tick]);
  const stepMs = STEP_MS / speed;

  const nodes: Node<DeviceData>[] = useMemo(() => {
    const active = new Set(tickEvents.filter((e) => e.kind !== 'frame' && e.kind !== 'info').map((e) => e.deviceId));
    const dropped = new Set(tickEvents.filter((e) => e.kind === 'drop' || e.kind === 'storm').map((e) => e.deviceId));
    return net.devices.map((d) => ({
      id: d.id,
      type: 'device',
      position: { x: d.x, y: d.y },
      selected: d.id === selectedId,
      data: { device: d, active: active.has(d.id), dropped: dropped.has(d.id) },
    }));
  }, [net.devices, selectedId, tickEvents]);

  const edges: Edge<LinkData>[] = useMemo(() => {
    const byLink = new Map<string, SimEvent[]>();
    for (const e of tickEvents) if (e.kind === 'frame' && e.linkId) byLink.set(e.linkId, [...(byLink.get(e.linkId) ?? []), e]);
    return net.links.map((l) => {
      const a = net.devices.find((d) => d.id === l.a.device);
      const b = net.devices.find((d) => d.id === l.b.device);
      const up = !!a?.interfaces.find((i) => i.name === l.a.iface)?.adminUp && !!b?.interfaces.find((i) => i.name === l.b.iface)?.adminUp;
      const packets = (byLink.get(l.id) ?? []).map((e) => ({ key: `${e.seq}-${tick}`, reverse: e.from?.device !== l.a.device, ...frameColor(e.frame) }));
      return {
        id: l.id,
        type: 'link',
        source: l.a.device,
        target: l.b.device,
        sourceHandle: 'c',
        targetHandle: 'c',
        selected: l.id === selectedLinkId,
        data: { link: l, up, packets, stepMs },
      };
    });
  }, [net.links, net.devices, tickEvents, selectedLinkId, tick, stepMs]);

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<DeviceData>>[]) => {
      for (const c of changes) {
        if (c.type === 'position' && c.position) move(c.id, c.position.x, c.position.y);
      }
    },
    [move],
  );

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData('application/x-netforge-device') as DeviceKind;
    if (!kind || !onDropKind) return;
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    onDropKind(kind, p.x - 48, p.y - 28);
  };

  return (
    <div ref={wrapper} style={{ height }} className="relative w-full" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, n) => select(n.id)}
        onEdgeClick={(_, e) => selectLink(e.id)}
        onPaneClick={() => select(null)}
        onConnect={(c) => c.source && c.target && requestConnect(c.source, c.target)}
        onKeyDown={(e) => {
          if (e.key !== 'Delete' && e.key !== 'Backspace') return;
          if ((e.target as HTMLElement).closest('input,textarea,select')) return;
          if (selectedLinkId) unlink(selectedLinkId);
          else if (selectedId && editable) remove(selectedId);
        }}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={48}
        deleteKeyCode={null}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1.2 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        aria-label="Network topology canvas"
      >
        <Background gap={20} size={1.4} color="var(--canvas-dot)" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  );
}

export function TopologyCanvas(props: { height: number | string; onDropKind?: (kind: DeviceKind, x: number, y: number) => void }) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

export { STEP_MS };
