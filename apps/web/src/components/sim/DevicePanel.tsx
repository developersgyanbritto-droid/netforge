'use client';

import { useEffect, useState, type FormEvent } from 'react';
import clsx from 'clsx';
import { Plus, Trash2, Unplug } from 'lucide-react';
import {
  addStaticRoute,
  addSubinterface,
  addVlan,
  buildRoutingTable,
  ifaceStatus,
  isValidIp,
  maskToPrefix,
  parseCidr,
  parseVlanList,
  peerOf,
  prefixToMask,
  removeStaticRoute,
  removeSubinterface,
  removeVlan,
  setGateway,
  setIfaceIp,
  setSwitchport,
  formatVlanList,
  type Device,
  type Iface,
  type Network,
} from '@netforge/sim-engine';
import { Badge, Button, Input, Select, Tabs } from '@/components/ui';
import { useSim } from './store';
import { DeviceIcon, KIND_LABEL } from './icons';
import { Terminal } from './Terminal';

type Tab = 'config' | 'tables' | 'console';

/** Accepts "24", "/24" or "255.255.255.0". */
function parseMask(s: string): number | null {
  const t = s.trim().replace(/^\//, '');
  if (/^\d{1,2}$/.test(t)) {
    const n = Number(t);
    return n >= 1 && n <= 32 ? n : null;
  }
  return maskToPrefix(t);
}

export function DevicePanel({ deviceId, compact }: { deviceId: string; compact?: boolean }) {
  const dev = useSim((s) => s.net.devices.find((d) => d.id === deviceId));
  const [tab, setTab] = useState<Tab>('config');
  if (!dev) return null;
  const isNetDevice = dev.kind === 'router' || dev.kind === 'switch';
  return (
    <div className="flex h-full flex-col">
      <Header dev={dev} />
      <Tabs<Tab>
        className="px-3"
        tabs={[
          { id: 'config', label: 'Configure' },
          { id: 'tables', label: dev.kind === 'switch' ? 'MAC & VLANs' : dev.kind === 'router' ? 'Routes & ARP' : 'ARP cache' },
          { id: 'console', label: isNetDevice ? 'CLI' : 'Command prompt' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'config' && (dev.kind === 'switch' ? <SwitchConfig dev={dev} /> : dev.kind === 'router' ? <RouterConfig dev={dev} /> : <HostConfig dev={dev} />)}
        {tab === 'tables' && <Tables dev={dev} />}
        {tab === 'console' && <Terminal deviceId={dev.id} height={compact ? 260 : 380} />}
      </div>
    </div>
  );
}

function Header({ dev }: { dev: Device }) {
  const rename = useSim((s) => s.rename);
  const remove = useSim((s) => s.remove);
  const editable = useSim((s) => s.editable);
  const [name, setName] = useState(dev.name);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setName(dev.name), [dev.name]);
  return (
    <div className="flex items-center gap-3 border-b border-border p-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2">
        <DeviceIcon kind={dev.kind} size={30} />
      </div>
      <div className="min-w-0 flex-1">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setErr(rename(dev.id, name.trim()));
          }}
          className="flex items-center gap-1.5"
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 font-semibold" aria-label="Device name" />
          {name !== dev.name && (
            <Button size="sm" type="submit">
              Rename
            </Button>
          )}
        </form>
        <p className="mt-0.5 text-xs text-muted">{KIND_LABEL[dev.kind]}</p>
        {err && <p className="text-xs text-danger">{err}</p>}
      </div>
      {editable && (
        <Button variant="ghost" size="sm" onClick={() => remove(dev.id)} aria-label={`Delete ${dev.name}`} title="Delete device">
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

function StatusDot({ net, dev, i }: { net: Network; dev: Device; i: Iface }) {
  const st = ifaceStatus(net, dev, i);
  const tone = st.status === 'up' ? 'success' : st.status.startsWith('admin') ? 'warning' : 'neutral';
  return <Badge tone={tone}>{st.status === 'administratively down' ? 'shutdown' : st.status}</Badge>;
}

function useConfig() {
  const mutate = useSim((s) => s.mutate);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const apply = (fn: (n: Network) => void, ok = 'Saved') => {
    const err = mutate(fn);
    setMsg(err ? { ok: false, text: err } : { ok: true, text: ok });
    return !err;
  };
  return { apply, msg, setMsg };
}

function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return <p className={clsx('text-xs', msg.ok ? 'text-success' : 'text-danger')}>{msg.text}</p>;
}

function HostConfig({ dev }: { dev: Device }) {
  const net = useSim((s) => s.net);
  const nic = dev.interfaces[0];
  const [ip, setIp] = useState(nic.ip ?? '');
  const [mask, setMask] = useState(nic.prefix !== undefined ? prefixToMask(nic.prefix) : '255.255.255.0');
  const [gw, setGw] = useState(dev.gateway ?? '');
  const { apply, msg, setMsg } = useConfig();
  useEffect(() => {
    setIp(nic.ip ?? '');
    setMask(nic.prefix !== undefined ? prefixToMask(nic.prefix) : '255.255.255.0');
    setGw(dev.gateway ?? '');
  }, [nic.ip, nic.prefix, dev.gateway]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ip.trim()) {
      apply((n) => {
        setIfaceIp(n, dev.id, nic.name, null);
        setGateway(n, dev.id, null);
      }, 'IP settings cleared');
      return;
    }
    if (!isValidIp(ip.trim())) return setMsg({ ok: false, text: `"${ip}" is not a valid IPv4 address (four numbers 0–255 separated by dots).` });
    const prefix = parseMask(mask);
    if (prefix === null) return setMsg({ ok: false, text: 'Invalid subnet mask. Use a dotted mask like 255.255.255.0 or a prefix like /24.' });
    if (gw.trim() && !isValidIp(gw.trim())) return setMsg({ ok: false, text: 'The gateway must be a valid IPv4 address.' });
    apply((n) => {
      setIfaceIp(n, dev.id, nic.name, ip.trim(), prefix);
      setGateway(n, dev.id, gw.trim() || null);
    }, 'IP configuration applied');
  };
  const peer = peerOf(net, dev.id, nic.name);
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2 text-xs">
        <span>
          <span className="font-mono font-semibold">{nic.name}</span> · <span className="font-mono text-muted">{nic.mac}</span>
        </span>
        <span className="flex items-center gap-2">
          {peer ? <span className="text-muted">→ {peer.device.name} {peer.iface.name}</span> : <span className="text-muted">no cable</span>}
          <StatusDot net={net} dev={dev} i={nic} />
        </span>
      </div>
      <label className="block space-y-1 text-[13px]">
        <span className="font-medium">IPv4 address</span>
        <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.1.10" className="font-mono" />
      </label>
      <label className="block space-y-1 text-[13px]">
        <span className="font-medium">Subnet mask</span>
        <Input value={mask} onChange={(e) => setMask(e.target.value)} placeholder="255.255.255.0 or /24" className="font-mono" />
      </label>
      <label className="block space-y-1 text-[13px]">
        <span className="font-medium">Default gateway</span>
        <Input value={gw} onChange={(e) => setGw(e.target.value)} placeholder="192.168.1.1 (optional)" className="font-mono" />
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm">
          Apply
        </Button>
        <Msg msg={msg} />
      </div>
      <LinksList dev={dev} />
    </form>
  );
}

function LinksList({ dev }: { dev: Device }) {
  const net = useSim((s) => s.net);
  const unlink = useSim((s) => s.unlink);
  const links = net.links.filter((l) => l.a.device === dev.id || l.b.device === dev.id);
  if (!links.length) return <p className="text-xs text-muted">Not cabled. Hover the device on the canvas and drag its blue dot onto another device.</p>;
  return (
    <div className="space-y-1 pt-2">
      <h4 className="text-xs font-semibold text-muted uppercase tracking-wide">Cables</h4>
      {links.map((l) => {
        const mine = l.a.device === dev.id ? l.a : l.b;
        const other = l.a.device === dev.id ? l.b : l.a;
        return (
          <div key={l.id} className="flex items-center justify-between rounded-md border border-border px-2 py-1 text-xs">
            <span className="font-mono">
              {mine.iface} ↔ {net.devices.find((d) => d.id === other.device)?.name} {other.iface}
            </span>
            <button type="button" onClick={() => unlink(l.id)} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-danger" title="Disconnect cable" aria-label="Disconnect cable">
              <Unplug className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function RouterIfaceRow({ dev, i }: { dev: Device; i: Iface }) {
  const net = useSim((s) => s.net);
  const [cidr, setCidr] = useState(i.ip ? `${i.ip}/${i.prefix}` : '');
  const [vlan, setVlan] = useState(i.dot1q?.toString() ?? '');
  const { apply, msg, setMsg } = useConfig();
  useEffect(() => setCidr(i.ip ? `${i.ip}/${i.prefix}` : ''), [i.ip, i.prefix]);
  const peer = !i.parent ? peerOf(net, dev.id, i.name) : undefined;
  const save = () => {
    if (!cidr.trim()) return apply((n) => setIfaceIp(n, dev.id, i.name, null), 'Address removed');
    const c = parseCidr(cidr.replace(/\s+/, ' '));
    if (!c) return setMsg({ ok: false, text: 'Use CIDR like 192.168.1.1/24 or "192.168.1.1 255.255.255.0".' });
    apply((n) => {
      if (i.parent) {
        const v = Number(vlan);
        if (!Number.isInteger(v) || v < 1 || v > 4094) throw new Error('Set the 802.1Q VLAN (1–4094) for this sub-interface');
        n.devices.find((d) => d.id === dev.id)!.interfaces.find((x) => x.name === i.name)!.dot1q = v;
      }
      setIfaceIp(n, dev.id, i.name, c.ip, c.prefix);
    });
  };
  return (
    <div className="space-y-1.5 rounded-md border border-border p-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-mono font-semibold">{i.name}</span>
        <span className="flex items-center gap-1.5">
          {peer && <span className="truncate text-muted">→ {peer.device.name}</span>}
          <StatusDot net={net} dev={dev} i={i} />
        </span>
      </div>
      <div className="flex gap-1.5">
        {i.parent && <Input value={vlan} onChange={(e) => setVlan(e.target.value)} placeholder="VLAN" className="h-8 w-16 font-mono text-xs" aria-label="802.1Q VLAN" />}
        <Input value={cidr} onChange={(e) => setCidr(e.target.value)} placeholder="10.0.0.1/24" className="h-8 font-mono text-xs" aria-label={`${i.name} address`} />
        <Button size="sm" variant="secondary" onClick={save}>
          Set
        </Button>
        <Button size="sm" variant={i.adminUp ? 'outline' : 'primary'} onClick={() => apply((n) => (n.devices.find((d) => d.id === dev.id)!.interfaces.find((x) => x.name === i.name)!.adminUp = !i.adminUp), i.adminUp ? 'Shut down' : 'Enabled')}>
          {i.adminUp ? 'Shut' : 'No shut'}
        </Button>
        {i.parent && (
          <button onClick={() => apply((n) => removeSubinterface(n, dev.id, i.name), 'Removed')} className="rounded p-1 text-muted hover:text-danger" aria-label={`Remove ${i.name}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <Msg msg={msg} />
    </div>
  );
}

function RouterConfig({ dev }: { dev: Device }) {
  const { apply, msg } = useConfig();
  const [sub, setSub] = useState('');
  const [route, setRoute] = useState({ net: '', via: '' });
  const physical = dev.interfaces.filter((i) => !i.parent);
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">Interfaces</h4>
        {dev.interfaces.map((i) => (
          <RouterIfaceRow key={i.name} dev={dev} i={i} />
        ))}
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (apply((n) => addSubinterface(n, dev.id, sub.trim()), 'Sub-interface added')) setSub('');
          }}
        >
          <Input value={sub} onChange={(e) => setSub(e.target.value)} placeholder={`${physical[0]?.name}.10`} className="h-8 font-mono text-xs" aria-label="New sub-interface name" />
          <Button size="sm" variant="secondary" type="submit">
            <Plus className="h-3.5 w-3.5" /> Sub-interface
          </Button>
        </form>
      </section>
      <section className="space-y-2">
        <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">Static routes</h4>
        {(dev.staticRoutes ?? []).map((r, k) => (
          <div key={k} className="flex items-center justify-between rounded-md border border-border px-2 py-1 font-mono text-xs">
            <span>
              {r.network}/{r.prefix} via {r.nextHop ?? r.exitIface}
            </span>
            <button onClick={() => apply((n) => removeStaticRoute(n, dev.id, r.network, r.prefix, r.nextHop ?? r.exitIface), 'Route removed')} className="rounded p-1 text-muted hover:text-danger" aria-label="Remove route">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const c = parseCidr(route.net.trim());
            if (!c) return apply(() => {
              throw new Error('Destination must be CIDR, e.g. 10.2.0.0/24 or 0.0.0.0/0');
            });
            if (!isValidIp(route.via.trim())) return apply(() => {
              throw new Error('Next hop must be an IPv4 address');
            });
            if (apply((n) => addStaticRoute(n, dev.id, { network: c.ip, prefix: c.prefix, nextHop: route.via.trim() }), 'Route added')) setRoute({ net: '', via: '' });
          }}
        >
          <Input value={route.net} onChange={(e) => setRoute({ ...route, net: e.target.value })} placeholder="10.2.0.0/24" className="h-8 font-mono text-xs" aria-label="Destination network" />
          <Input value={route.via} onChange={(e) => setRoute({ ...route, via: e.target.value })} placeholder="next hop" className="h-8 font-mono text-xs" aria-label="Next hop" />
          <Button size="sm" variant="secondary" type="submit">
            Add
          </Button>
        </form>
        <Msg msg={msg} />
      </section>
      <LinksList dev={dev} />
    </div>
  );
}

function SwitchConfig({ dev }: { dev: Device }) {
  const net = useSim((s) => s.net);
  const { apply, msg } = useConfig();
  const [showAll, setShowAll] = useState(false);
  const [vlan, setVlan] = useState({ id: '', name: '' });
  const ports = dev.interfaces.filter((i) => showAll || peerOf(net, dev.id, i.name));
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">VLAN database</h4>
        <div className="flex flex-wrap gap-1.5">
          {(dev.vlans ?? []).map((v) => (
            <span key={v.id} className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-xs">
              {v.id} <span className="text-muted">{v.name}</span>
              {v.id !== 1 && (
                <button onClick={() => apply((n) => removeVlan(n, dev.id, v.id), `VLAN ${v.id} deleted`)} className="text-muted hover:text-danger" aria-label={`Delete VLAN ${v.id}`}>
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (apply((n) => addVlan(n, dev.id, Number(vlan.id), vlan.name.trim() || undefined), `VLAN ${vlan.id} saved`)) setVlan({ id: '', name: '' });
          }}
        >
          <Input value={vlan.id} onChange={(e) => setVlan({ ...vlan, id: e.target.value })} placeholder="ID" className="h-8 w-20 font-mono text-xs" aria-label="VLAN ID" />
          <Input value={vlan.name} onChange={(e) => setVlan({ ...vlan, name: e.target.value })} placeholder="Name (e.g. SALES)" className="h-8 text-xs" aria-label="VLAN name" />
          <Button size="sm" variant="secondary" type="submit">
            Add
          </Button>
        </form>
      </section>
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">Ports</h4>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-[var(--accent)]" /> show unused
          </label>
        </div>
        {!ports.length && <p className="text-xs text-muted">No ports are cabled yet.</p>}
        {ports.map((p) => (
          <SwitchPortRow key={p.name} dev={dev} p={p} apply={apply} />
        ))}
        <Msg msg={msg} />
      </section>
      <LinksList dev={dev} />
    </div>
  );
}

function SwitchPortRow({ dev, p, apply }: { dev: Device; p: Iface; apply: (fn: (n: Network) => void, ok?: string) => boolean }) {
  const net = useSim((s) => s.net);
  const sp = p.switchport!;
  const [allowed, setAllowed] = useState(sp.allowedVlans === 'all' ? 'all' : formatVlanList(sp.allowedVlans));
  useEffect(() => setAllowed(sp.allowedVlans === 'all' ? 'all' : formatVlanList(sp.allowedVlans)), [sp.allowedVlans]);
  const peer = peerOf(net, dev.id, p.name);
  return (
    <div className="space-y-1.5 rounded-md border border-border p-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono font-semibold">{p.name}</span>
        <span className="flex min-w-0 items-center gap-1.5">
          {peer && <span className="truncate text-muted">→ {peer.device.name}</span>}
          <StatusDot net={net} dev={dev} i={p} />
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Select value={sp.mode} onChange={(e) => apply((n) => setSwitchport(n, dev.id, p.name, { mode: e.target.value as 'access' | 'trunk' }), `${p.name} is now ${e.target.value}`)} className="h-8 w-24 text-xs" aria-label={`${p.name} mode`}>
          <option value="access">access</option>
          <option value="trunk">trunk</option>
        </Select>
        {sp.mode === 'access' ? (
          <Select value={sp.accessVlan} onChange={(e) => apply((n) => setSwitchport(n, dev.id, p.name, { accessVlan: Number(e.target.value) }), `${p.name} → VLAN ${e.target.value}`)} className="h-8 w-36 text-xs" aria-label={`${p.name} access VLAN`}>
            {!(dev.vlans ?? []).some((v) => v.id === sp.accessVlan) && <option value={sp.accessVlan}>VLAN {sp.accessVlan} (missing!)</option>}
            {(dev.vlans ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                VLAN {v.id} {v.name}
              </option>
            ))}
          </Select>
        ) : (
          <form
            className="flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const list = allowed.trim().toLowerCase() === 'all' ? 'all' : parseVlanList(allowed);
              apply((n) => {
                if (!list) throw new Error('Allowed VLANs: "all" or a list like 10,20,30-40');
                setSwitchport(n, dev.id, p.name, { allowedVlans: list });
              }, 'Allowed VLANs updated');
            }}
          >
            <Input value={allowed} onChange={(e) => setAllowed(e.target.value)} className="h-8 w-28 font-mono text-xs" aria-label="Allowed VLANs" />
            <Button size="sm" variant="secondary" type="submit">
              Set
            </Button>
          </form>
        )}
        <Button size="sm" variant={p.adminUp ? 'outline' : 'primary'} onClick={() => apply((n) => (n.devices.find((d) => d.id === dev.id)!.interfaces.find((x) => x.name === p.name)!.adminUp = !p.adminUp), p.adminUp ? `${p.name} shut down` : `${p.name} enabled`)}>
          {p.adminUp ? 'Shut' : 'No shut'}
        </Button>
      </div>
    </div>
  );
}

function SimpleTable({ head, rows, empty }: { head: string[]; rows: (string | number)[][]; empty: string }) {
  if (!rows.length) return <p className="py-2 text-xs text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-xs">
        <thead className="bg-surface-2 text-left text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-2 py-1.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono">
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              {r.map((c, j) => (
                <td key={j} className="px-2 py-1">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tables({ dev }: { dev: Device }) {
  const net = useSim((s) => s.net);
  const mutate = useSim((s) => s.mutate);
  const clear = () => mutate((n) => {
    const d = n.devices.find((x) => x.id === dev.id)!;
    if (d.arp) d.arp = [];
    if (d.macTable) d.macTable = [];
  });
  return (
    <div className="space-y-4">
      {dev.kind === 'router' && (
        <section className="space-y-1.5">
          <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">Routing table</h4>
          <SimpleTable
            head={['Code', 'Network', 'Via / interface']}
            rows={buildRoutingTable(net, dev).map((r) => [r.code, `${r.network}/${r.prefix}`, r.nextHop ? `${r.nextHop}${r.iface ? ` (${r.iface})` : ''}` : (r.iface ?? '')])}
            empty="No routes. Configure IP addresses and enable interfaces."
          />
        </section>
      )}
      {dev.kind === 'switch' ? (
        <section className="space-y-1.5">
          <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">MAC address table</h4>
          <SimpleTable head={['VLAN', 'MAC address', 'Port']} rows={(dev.macTable ?? []).map((e) => [e.vlan, e.mac, e.port])} empty="Empty — the switch learns MAC addresses as frames arrive. Run a ping." />
        </section>
      ) : (
        <section className="space-y-1.5">
          <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">ARP cache</h4>
          <SimpleTable head={['IP address', 'MAC address', 'Interface']} rows={(dev.arp ?? []).map((e) => [e.ip, e.mac, e.iface])} empty="Empty — entries appear after this device resolves a neighbour with ARP." />
        </section>
      )}
      <Button size="sm" variant="secondary" onClick={clear}>
        Clear learned entries
      </Button>
    </div>
  );
}
