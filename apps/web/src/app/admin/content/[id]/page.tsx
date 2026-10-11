'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { lessonContentSchema, type Block } from '@netforge/content/schema';
import { api, errorMessage } from '@/lib/api';
import type { ActivityType } from '@/lib/types';
import { Alert, Button, Card, CardHeader, ErrorState, Field, Input, Select, Spinner, Tabs, Textarea } from '@/components/ui';
import { BlockView } from '@/components/lesson/Blocks';

const BLOCK_TEMPLATES: Record<Block['type'], Block> = {
  text: { type: 'text', md: 'Write **markdown** here.' },
  term: { type: 'term', term: 'Term', definition: 'Definition…' },
  callout: { type: 'callout', variant: 'info', md: 'Callout text' },
  topology: {
    type: 'topology',
    goal: 'What should the learner notice?',
    spec: { devices: [{ id: 'pc1', kind: 'pc', x: 80, y: 160, ip: '192.168.1.10/24' }, { id: 'pc2', kind: 'pc', x: 420, y: 160, ip: '192.168.1.11/24' }], links: [['pc1', 'Fa0', 'pc2', 'Fa0']] },
    actions: [{ label: 'Ping PC2', from: 'pc1', to: '192.168.1.11' }],
  },
  encapsulation: { type: 'encapsulation' },
  osi: { type: 'osi' },
  'subnet-explorer': { type: 'subnet-explorer', ip: '192.168.1.10', prefix: 24 },
  binary: { type: 'binary', value: 192 },
  check: { type: 'check', question: 'Question?', options: ['A', 'B'], answer: 0, explanation: 'Why A is right.' },
  table: { type: 'table', columns: ['Column A', 'Column B'], rows: [['1', '2']] },
  steps: { type: 'steps', steps: [{ title: 'Step 1', md: '…' }, { title: 'Step 2', md: '…' }] },
};

const CONTENT_TEMPLATES: Record<ActivityType, unknown> = {
  LESSON: { objectives: ['Objective'], blocks: [BLOCK_TEMPLATES.text] },
  QUIZ: { passScore: 70, checkpoint: false, questions: [{ id: 'q1', type: 'single', prompt: 'Question?', options: ['A', 'B'], answer: 0, explanation: 'Because…' }] },
  LAB: { mode: 'lab', kind: 'configuration', scenario: 'Scenario…', objective: 'Objective', spec: { devices: [], links: [] }, tasks: [{ id: 't1', title: 'Task', checks: [{ type: 'pingMatrix' }] }], hints: [], concepts: [], debrief: '' },
  CHALLENGE: { mode: 'subnetting', scenario: 'Scenario…', difficulty: 'medium', count: 10, timeLimitSec: 600, passScore: 80 },
  PROJECT: { mode: 'lab', kind: 'project', scenario: 'Scenario…', objective: 'Objective', spec: { devices: [], links: [] }, tasks: [{ id: 't1', title: 'Task', checks: [{ type: 'pingMatrix' }] }], hints: [], concepts: [], debrief: '', allowTopologyChanges: true },
};

interface Meta {
  slug: string;
  moduleSlug: string;
  type: ActivityType;
  title: string;
  summary: string;
  order: number;
  estMinutes: number;
  difficulty: number;
  xp: number;
  published: boolean;
  skills: string;
}

