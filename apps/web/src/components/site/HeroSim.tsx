'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildNetwork, type TopologySpec } from '@netforge/sim-engine';
import { SimProvider, useSimStore, usePlayback } from '@/components/sim/Simulator';
import { TopologyCanvas } from '@/components/sim/Canvas';
import { useSim } from '@/components/sim/store';

// A real engine run, not an animation: every packet below is computed by the simulator.
const spec: TopologySpec = {
  devices: [
    { id: 'pc1', kind: 'pc', name: 'Sales-PC', x: 0, y: 260, ip: '10.10.0.10/24', gateway: '10.10.0.1' },
    { id: 'lap1', kind: 'laptop', name: 'Eng-Laptop', x: 170, y: 260, ip: '10.20.0.10/24', gateway: '10.20.0.1' },
    { id: 'sw1', kind: 'switch', name: 'Access-SW', x: 85, y: 130, vlans: { '10': 'SALES', '20': 'ENG' }, interfaces: { 'Fa0/1': { vlan: 10 }, 'Fa0/2': { vlan: 20 }, 'Gi0/1': { mode: 'trunk' } } },
    { id: 'r1', kind: 'router', name: 'Edge-R', x: 300, y: 0, interfaces: { 'Gi0/0': { up: true }, 'Gi0/0.10': { ip: '10.10.0.1/24' }, 'Gi0/0.20': { ip: '10.20.0.1/24' }, 'Gi0/1': { ip: '172.16.0.1/30', up: true } }, routes: ['10.99.0.0/24 via 172.16.0.2'] },
    { id: 'r2', kind: 'router', name: 'DC-R', x: 520, y: 0, interfaces: { 'Gi0/0': { ip: '10.99.0.1/24', up: true }, 'Gi0/1': { ip: '172.16.0.2/30', up: true } }, routes: ['0.0.0.0/0 via 172.16.0.1'] },
    { id: 'srv1', kind: 'server', name: 'App-Server', x: 600, y: 200, ip: '10.99.0.100/24', gateway: '10.99.0.1' },
  ],
  links: [
    ['pc1', 'Fa0', 'sw1', 'Fa0/1'],
    ['lap1', 'Fa0', 'sw1', 'Fa0/2'],
    ['sw1', 'Gi0/1', 'r1', 'Gi0/0'],
    ['r1', 'Gi0/1', 'r2', 'Gi0/1'],
    ['r2', 'Gi0/0', 'srv1', 'Fa0'],
  ],
};

const SCRIPT = [
  { from: 'pc1', to: '10.99.0.100', label: 'Sales-PC → App-Server' },
  { from: 'lap1', to: '10.10.0.10', label: 'Engineering → Sales (inter-VLAN)' },
  { from: 'srv1', to: '10.20.0.10', label: 'App-Server → Eng-Laptop' },
];

function Narration() {
  usePlayback();
  const events = useSim((s) => s.events);
  const tick = useSim((s) => s.tick);
  const net = useSim((s) => s.net);
  const current = useMemo(() => [...events].reverse().find((e) => e.tick <= tick && e.kind !== 'frame' && e.kind !== 'info'), [events, tick]);
  const name = net.devices.find((d) => d.id === current?.deviceId)?.name;
  return (
    <div className="flex min-h-[48px] items-center border-t border-border px-4 py-2 font-mono text-[12px] text-muted" aria-live="off">
      {current ? (
        <span>
          <span className="text-accent">▸ </span>
          {name && !current.message.startsWith(name) && <span className="font-semibold text-fg">{name}: </span>}
          {current.message}
        </span>
      ) : (
        'Preparing simulation…'
      )}
    </div>
  );
}

function Driver({ onLabel }: { onLabel: (l: string) => void }) {
  const runPing = useSim((s) => s.runPing);
  useEffect(() => {
    let i = 0;
    const go = () => {
      const s = SCRIPT[i % SCRIPT.length];
      onLabel(s.label);
      runPing(s.from, s.to);
      i++;
    };
    const first = setTimeout(go, 600);
    const t = setInterval(go, 11000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [runPing, onLabel]);
  return null;
}

export function HeroSim() {
  const store = useSimStore(buildNetwork(spec), false);
  const [label, setLabel] = useState('');
  return (
    <SimProvider store={store}>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_20px_60px_-20px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-success" aria-hidden />
          <span className="text-xs font-medium">Live simulation</span>
          <span className="ml-auto truncate font-mono text-xs text-muted">ping {label}</span>
        </div>
        <TopologyCanvas height={330} />
        <Narration />
        <Driver onLabel={setLabel} />
      </div>
    </SimProvider>
  );
}
