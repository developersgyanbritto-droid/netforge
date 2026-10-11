'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { Button, EmptyState, ErrorState, Spinner } from '@/components/ui';

interface Entry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  meta: unknown;
  createdAt: string;
  actor: { email: string } | null;
}

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['audit', page], queryFn: () => api.get<{ total: number; pageSize: number; entries: Entry[] }>(`/admin/audit?page=${page}`) });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const pages = Math.max(1, Math.ceil(q.data.total / q.data.pageSize));
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
      {q.data.entries.length === 0 ? (
        <EmptyState title="No admin activity yet" description="Content edits and role changes are recorded here." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted">
              <tr>
                {['When', 'Actor', 'Action', 'Entity', 'Details'].map((h) => (
                  <th key={h} className="px-4 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {q.data.entries.map((e) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="px-4 py-2 text-xs whitespace-nowrap text-muted">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2">{e.actor?.email ?? '—'}</td>
                  <td className="px-4 py-2 font-mono text-xs">{e.action}</td>
                  <td className="px-4 py-2 text-xs">{e.entity}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted">{e.meta ? JSON.stringify(e.meta) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center gap-2 text-sm">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Previous
        </Button>
        <span className="text-muted">
          Page {page} of {pages}
        </span>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
