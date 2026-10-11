'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FilePlus2, FolderOpen, Save, Trash2 } from 'lucide-react';
import { createNetwork, type Network } from '@netforge/sim-engine';
import { api, errorMessage } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { Alert, Button, Input, Modal } from '@/components/ui';
import { SimProvider, Simulator, useSimStore } from '@/components/sim/Simulator';
import { useSim } from '@/components/sim/store';

interface TopoMeta {
  id: string;
  name: string;
  updatedAt: string;
}

function SandboxToolbar({ current, setCurrent }: { current: TopoMeta | null; setCurrent: (t: TopoMeta | null) => void }) {
  const net = useSim((s) => s.net);
  const setNet = useSim((s) => s.setNet);
  const qc = useQueryClient();
  const [openList, setOpenList] = useState(false);
  const [saveAs, setSaveAs] = useState(false);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['topologies'], queryFn: () => api.get<{ topologies: TopoMeta[] }>('/me/topologies'), enabled: openList });

  const save = useMutation({
    mutationFn: async (n: string) => {
      if (current && !saveAs) {
        await api.put(`/me/topologies/${current.id}`, { name: current.name, data: net });
        return current;
      }
      const r = await api.post<{ topology: TopoMeta }>('/me/topologies', { name: n, data: net });
      return r.topology;
    },
    onSuccess: (t) => {
      setCurrent(t);
      setSaveAs(false);
      setMsg('Saved');
      setTimeout(() => setMsg(null), 2500);
      qc.invalidateQueries({ queryKey: ['topologies'] });
    },
    onError: (e) => setMsg(errorMessage(e)),
  });
  const load = useMutation({
    mutationFn: (id: string) => api.get<{ topology: TopoMeta & { data: Network } }>(`/me/topologies/${id}`),
    onSuccess: (r) => {
      setNet(r.topology.data);
      setCurrent({ id: r.topology.id, name: r.topology.name, updatedAt: r.topology.updatedAt });
      setOpenList(false);
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/me/topologies/${id}`),
    onSuccess: (_r, id) => {
      if (current?.id === id) setCurrent(null);
      qc.invalidateQueries({ queryKey: ['topologies'] });
    },
  });

  return (
    <>
      <span className="hidden max-w-[160px] truncate text-xs text-muted xl:inline">{current ? current.name : 'Unsaved topology'}</span>
      {msg && <span className="text-xs text-success">{msg}</span>}
      <Button size="sm" variant="ghost" onClick={() => { if (confirm('Start a new empty topology? Unsaved changes will be lost.')) { setNet(createNetwork()); setCurrent(null); } }} title="New">
        <FilePlus2 className="h-3.5 w-3.5" />
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpenList(true)} title="Open">
        <FolderOpen className="h-3.5 w-3.5" />
      </Button>
      <Button size="sm" variant="secondary" loading={save.isPending} onClick={() => (current ? save.mutate(current.name) : setSaveAs(true))}>
        <Save className="h-3.5 w-3.5" /> Save
      </Button>
      <Modal open={saveAs} onClose={() => setSaveAs(false)} title="Save topology">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) save.mutate(name.trim());
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Branch office design" autoFocus aria-label="Topology name" />
          {save.error && <Alert>{errorMessage(save.error)}</Alert>}
          <Button type="submit" disabled={!name.trim()} loading={save.isPending}>
            Save
          </Button>
        </form>
      </Modal>
      <Modal open={openList} onClose={() => setOpenList(false)} title="Your saved topologies">
        {list.isLoading && <p className="text-sm text-muted">Loading…</p>}
        {list.data?.topologies.length === 0 && <p className="text-sm text-muted">You have not saved any topologies yet.</p>}
        <ul className="space-y-1.5">
          {list.data?.topologies.map((t) => (
            <li key={t.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
              <button className="min-w-0 flex-1 text-left" onClick={() => load.mutate(t.id)}>
                <p className="truncate text-sm font-medium">{t.name}</p>
                <p className="text-xs text-muted">Updated {relativeTime(t.updatedAt)}</p>
              </button>
              <button onClick={() => confirm(`Delete "${t.name}"?`) && del.mutate(t.id)} className="rounded p-1.5 text-muted hover:text-danger" aria-label={`Delete ${t.name}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}

export default function SandboxPage() {
  const store = useSimStore(createNetwork(), true);
  const [current, setCurrent] = useState<TopoMeta | null>(null);
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Network lab</h1>
        <p className="text-sm text-muted">A free sandbox. Build any topology, configure it with the GUI or CLI, and save it to your account.</p>
      </div>
      <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted lg:hidden">Tip: the topology builder works best on a desktop or laptop screen.</p>
      <SimProvider store={store}>
        <div className="h-[calc(100vh-170px)] min-h-[640px]">
          <Simulator toolbarExtra={<SandboxToolbar current={current} setCurrent={setCurrent} />} />
        </div>
      </SimProvider>
    </div>
  );
}
