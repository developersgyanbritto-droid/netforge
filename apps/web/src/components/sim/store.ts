'use client';

// Per-instance simulator store. The engine computes results instantly; the UI replays the
// resulting event list tick-by-tick so learners can follow each frame.
import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import {
  addDevice,
  connect,
  disconnect,
  getDevice,
  hostPrompt,
  iosPrompt,
  ping,
  produce,
  removeDevice,
  renameDevice,
  runHost,
  runIos,
  type DeviceKind,
  type IosSession,
  type Network,
  type SimEvent,
} from '@netforge/sim-engine';

export interface TermLine {
  kind: 'in' | 'out' | 'sys';
  text: string;
}

export interface TerminalState {
  lines: TermLine[];
  session?: IosSession;
  history: string[];
}

export interface SimState {
  net: Network;
  /** Bumps on every configuration change (not on layout moves) — drives live validation & autosave */
  version: number;
  editable: boolean;
  selectedId: string | null;
  selectedLinkId: string | null;
  events: SimEvent[];
  tick: number;
  maxTick: number;
  playing: boolean;
  speed: number;
  selectedEventSeq: number | null;
  terminals: Record<string, TerminalState>;
  lastError: string | null;
  pendingConnect: { a: string; b: string } | null;

  setNet: (net: Network) => void;
  mutate: (fn: (draft: Network) => void) => string | null;
  select: (id: string | null) => void;
  selectLink: (id: string | null) => void;
  add: (kind: DeviceKind, x: number, y: number) => string | null;
  remove: (id: string) => void;
  rename: (id: string, name: string) => string | null;
  requestConnect: (a: string, b: string) => void;
  cancelConnect: () => void;
  link: (a: string, b: string, ai?: string, bi?: string) => string | null;
  unlink: (linkId: string) => void;
  move: (id: string, x: number, y: number) => void;
  runPing: (from: string, to: string) => { ok: boolean; summary: string };
  runCommand: (deviceId: string, line: string) => void;
  clearTerminal: (deviceId: string) => void;
  playEvents: (events: SimEvent[]) => void;
  setTick: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: number) => void;
  selectEvent: (seq: number | null) => void;
  clearError: () => void;
}

