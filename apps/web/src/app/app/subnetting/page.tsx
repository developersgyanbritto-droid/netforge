'use client';

import { useState } from 'react';
import { vlsm, isValidIp, type VlsmAllocation } from '@netforge/sim-engine';
import { Button, Card, CardHeader, Input, Tabs } from '@/components/ui';
import { SubnetExplorer } from '@/components/lesson/widgets';
import { SubnetPractice } from '@/components/players/SubnetPractice';

function VlsmPlanner() {
  const [base, setBase] = useState('192.168.10.0/24');
  const [rows, setRows] = useState([
    { name: 'Staff', hosts: '100' },
    { name: 'Guests', hosts: '50' },
    { name: 'Servers', hosts: '20' },
    { name: 'Router link', hosts: '2' },
  ]);
  const [result, setResult] = useState<VlsmAllocation[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const plan = () => {
    setErr(null);
    setResult(null);
    const m = base.trim().match(/^(\S+)\/(\d{1,2})$/);
    if (!m || !isValidIp(m[1])) return setErr('Enter the address block as CIDR, e.g. 192.168.10.0/24');
    const reqs = rows.filter((r) => r.name.trim() && Number(r.hosts) > 0).map((r) => ({ name: r.name.trim(), hosts: Number(r.hosts) }));
    if (!reqs.length) return setErr('Add at least one segment with a host count.');
    try {
      setResult(vlsm(m[1], Number(m[2]), reqs));
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <Card>
      <CardHeader title="VLSM planner" subtitle="Allocates largest-first so every block stays aligned" />
      <div className="space-y-3 px-5 pb-5">
        <label className="flex items-center gap-2 text-sm">
          <span className="w-28 font-medium">Address block</span>
          <Input value={base} onChange={(e) => setBase(e.target.value)} className="max-w-xs font-mono" />
        </label>
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <Input value={r.name} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} placeholder="Segment" className="max-w-[200px]" aria-label="Segment name" />
            <Input value={r.hosts} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, hosts: e.target.value } : x)))} placeholder="Hosts" className="w-24 font-mono" aria-label="Hosts needed" />
            <Button variant="ghost" size="sm" onClick={() => setRows(rows.filter((_, k) => k !== i))} aria-label="Remove segment">
              ✕
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setRows([...rows, { name: '', hosts: '' }])}>
            Add segment
          </Button>
          <Button size="sm" onClick={plan}>
            Calculate plan
          </Button>
        </div>
        {err && <p className="text-sm text-danger">{err}</p>}
        {result && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs text-muted">
                <tr>
                  {['Segment', 'Needs', 'Network', 'Usable range', 'Broadcast', 'Capacity'].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono">
                {result.map((a) => (
                  <tr key={a.name} className="border-t border-border">
                    <td className="px-3 py-1.5 font-sans font-medium">{a.name}</td>
                    <td className="px-3 py-1.5">{a.hosts}</td>
                    <td className="px-3 py-1.5">
                      {a.network}/{a.prefix}
                    </td>
                    <td className="px-3 py-1.5">
                      {a.firstHost} – {a.lastHost}
                    </td>
                    <td className="px-3 py-1.5">{a.broadcast}</td>
                    <td className="px-3 py-1.5">{a.usable}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function SubnettingPage() {
  const [tab, setTab] = useState<'explore' | 'practice' | 'vlsm'>('explore');
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Subnetting trainer</h1>
        <p className="text-sm text-muted">Visualise any subnet, plan VLSM allocations and drill with generated questions graded on the server.</p>
      </div>
      <Tabs
        tabs={[
          { id: 'explore', label: 'Explorer' },
          { id: 'practice', label: 'Practice drill' },
          { id: 'vlsm', label: 'VLSM planner' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'explore' && <SubnetExplorer ip="172.16.45.200" prefix={20} standalone />}
      {tab === 'practice' && <SubnetPractice mode="practice" />}
      {tab === 'vlsm' && <VlsmPlanner />}
    </div>
  );
}
