'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { classifyIp, ipToNum, isValidIp, numToIp, prefixToMaskNum, subnetInfo, splitSubnet } from '@netforge/sim-engine';
import { Badge, Input } from '@/components/ui';

// ---------------- OSI model ----------------

const OSI = [
  { n: 7, name: 'Application', pdu: 'Data', does: 'Network services for applications: requests and responses.', protocols: 'HTTP, HTTPS, DNS, DHCP, SSH, SMTP', devices: 'Hosts, servers, firewalls (L7 inspection)' },
  { n: 6, name: 'Presentation', pdu: 'Data', does: 'Data formats, encoding, compression and encryption.', protocols: 'TLS (conceptually), JPEG, UTF-8', devices: 'Hosts' },
  { n: 5, name: 'Session', pdu: 'Data', does: 'Opening, managing and closing sessions between applications.', protocols: 'RPC, NetBIOS (session concepts)', devices: 'Hosts' },
  { n: 4, name: 'Transport', pdu: 'Segment / Datagram', does: 'End-to-end delivery between applications using ports; reliability (TCP) or speed (UDP).', protocols: 'TCP, UDP', devices: 'Hosts, firewalls' },
  { n: 3, name: 'Network', pdu: 'Packet', does: 'Logical addressing and routing between networks.', protocols: 'IPv4, IPv6, ICMP, OSPF', devices: 'Routers, L3 switches' },
  { n: 2, name: 'Data link', pdu: 'Frame', does: 'Delivery on the local link using MAC addresses; error detection.', protocols: 'Ethernet, 802.1Q, Wi-Fi (802.11), ARP*', devices: 'Switches, access points, NICs' },
  { n: 1, name: 'Physical', pdu: 'Bits', does: 'Signals on the medium: electrical, optical or radio.', protocols: '1000BASE-T, fibre, radio', devices: 'Cables, hubs, repeaters, transceivers' },
];