function BlockEditor({ value, onChange }: { value: { objectives: string[]; blocks: Block[] }; onChange: (v: { objectives: string[]; blocks: Block[] }) => void }) {
  const [drafts, setDrafts] = useState<string[]>(() => value.blocks.map((b) => JSON.stringify(b, null, 2)));
  const [errors, setErrors] = useState<(string | null)[]>([]);
  const [newType, setNewType] = useState<Block['type']>('text');
  useEffect(() => setDrafts(value.blocks.map((b) => JSON.stringify(b, null, 2))), [value.blocks]);

  const commitBlock = (i: number, text: string) => {
    try {
      const parsed = JSON.parse(text);
      const blocks = [...value.blocks];
      blocks[i] = parsed;
      const r = lessonContentSchema.safeParse({ ...value, blocks });
      const err = r.success ? null : r.error.issues.filter((x) => x.path[1] === i).map((x) => `${x.path.slice(2).join('.')} ${x.message}`).join('; ') || null;
      setErrors((e) => Object.assign([...e], { [i]: err }));
      if (!err) onChange({ ...value, blocks });
    } catch {
      setErrors((e) => Object.assign([...e], { [i]: 'Invalid JSON' }));
    }
  };
  const move = (i: number, d: number) => {
    const blocks = [...value.blocks];
    const [b] = blocks.splice(i, 1);
    blocks.splice(i + d, 0, b);
    onChange({ ...value, blocks });
  };

  return (
    <div className="space-y-3">
      <Field label="Learning objectives (one per line)" htmlFor="objectives">
        <Textarea id="objectives" rows={3} value={value.objectives.join('\n')} onChange={(e) => onChange({ ...value, objectives: e.target.value.split('\n').filter((l) => l.trim()) })} />
      </Field>
      {value.blocks.map((b, i) => (
        <div key={i} className="rounded-lg border border-border">
          <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-1.5 text-xs">
            <span className="font-mono font-semibold">
              {i + 1}. {b.type}
            </span>
            <span className="ml-auto flex gap-1">
              <button disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 hover:bg-surface-3 disabled:opacity-30" aria-label="Move up">
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button disabled={i === value.blocks.length - 1} onClick={() => move(i, 1)} className="rounded p-1 hover:bg-surface-3 disabled:opacity-30" aria-label="Move down">
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => onChange({ ...value, blocks: value.blocks.filter((_, k) => k !== i) })} className="rounded p-1 hover:bg-surface-3 hover:text-danger" aria-label="Delete block">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>
          <Textarea
            value={drafts[i] ?? ''}
            onChange={(e) => setDrafts(Object.assign([...drafts], { [i]: e.target.value }))}
            onBlur={(e) => commitBlock(i, e.target.value)}
            rows={Math.min(14, (drafts[i] ?? '').split('\n').length + 1)}
            className="rounded-none border-0 font-mono text-xs focus:ring-0"
            aria-label={`Block ${i + 1} JSON`}
          />
          {errors[i] && <p className="border-t border-border px-3 py-1.5 text-xs text-danger">{errors[i]}</p>}
        </div>
      ))}
      <div className="flex gap-2">
        <Select value={newType} onChange={(e) => setNewType(e.target.value as Block['type'])} className="w-48" aria-label="New block type">
          {Object.keys(BLOCK_TEMPLATES).map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
        <Button variant="secondary" onClick={() => onChange({ ...value, blocks: [...value.blocks, structuredClone(BLOCK_TEMPLATES[newType])] })}>
          <Plus className="h-4 w-4" /> Add block
        </Button>
      </div>
    </div>
  );
}