export function createSimStore(initial: Network, opts: { editable: boolean }): StoreApi<SimState> {
  return createStore<SimState>((set, get) => {
    const commit = (net: Network) => set((s) => ({ net, version: s.version + 1, lastError: null }));
    const tryMutate = (fn: (draft: Network) => void): string | null => {
      try {
        const { net } = produce(get().net, fn);
        commit(net);
        return null;
      } catch (e) {
        const msg = (e as Error).message;
        set({ lastError: msg });
        return msg;
      }
    };

    return {
      net: initial,
      version: 0,
      editable: opts.editable,
      selectedId: null,
      selectedLinkId: null,
      events: [],
      tick: 0,
      maxTick: 0,
      playing: false,
      speed: 1,
      selectedEventSeq: null,
      terminals: {},
      lastError: null,
      pendingConnect: null,

      setNet: (net) => set((s) => ({ net, version: s.version + 1, events: [], tick: 0, maxTick: 0, playing: false, selectedId: null, selectedLinkId: null, terminals: {}, selectedEventSeq: null })),
      mutate: tryMutate,
      select: (id) => set({ selectedId: id, selectedLinkId: null }),
      selectLink: (id) => set({ selectedLinkId: id, selectedId: null }),
      add: (kind, x, y) => {
        if (!get().editable) return 'This lab does not allow adding devices';
        let newId: string | null = null;
        const err = tryMutate((d) => {
          newId = addDevice(d, kind, { x: Math.round(x), y: Math.round(y) }).id;
        });
        if (!err && newId) set({ selectedId: newId });
        return err;
      },
      remove: (id) => {
        if (!get().editable) return;
        tryMutate((d) => removeDevice(d, id));
        set({ selectedId: null });
      },
      rename: (id, name) => tryMutate((d) => renameDevice(d, id, name)),
      requestConnect: (a, b) => set({ pendingConnect: a === b ? null : { a, b } }),
      cancelConnect: () => set({ pendingConnect: null }),
      link: (a, b, ai, bi) => {
        const err = tryMutate((d) => {
          connect(d, a, b, ai, bi);
        });
        if (!err) set({ pendingConnect: null });
        return err;
      },
      unlink: (linkId) => {
        tryMutate((d) => disconnect(d, linkId));
        set({ selectedLinkId: null });
      },
      move: (id, x, y) =>
        set((s) => ({ net: { ...s.net, devices: s.net.devices.map((d) => (d.id === id ? { ...d, x: Math.round(x), y: Math.round(y) } : d)) } })),
      runPing: (from, to) => {
        try {
          const { net, result } = produce(get().net, (d) => ping(d, from, to, { count: 1 }));
          set((s) => ({ net, version: s.version + 1 }));
          get().playEvents(result.events);
          const r = result.results[0];
          return { ok: r?.status === 'success', summary: r?.status === 'success' ? 'Reply received' : (r?.reason ?? 'No reply') };
        } catch (e) {
          set({ lastError: (e as Error).message });
          return { ok: false, summary: (e as Error).message };
        }
      },
      runCommand: (deviceId, line) => {
        const s = get();
        const term: TerminalState = s.terminals[deviceId] ?? { lines: [], history: [] };
        const dev = getDevice(s.net, deviceId);
        const isIos = dev.kind === 'router' || dev.kind === 'switch';
        const session: IosSession = term.session ?? { deviceId, mode: 'user' };
        const prompt = isIos ? iosPrompt(s.net, session) : hostPrompt(s.net, deviceId);
        const trimmed = line.trim();
        if (/^(clear|cls)$/i.test(trimmed)) {
          set({ terminals: { ...s.terminals, [deviceId]: { ...term, lines: [], session } } });
          return;
        }
        const { net, result } = produce(s.net, (d) => {
          const sess = { ...session };
          const out = isIos ? runIos(d, sess, line) : runHost(d, deviceId, line);
          return { out, sess };
        });
        const lines: TermLine[] = [...term.lines, { kind: 'in', text: `${prompt}${line}` }];
        if (result.out.output) lines.push({ kind: 'out', text: result.out.output });
        const history = trimmed ? [...term.history.filter((h) => h !== trimmed), trimmed].slice(-50) : term.history;
        set((st) => ({
          net: result.out.changed ? net : st.net,
          version: result.out.changed ? st.version + 1 : st.version,
          terminals: { ...st.terminals, [deviceId]: { lines: lines.slice(-400), session: result.sess, history } },
        }));
        if (result.out.events?.length) get().playEvents(result.out.events);
      },
      clearTerminal: (deviceId) => set((s) => ({ terminals: { ...s.terminals, [deviceId]: { ...(s.terminals[deviceId] ?? { history: [] }), lines: [] } } })),
      playEvents: (events) => {
        const maxTick = events.reduce((m, e) => Math.max(m, e.tick), 0);
        const minTick = events.reduce((m, e) => Math.min(m, e.tick), Infinity);
        set({ events, tick: Number.isFinite(minTick) ? minTick : 0, maxTick, playing: events.length > 0, selectedEventSeq: null });
      },
      setTick: (t) => set((s) => ({ tick: Math.max(0, Math.min(t, s.maxTick)) })),
      setPlaying: (p) => set({ playing: p }),
      setSpeed: (sp) => set({ speed: sp }),
      selectEvent: (seq) => set({ selectedEventSeq: seq }),
      clearError: () => set({ lastError: null }),
    };
  });
}

export const SimContext = createContext<StoreApi<SimState> | null>(null);

export function useSim<T>(selector: (s: SimState) => T): T {
  const store = useContext(SimContext);
  if (!store) throw new Error('useSim must be used inside <SimProvider>');
  return useStore(store, selector);
}

export function useSimApi(): StoreApi<SimState> {
  const store = useContext(SimContext);
  if (!store) throw new Error('useSimApi must be used inside <SimProvider>');
  return store;
}
