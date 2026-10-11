'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { typeLabel } from '@/lib/format';
import type { ActivityType } from '@/lib/types';
import { Alert, Badge, Button, ButtonLink, ErrorState, Field, Input, Modal, Spinner, Textarea } from '@/components/ui';

interface AdminModule {
  id: string;
  slug: string;
  title: string;
  summary: string;
  level: number;
  order: number;
  published: boolean;
  prerequisites: { requires: { slug: string } }[];
  activities: { id: string; slug: string; type: ActivityType; title: string; order: number; published: boolean; version: number }[];
}
interface AdminContent {
  tracks: { id: string; slug: string; title: string; modules: AdminModule[] }[];
}

function ModuleForm({ initial, trackSlug, onDone }: { initial?: AdminModule; trackSlug: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    slug: initial?.slug ?? '',
    title: initial?.title ?? '',
    summary: initial?.summary ?? '',
    level: initial?.level ?? 0,
    order: initial?.order ?? 0,
    published: initial?.published ?? true,
    prerequisites: initial?.prerequisites.map((p) => p.requires.slug).join(', ') ?? '',
  });
  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, trackSlug, prerequisites: f.prerequisites.split(',').map((s) => s.trim()).filter(Boolean) };
      return initial ? api.put(`/admin/modules/${initial.id}`, body) : api.post('/admin/modules', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-content'] });
      onDone();
    },
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Slug" htmlFor="m-slug">
          <Input id="m-slug" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} className="font-mono" />
        </Field>
        <Field label="Title" htmlFor="m-title">
          <Input id="m-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </Field>
      </div>
      <Field label="Summary" htmlFor="m-sum">
        <Textarea id="m-sum" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} rows={2} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Level" htmlFor="m-level">
          <Input id="m-level" type="number" value={f.level} onChange={(e) => setF({ ...f, level: Number(e.target.value) })} />
        </Field>
        <Field label="Order" htmlFor="m-order">
          <Input id="m-order" type="number" value={f.order} onChange={(e) => setF({ ...f, order: Number(e.target.value) })} />
        </Field>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} className="accent-[var(--accent)]" /> Published
        </label>
      </div>
      <Field label="Prerequisite module slugs" htmlFor="m-pre" hint="Comma-separated. Cycles are rejected.">
        <Input id="m-pre" value={f.prerequisites} onChange={(e) => setF({ ...f, prerequisites: e.target.value })} className="font-mono" />
      </Field>
      {save.error && <Alert>{errorMessage(save.error)}</Alert>}
      <Button type="submit" loading={save.isPending}>
        {initial ? 'Save module' : 'Create module'}
      </Button>
    </form>
  );
}

export default function AdminContentPage() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['admin-content'], queryFn: () => api.get<AdminContent>('/admin/content') });
  const [editing, setEditing] = useState<{ module?: AdminModule; trackSlug: string } | null>(null);
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const isAdmin = user?.role === 'ADMIN';
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
        <p className="text-sm text-muted">Every lesson, quiz, lab and challenge is structured data validated against the content schema before it is saved.</p>
      </div>
      {q.data.tracks.map((t) => (
        <section key={t.id} className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t.title}</h2>
            {isAdmin && (
              <Button size="sm" variant="secondary" onClick={() => setEditing({ trackSlug: t.slug })}>
                <Plus className="h-3.5 w-3.5" /> Module
              </Button>
            )}
          </div>
          {t.modules.map((m) => (
            <details key={m.id} className="rounded-xl border border-border bg-surface">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                <span className="font-mono text-xs text-muted">L{m.level}</span>
                <span className="flex-1 font-medium">{m.title}</span>
                {!m.published && <Badge tone="warning">Draft</Badge>}
                <span className="text-xs text-muted">{m.activities.length} activities</span>
                {isAdmin && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setEditing({ module: m, trackSlug: t.slug });
                    }}
                    className="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg"
                    aria-label={`Edit ${m.title}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </summary>
              <ul className="divide-y divide-border border-t border-border">
                {m.activities.map((a) => (
                  <li key={a.id}>
                    <Link href={`/admin/content/${a.id}`} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-surface-2">
                      <span className="w-10 font-mono text-xs text-muted">{a.order}</span>
                      <span className="flex-1 truncate">{a.title}</span>
                      {!a.published && <Badge tone="warning">Draft</Badge>}
                      <Badge>{typeLabel[a.type]}</Badge>
                      <span className="font-mono text-xs text-faint">v{a.version}</span>
                    </Link>
                  </li>
                ))}
                <li className="px-4 py-2">
                  <ButtonLink href={`/admin/content/new?module=${m.slug}`} size="sm" variant="ghost">
                    <Plus className="h-3.5 w-3.5" /> Add activity
                  </ButtonLink>
                </li>
              </ul>
            </details>
          ))}
        </section>
      ))}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.module ? `Edit ${editing.module.title}` : 'New module'} wide>
        {editing && <ModuleForm initial={editing.module} trackSlug={editing.trackSlug} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
