'use client';

import { useEffect, useRef, useState } from 'react';
import { getDevice, hostPrompt, iosPrompt } from '@netforge/sim-engine';
import { useSim } from './store';

export function Terminal({ deviceId, height = 300 }: { deviceId: string; height?: number }) {
  const term = useSim((s) => s.terminals[deviceId]);
  const net = useSim((s) => s.net);
  const run = useSim((s) => s.runCommand);
  const [line, setLine] = useState('');
  const [hIdx, setHIdx] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const dev = net.devices.find((d) => d.id === deviceId);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [term?.lines.length]);

  if (!dev) return null;
  const isIos = dev.kind === 'router' || dev.kind === 'switch';
  const prompt = isIos ? iosPrompt(net, term?.session ?? { deviceId, mode: 'user' }) : hostPrompt(net, deviceId);
  const history = term?.history ?? [];

  const submit = () => {
    run(deviceId, line);
    setLine('');
    setHIdx(null);
  };

  return (
    <div
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-[#0b0f14] font-mono text-[12.5px] leading-relaxed text-[#d4e0ec]"
      style={{ height }}
      onClick={() => input.current?.focus()}
    >
      <div ref={scroller} className="flex-1 overflow-auto px-3 py-2" aria-live="polite">
        {!term?.lines.length && (
          <div className="text-[#7c8a9b]">
            {isIos
              ? `${getDevice(net, deviceId).name} console. Try: enable, configure terminal, show ip interface brief — type ? for help.`
              : 'Command prompt. Try: ipconfig, ping <ip>, tracert <ip>, arp -a — type help for more.'}
          </div>
        )}
        {term?.lines.map((l, i) => (
          <pre key={i} className={l.kind === 'in' ? 'whitespace-pre text-[#e7f1fb]' : l.text.startsWith('[NetForge]') || l.text.includes('[NetForge]') ? 'whitespace-pre text-[#9fd8e6]' : 'whitespace-pre text-[#b9c6d4]'}>
            {l.text}
          </pre>
        ))}
      </div>
      <div className="flex items-center gap-1 border-t border-[#1d2530] px-3 py-1.5">
        <span className="shrink-0 text-[#7ee0f1]">{prompt}</span>
        <input
          ref={input}
          value={line}
          onChange={(e) => setLine(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            else if (e.key === 'ArrowUp' && history.length) {
              e.preventDefault();
              const i = hIdx === null ? history.length - 1 : Math.max(0, hIdx - 1);
              setHIdx(i);
              setLine(history[i]);
            } else if (e.key === 'ArrowDown' && hIdx !== null) {
              e.preventDefault();
              const i = hIdx + 1;
              if (i >= history.length) {
                setHIdx(null);
                setLine('');
              } else {
                setHIdx(i);
                setLine(history[i]);
              }
            }
          }}
          spellCheck={false}
          autoComplete="off"
          aria-label={`Command line for ${dev.name}`}
          className="min-w-0 flex-1 bg-transparent text-[#e7f1fb] outline-none focus-visible:outline-none"
        />
      </div>
    </div>
  );
}