export default function ActivityEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const qc = useQueryClient();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [content, setContent] = useState<unknown>(null);
  const [rawJson, setRawJson] = useState('');
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const q = useQuery({
    queryKey: ['admin-activity', id],
    enabled: !isNew,
    queryFn: () => api.get<{ activity: Omit<Meta, 'skills'> & { content: unknown; skills: { slug: string; weight: number }[] } }>(`/admin/activities/${id}`),
  });
  useEffect(() => {
    if (isNew && !meta) {
      const moduleSlug = new URLSearchParams(window.location.search).get('module') ?? '';
      setMeta({ slug: '', moduleSlug, type: 'LESSON', title: '', summary: '', order: 1000, estMinutes: 10, difficulty: 1, xp: 20, published: false, skills: '' });
      setContent(CONTENT_TEMPLATES.LESSON);
      setRawJson(JSON.stringify(CONTENT_TEMPLATES.LESSON, null, 2));
    }
    if (q.data && !meta) {
      const a = q.data.activity;
      setMeta({ slug: a.slug, moduleSlug: a.moduleSlug, type: a.type, title: a.title, summary: a.summary, order: a.order, estMinutes: a.estMinutes, difficulty: a.difficulty, xp: a.xp, published: a.published, skills: a.skills.map((s) => s.slug).join(', ') });
      setContent(a.content);
      setRawJson(JSON.stringify(a.content, null, 2));
    }
  }, [isNew, q.data, meta]);

  const currentContent = () => (meta?.type === 'LESSON' ? content : JSON.parse(rawJson));
  const body = () => ({ ...meta!, content: currentContent(), skills: meta!.skills.split(',').map((s) => s.trim()).filter(Boolean).map((slug) => ({ slug, weight: 1 })) });

  const save = useMutation({
    mutationFn: () => (isNew ? api.post<{ activity: { id: string } }>('/admin/activities', body()) : api.put<{ activity: { id: string } }>(`/admin/activities/${id}`, body())),
    onSuccess: (r) => {
      setStatus({ ok: true, text: 'Saved. Learners see the new version immediately.' });
      qc.invalidateQueries({ queryKey: ['admin-content'] });
      if (isNew) router.replace(`/admin/content/${r.activity.id}`);
    },
    onError: (e) => setStatus({ ok: false, text: errorMessage(e) }),
  });
  const validate = useMutation({
    mutationFn: () => api.post('/admin/activities/validate', { type: meta!.type, content: currentContent() }),
    onSuccess: () => setStatus({ ok: true, text: 'Content is valid.' }),
    onError: (e) => setStatus({ ok: false, text: errorMessage(e) }),
  });
  const del = useMutation({
    mutationFn: () => api.del(`/admin/activities/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-content'] });
      router.push('/admin/content');
    },
  });

  if (!isNew && q.isLoading) return <Spinner />;
  if (q.error) return <ErrorState message={errorMessage(q.error)} />;
  if (!meta) return <Spinner />;
  const set = (patch: Partial<Meta>) => setMeta({ ...meta, ...patch });
  const safe = (fn: () => void) => {
    try {
      fn();
    } catch {
      setStatus({ ok: false, text: 'The content JSON is not valid JSON.' });
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href="/admin/content" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Content
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">{isNew ? 'New activity' : meta.title}</h1>
      <Card>
        <CardHeader title="Details" />
        <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
          <Field label="Title" htmlFor="a-title">
            <Input id="a-title" value={meta.title} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Slug" htmlFor="a-slug">
            <Input id="a-slug" value={meta.slug} onChange={(e) => set({ slug: e.target.value })} className="font-mono" />
          </Field>
          <Field label="Summary" htmlFor="a-sum">
            <Input id="a-sum" value={meta.summary} onChange={(e) => set({ summary: e.target.value })} />
          </Field>
          <Field label="Module slug" htmlFor="a-mod">
            <Input id="a-mod" value={meta.moduleSlug} onChange={(e) => set({ moduleSlug: e.target.value })} className="font-mono" />
          </Field>
          <Field label="Type" htmlFor="a-type" hint={isNew ? 'Changing the type resets the content template.' : undefined}>
            <Select
              id="a-type"
              value={meta.type}
              disabled={!isNew}
              onChange={(e) => {
                const t = e.target.value as ActivityType;
                set({ type: t });
                setContent(CONTENT_TEMPLATES[t]);
                setRawJson(JSON.stringify(CONTENT_TEMPLATES[t], null, 2));
              }}
            >
              {(['LESSON', 'QUIZ', 'LAB', 'CHALLENGE', 'PROJECT'] as ActivityType[]).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Skills (slugs, comma-separated)" htmlFor="a-skills">
            <Input id="a-skills" value={meta.skills} onChange={(e) => set({ skills: e.target.value })} className="font-mono" />
          </Field>
          <div className="grid grid-cols-4 gap-2 sm:col-span-2">
            {(['order', 'estMinutes', 'difficulty', 'xp'] as const).map((k) => (
              <Field key={k} label={k === 'estMinutes' ? 'Minutes' : k[0].toUpperCase() + k.slice(1)} htmlFor={`a-${k}`}>
                <Input id={`a-${k}`} type="number" value={meta[k]} onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<Meta>)} />
              </Field>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={meta.published} onChange={(e) => set({ published: e.target.checked })} className="accent-[var(--accent)]" /> Published (visible to learners)
          </label>
        </div>
      </Card>
      <Card>
        <div className="px-5 pt-3">
          <Tabs tabs={[{ id: 'edit', label: meta.type === 'LESSON' ? 'Block builder' : 'Content JSON' }, ...(meta.type === 'LESSON' ? [{ id: 'preview' as const, label: 'Preview' }] : [])]} value={tab} onChange={setTab} />
        </div>
        <div className="p-5">
          {tab === 'edit' && meta.type === 'LESSON' && <BlockEditor value={content as { objectives: string[]; blocks: Block[] }} onChange={setContent} />}
          {tab === 'edit' && meta.type !== 'LESSON' && (
            <Textarea value={rawJson} onChange={(e) => setRawJson(e.target.value)} rows={28} className="font-mono text-xs" aria-label="Content JSON" />
          )}
          {tab === 'preview' && meta.type === 'LESSON' && (
            <div className="mx-auto max-w-3xl space-y-6">
              {(content as { blocks: Block[] }).blocks.map((b, i) => (
                <BlockView key={`${i}-${JSON.stringify(b).length}`} block={b} />
              ))}
            </div>
          )}
        </div>
      </Card>
      {status && <Alert tone={status.ok ? 'success' : 'danger'}>{status.ok && <CheckCircle2 className="mr-1 inline h-4 w-4" />}{status.text}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => safe(() => save.mutate())} loading={save.isPending}>
          Save
        </Button>
        <Button variant="secondary" onClick={() => safe(() => validate.mutate())} loading={validate.isPending}>
          Validate
        </Button>
        {!isNew && (
          <Button variant="danger" className="ml-auto" onClick={() => confirm('Delete this activity and all learner progress on it?') && del.mutate()} loading={del.isPending}>
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
