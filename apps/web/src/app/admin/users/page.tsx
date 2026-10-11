'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import type { Role } from '@/lib/types';
import { relativeTime } from '@/lib/format';
import { Alert, Button, ErrorState, Input, Select, Spinner } from '@/components/ui';

interface UserRow {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  xp: number;
  createdAt: string;
  attempts: number;
  completed: number;
}

export default function AdminUsers() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin-users', query, page],
    queryFn: () => api.get<{ total: number; pageSize: number; users: UserRow[] }>(`/admin/users?page=${page}${query ? `&q=${encodeURIComponent(query)}` : ''}`),
  });
  const role = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => api.patch(`/admin/users/${id}`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1;
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery(search.trim());
        }}
      >
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email" className="max-w-sm" aria-label="Search users" />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      {role.error && <Alert>{errorMessage(role.error)}</Alert>}
      {q.isLoading && <Spinner />}
      {q.error && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {q.data && (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted">
              <tr>
                {['User', 'Role', 'XP', 'Completed', 'Attempts', 'Joined'].map((h) => (
                  <th key={h} className="px-4 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {q.data.users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted">
                    No users match.
                  </td>
                </tr>
              )}
              {q.data.users.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <p className="font-medium">{u.displayName}</p>
                    <p className="text-xs text-muted">{u.email}</p>
                  </td>
                  <td className="px-4 py-2">
                    <Select value={u.role} onChange={(e) => role.mutate({ id: u.id, role: e.target.value as Role })} className="h-8 w-36 text-xs" aria-label={`Role for ${u.email}`}>
                      <option value="STUDENT">Student</option>
                      <option value="INSTRUCTOR">Instructor</option>
                      <option value="ADMIN">Admin</option>
                    </Select>
                  </td>
                  <td className="px-4 py-2 font-mono">{u.xp}</td>
                  <td className="px-4 py-2 font-mono">{u.completed}</td>
                  <td className="px-4 py-2 font-mono">{u.attempts}</td>
                  <td className="px-4 py-2 text-xs text-muted">{relativeTime(u.createdAt)}</td>
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