export function OsiWidget() {
  const [sel, setSel] = useState(3);
  const layer = OSI.find((l) => l.n === sel)!;
  return (
    <div className="grid gap-4 rounded-xl border border-border bg-surface p-4 md:grid-cols-[240px_1fr]">
      <ol className="space-y-1" aria-label="OSI layers">
        {OSI.map((l) => (
          <li key={l.n}>
            <button
              onClick={() => setSel(l.n)}
              aria-pressed={sel === l.n}
              className={clsx(
                'flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition',
                sel === l.n ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-2',
              )}
            >
              <span className="w-5 font-mono text-xs text-muted">L{l.n}</span>
              <span className="font-medium">{l.name}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="space-y-3" aria-live="polite">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Layer {layer.n}</p>
          <h4 className="text-lg font-semibold">{layer.name}</h4>
        </div>
        <p className="text-sm">{layer.does}</p>
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div className="rounded-md bg-surface-2 p-2.5">
            <dt className="text-xs text-muted">Data unit</dt>
            <dd className="font-medium">{layer.pdu}</dd>
          </div>
          <div className="rounded-md bg-surface-2 p-2.5">
            <dt className="text-xs text-muted">Protocols</dt>
            <dd className="font-medium">{layer.protocols}</dd>
          </div>
          <div className="rounded-md bg-surface-2 p-2.5">
            <dt className="text-xs text-muted">Devices</dt>
            <dd className="font-medium">{layer.devices}</dd>
          </div>
        </dl>
        {layer.n === 2 && <p className="text-xs text-muted">* ARP carries IP information in a Layer 2 frame — it sits between layers 2 and 3.</p>}
      </div>
    </div>
  );
}

// ---------------- Encapsulation ----------------

const LAYERS = [
  {
    id: 'eth',
    label: 'Ethernet header',
    layer: 'Layer 2 — Frame',
    color: 'border-l2 bg-l2/10 text-l2',
    fields: [
      ['Destination MAC', '0060.5c00.0010 (the gateway)'],
      ['Source MAC', '0060.5c00.0001 (PC1)'],
      ['EtherType', '0x0800 → IPv4 inside'],
    ],
    note: 'Rebuilt at every hop. Switches read it; routers strip and replace it.',
  },
  {
    id: 'ip',
    label: 'IP header',
    layer: 'Layer 3 — Packet',
    color: 'border-l3 bg-l3/10 text-l3',
    fields: [
      ['Source IP', '192.168.1.10'],
      ['Destination IP', '93.184.215.14'],
      ['TTL', '64 (decremented by each router)'],
      ['Protocol', '6 → TCP inside'],
    ],
    note: 'Stays the same end-to-end (unless NAT rewrites it). Routers read the destination IP.',
  },
  {
    id: 'tcp',
    label: 'TCP header',
    layer: 'Layer 4 — Segment',
    color: 'border-warning bg-warning/10 text-warning',
    fields: [
      ['Source port', '51544 (random, chosen by the client)'],
      ['Destination port', '443 (HTTPS)'],
      ['Sequence / ACK', 'Reliability and ordering'],
      ['Flags', 'SYN, ACK, FIN, RST…'],
    ],
    note: 'Identifies the application conversation on each host.',
  },
  {
    id: 'data',
    label: 'Application data',
    layer: 'Layer 7 — Data',
    color: 'border-success bg-success/10 text-success',
    fields: [['Content', 'GET / HTTP/1.1  Host: example.com …']],
    note: 'What the application actually wants to send.',
  },
  { id: 'fcs', label: 'FCS', layer: 'Layer 2 — Trailer', color: 'border-l2 bg-l2/10 text-l2', fields: [['Frame check sequence', 'CRC-32 checksum of the frame']], note: 'Lets the receiver detect corrupted frames and discard them.' },
];

export function EncapsulationWidget() {
  const [sel, setSel] = useState('ip');
  const [depth, setDepth] = useState(4);
  const l = LAYERS.find((x) => x.id === sel)!;
  const shown = (id: string) => ({ data: 1, tcp: 2, ip: 3, eth: 4, fcs: 4 })[id as 'data']! <= depth;
  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Encapsulation step:</span>
        {['Data', '+ TCP', '+ IP', '+ Ethernet'].map((s, i) => (
          <button key={s} onClick={() => setDepth(i + 1)} className={clsx('rounded-md border px-2 py-1 text-xs font-medium', depth === i + 1 ? 'border-accent bg-accent-soft text-accent' : 'border-border hover:bg-surface-2')}>
            {i + 1}. {s}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-stretch overflow-x-auto font-mono text-[11px] sm:text-xs" role="group" aria-label="Frame layout — click a part to inspect it">
        {LAYERS.filter((x) => shown(x.id)).map((x) => (
          <button
            key={x.id}
            onClick={() => setSel(x.id)}
            className={clsx('min-w-[90px] border-2 px-3 py-3 text-left font-semibold transition', x.color, x.id === 'data' && 'flex-1', sel === x.id ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : 'opacity-85 hover:opacity-100')}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div className="rounded-lg bg-surface-2 p-3" aria-live="polite">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">{l.layer}</p>
        <h4 className="font-semibold">{l.label}</h4>
        <dl className="mt-2 grid gap-1 text-sm">
          {l.fields.map(([k, v]) => (
            <div key={k} className="flex flex-wrap justify-between gap-2 border-b border-border/60 py-1 last:border-0">
              <dt className="text-muted">{k}</dt>
              <dd className="font-mono text-[13px]">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-sm text-muted">{l.note}</p>
      </div>
    </div>
  );
}

// ---------------- Binary converter ----------------

export function BinaryWidget({ value = 0 }: { value?: number }) {
  const [v, setV] = useState(value);
  const bits = [128, 64, 32, 16, 8, 4, 2, 1];
  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Bits of one octet">
        {bits.map((b) => {
          const on = (v & b) !== 0;
          return (
            <button
              key={b}
              onClick={() => setV(v ^ b)}
              aria-pressed={on}
              aria-label={`Bit worth ${b}: ${on ? 'on' : 'off'}`}
              className={clsx('flex w-12 flex-col items-center rounded-md border py-2 transition sm:w-14', on ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-2')}
            >
              <span className="font-mono text-xl font-semibold">{on ? 1 : 0}</span>
              <span className="text-[10px] text-muted">{b}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>
          Decimal: <strong className="font-mono text-lg">{v}</strong>
        </span>
        <span className="text-muted">=</span>
        <span className="font-mono text-muted">{bits.filter((b) => v & b).join(' + ') || '0'}</span>
        <label className="ml-auto flex items-center gap-2">
          <span className="text-muted">Type a value</span>
          <Input type="number" min={0} max={255} value={v} onChange={(e) => setV(Math.max(0, Math.min(255, Number(e.target.value) || 0)))} className="h-8 w-20 font-mono" />
        </label>
      </div>
    </div>
  );
}

// ---------------- Subnet explorer ----------------

export function SubnetExplorer({ ip: initialIp, prefix: initialPrefix, standalone }: { ip: string; prefix: number; standalone?: boolean }) {
  const [ipText, setIpText] = useState(initialIp);
  const [prefix, setPrefix] = useState(initialPrefix);
  const ip = isValidIp(ipText) ? ipText : null;
  const info = useMemo(() => (ip ? subnetInfo(ip, prefix) : null), [ip, prefix]);
  const bits = ip ? ipToNum(ip).toString(2).padStart(32, '0') : '0'.repeat(32);
  const maskBits = prefixToMaskNum(prefix).toString(2).padStart(32, '0');

  // Sibling subnets inside the enclosing octet boundary (max 16 shown)
  const parentPrefix = Math.max(0, Math.floor((prefix - 1) / 8) * 8);
  const siblings = useMemo(() => {
    if (!ip || prefix - parentPrefix > 6 || prefix === parentPrefix) return [];
    return splitSubnet(ip, parentPrefix, prefix);
  }, [ip, prefix, parentPrefix]);

  return (
    <div className={clsx('space-y-4 rounded-xl border border-border bg-surface p-4', standalone && 'p-5')}>
      <div className="flex flex-wrap items-end gap-4">
        <label className="space-y-1 text-sm">
          <span className="font-medium">IP address</span>
          <Input value={ipText} onChange={(e) => setIpText(e.target.value.trim())} className={clsx('w-44 font-mono', !ip && 'border-danger')} aria-invalid={!ip} />
        </label>
        <label className="min-w-[220px] flex-1 space-y-1 text-sm">
          <span className="flex justify-between font-medium">
            <span>Prefix length</span>
            <span className="font-mono text-accent">/{prefix}</span>
          </span>
          <input type="range" min={1} max={32} value={prefix} onChange={(e) => setPrefix(Number(e.target.value))} className="w-full accent-[var(--accent)]" aria-label="Prefix length" />
        </label>
      </div>
      {!ip ? (
        <p className="text-sm text-danger">Enter a valid IPv4 address (four numbers 0–255).</p>
      ) : (
        info && (
          <>
            <div className="overflow-x-auto">
              <div className="inline-flex font-mono text-[13px]" aria-label="Binary address split into network and host bits">
                {bits.split('').map((b, i) => (
                  <span key={i} className={clsx('flex flex-col items-center', i % 8 === 0 && i > 0 && 'ml-2')}>
                    <span className={clsx('w-[14px] text-center', maskBits[i] === '1' ? 'text-l3 font-semibold' : 'text-warning')}>{b}</span>
                    <span className={clsx('h-1 w-[14px]', maskBits[i] === '1' ? 'bg-l3' : 'bg-warning/60')} />
                  </span>
                ))}
              </div>
              <div className="mt-1.5 flex gap-4 text-xs">
                <span className="flex items-center gap-1"><span className="h-2 w-3 bg-l3" /> network bits ({prefix})</span>
                <span className="flex items-center gap-1"><span className="h-2 w-3 bg-warning/60" /> host bits ({32 - prefix})</span>
              </div>
            </div>
            <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Network', `${info.network}/${prefix}`],
                ['Subnet mask', info.mask],
                ['Broadcast', info.broadcast],
                ['Usable hosts', info.usableHosts.toLocaleString()],
                ['First host', info.firstHost ?? '—'],
                ['Last host', info.lastHost ?? '—'],
                ['Wildcard', info.wildcard],
                ['Address type', classifyIp(ip)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-md bg-surface-2 p-2.5">
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="font-mono font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            {(info.isNetworkAddress || info.isBroadcastAddress) && (
              <p className="text-sm text-warning">
                {ip} is the {info.isNetworkAddress ? 'network' : 'broadcast'} address of this subnet — it cannot be assigned to a host.
              </p>
            )}
            {siblings.length > 1 && (
              <div>
                <p className="mb-1.5 text-xs text-muted">
                  All /{prefix} subnets inside {numToIp(ipToNum(info.network) & prefixToMaskNum(parentPrefix))}/{parentPrefix} — block size {2 ** (32 - prefix)}:
                </p>
                <div className="flex flex-wrap gap-1">
                  {siblings.map((s) => (
                    <span key={s.network} className={clsx('rounded border px-1.5 py-0.5 font-mono text-[11px]', s.network === info.network ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted')}>
                      {s.network}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}

// ---------------- Inline knowledge check ----------------

export function InlineCheck({ question, options, answer, explanation }: { question: string; options: string[]; answer: number; explanation: string }) {
  const [picked, setPicked] = useState<number | null>(null);
  const correct = picked === answer;
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <Badge tone="accent">Check your understanding</Badge>
      </div>
      <p className="mb-3 font-medium">{question}</p>
      <div className="grid gap-1.5" role="radiogroup">
        {options.map((o, i) => (
          <button
            key={i}
            role="radio"
            aria-checked={picked === i}
            onClick={() => setPicked(i)}
            className={clsx(
              'rounded-md border px-3 py-2 text-left text-sm transition',
              picked === null && 'border-border hover:bg-surface-2',
              picked !== null && i === answer && 'border-success bg-success-soft',
              picked === i && i !== answer && 'border-danger bg-danger-soft',
              picked !== null && i !== answer && picked !== i && 'border-border opacity-70',
            )}
          >
            {o}
          </button>
        ))}
      </div>
      {picked !== null && (
        <p className={clsx('mt-3 text-sm', correct ? 'text-success' : 'text-fg')} aria-live="polite">
          <strong>{correct ? 'Correct. ' : 'Not quite. '}</strong>
          {explanation}
        </p>
      )}
    </div>
  );
}
