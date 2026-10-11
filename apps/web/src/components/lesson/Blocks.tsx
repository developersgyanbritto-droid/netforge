'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { BookMarked, Building2, Info, Lightbulb, RotateCcw, TriangleAlert } from 'lucide-react';
import { buildNetwork } from '@netforge/sim-engine';
import type { Block } from '@netforge/content/schema';
import { Markdown } from '@/components/ui/markdown';
import { Button } from '@/components/ui';
import { SimProvider, Simulator, useSimStore } from '@/components/sim/Simulator';
import { BinaryWidget, EncapsulationWidget, InlineCheck, OsiWidget, SubnetExplorer } from './widgets';

const CALLOUT = {
  info: { icon: Info, cls: 'border-accent/30 bg-accent-soft/60', title: 'Note' },
  tip: { icon: Lightbulb, cls: 'border-success/30 bg-success-soft/60', title: 'Tip' },
  warning: { icon: TriangleAlert, cls: 'border-warning/40 bg-warning-soft/60', title: 'Watch out' },
  'real-world': { icon: Building2, cls: 'border-l2/30 bg-surface-2', title: 'In the real world' },
};

function TopologyBlock({ block }: { block: Extract<Block, { type: 'topology' }> }) {
  const store = useSimStore(buildNetwork(block.spec), !!block.editable);
  const [key, setKey] = useState(0);
  return (
    <figure className="space-y-2">
      {block.title && <figcaption className="text-sm font-semibold">{block.title}</figcaption>}
      <p className="text-sm text-muted">{block.goal}</p>
      <SimProvider store={store}>
        <Simulator key={key} mode="embed" height={block.height} actions={block.actions} />
      </SimProvider>
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            store.getState().setNet(buildNetwork(block.spec));
            setKey((k) => k + 1);
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset this network
        </Button>
      </div>
    </figure>
  );
}

export function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'text':
      return <Markdown>{block.md}</Markdown>;
    case 'term':
      return (
        <div className="flex gap-3 rounded-xl border border-border bg-surface p-4">
          <BookMarked className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
          <div>
            <p className="font-semibold">
              {block.term}
              {block.expansion && <span className="font-normal text-muted"> — {block.expansion}</span>}
            </p>
            <p className="mt-1 text-[15px] text-fg/90">{block.definition}</p>
          </div>
        </div>
      );
    case 'callout': {
      const c = CALLOUT[block.variant];
      const Icon = c.icon;
      return (
        <aside className={clsx('flex gap-3 rounded-xl border p-4', c.cls)}>
          <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{block.title ?? c.title}</p>
            <Markdown className="text-[15px]">{block.md}</Markdown>
          </div>
        </aside>
      );
    }
    case 'topology':
      return <TopologyBlock block={block} />;
    case 'encapsulation':
      return <EncapsulationWidget />;
    case 'osi':
      return <OsiWidget />;
    case 'subnet-explorer':
      return <SubnetExplorer ip={block.ip} prefix={block.prefix} />;
    case 'binary':
      return <BinaryWidget value={block.value} />;
    case 'check':
      return <InlineCheck question={block.question} options={block.options} answer={block.answer} explanation={block.explanation} />;
    case 'table':
      return (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            {block.caption && <caption className="bg-surface-2 px-3 py-2 text-left text-xs font-semibold text-muted">{block.caption}</caption>}
            <thead className="bg-surface-2 text-left">
              <tr>
                {block.columns.map((c) => (
                  <th key={c} className="border-b border-border px-3 py-2 font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {r.map((c, j) => (
                    <td key={j} className={clsx('px-3 py-2 align-top', j === 0 && 'font-medium')}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'steps':
      return <StepsBlock block={block} />;
  }
}

function StepsBlock({ block }: { block: Extract<Block, { type: 'steps' }> }) {
  const [i, setI] = useState(0);
  const s = block.steps[i];
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      {block.title && <p className="mb-3 text-sm font-semibold">{block.title}</p>}
      <ol className="mb-3 flex flex-wrap gap-1.5" aria-label="Steps">
        {block.steps.map((st, k) => (
          <li key={k}>
            <button
              onClick={() => setI(k)}
              aria-current={k === i ? 'step' : undefined}
              className={clsx('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition', k === i ? 'border-accent bg-accent-soft text-accent' : k < i ? 'border-border bg-surface-2' : 'border-border text-muted hover:bg-surface-2')}
            >
              <span className="font-mono">{k + 1}</span> {st.title}
            </button>
          </li>
        ))}
      </ol>
      <div className="min-h-[72px] rounded-lg bg-surface-2 p-3" aria-live="polite">
        <p className="mb-1 font-semibold">
          {i + 1}. {s.title}
        </p>
        <Markdown>{s.md}</Markdown>
      </div>
      <div className="mt-3 flex justify-between">
        <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => setI(i - 1)}>
          Previous
        </Button>
        <Button size="sm" variant="secondary" disabled={i === block.steps.length - 1} onClick={() => setI(i + 1)}>
          Next step
        </Button>
      </div>
    </div>
  );
}
