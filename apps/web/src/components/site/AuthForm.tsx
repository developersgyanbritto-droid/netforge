'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, errorMessage } from '@/lib/api';
import type { User } from '@/lib/types';
import { Alert, Button, Field, Input, Select } from '@/components/ui';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState({ email: '', password: '', displayName: '', experience: 'beginner', dailyGoalMinutes: 30 });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});
    try {
      const body = mode === 'login' ? { email: form.email, password: form.password } : form;
      const r = await api.post<{ user: User }>(`/auth/${mode}`, body);
      qc.setQueryData(['me'], { user: r.user });
      const next = new URLSearchParams(window.location.search).get('next');
      router.push(next && next.startsWith('/') && !next.startsWith('//') ? next : '/app');
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details)) {
        setFieldErrors(Object.fromEntries((err.details as { path: string; message: string }[]).map((d) => [d.path, d.message])));
      }
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && <Alert>{error}</Alert>}
      {mode === 'register' && (
        <Field label="Your name" htmlFor="displayName" error={fieldErrors.displayName}>
          <Input id="displayName" autoComplete="name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required />
        </Field>
      )}
      <Field label="Email" htmlFor="email" error={fieldErrors.email}>
        <Input id="email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
      </Field>
      <Field label="Password" htmlFor="password" hint={mode === 'register' ? 'At least 10 characters, with a letter and a number.' : undefined} error={fieldErrors.password}>
        <Input id="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
      </Field>
      {mode === 'register' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Networking experience" htmlFor="experience">
            <Select id="experience" value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })}>
              <option value="beginner">Complete beginner</option>
              <option value="some">Some basics</option>
              <option value="experienced">Experienced (I&apos;ll test out)</option>
            </Select>
          </Field>
          <Field label="Daily goal" htmlFor="goal">
            <Select id="goal" value={form.dailyGoalMinutes} onChange={(e) => setForm({ ...form, dailyGoalMinutes: Number(e.target.value) })}>
              {[15, 30, 45, 60, 90].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
      <Button type="submit" className="w-full" size="lg" loading={loading}>
        {mode === 'login' ? 'Sign in' : 'Create account'}
      </Button>
      <p className="text-center text-sm text-muted">
        {mode === 'login' ? (
          <>
            New here?{' '}
            <Link href="/register" className="font-medium text-accent hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-accent hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
