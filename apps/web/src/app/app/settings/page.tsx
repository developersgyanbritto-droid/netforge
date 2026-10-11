'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import type { User } from '@/lib/types';
import { Alert, Button, Card, CardHeader, Field, Input, Select } from '@/components/ui';

export default function SettingsPage() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const qc = useQueryClient();
  const [form, setForm] = useState({ displayName: '', dailyGoalMinutes: 30, experience: 'beginner' });
  useEffect(() => {
    if (user) setForm({ displayName: user.displayName, dailyGoalMinutes: user.dailyGoalMinutes, experience: user.experience });
  }, [user]);
  const save = useMutation({
    mutationFn: () => api.patch<{ user: User }>('/me/settings', form),
    onSuccess: (r) => {
      qc.setQueryData(['me'], { user: r.user });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <Card>
        <CardHeader title="Profile & goals" />
        <form onSubmit={submit} className="space-y-4 px-5 pb-5">
          <Field label="Display name" htmlFor="dn">
            <Input id="dn" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </Field>
          <Field label="Email" htmlFor="em" hint="Contact an administrator to change your email.">
            <Input id="em" value={user?.email ?? ''} disabled />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Daily goal" htmlFor="goal" hint="Used to build your daily plan.">
              <Select id="goal" value={form.dailyGoalMinutes} onChange={(e) => setForm({ ...form, dailyGoalMinutes: Number(e.target.value) })}>
                {[15, 30, 45, 60, 90, 120].map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Experience" htmlFor="exp">
              <Select id="exp" value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })}>
                <option value="beginner">Complete beginner</option>
                <option value="some">Some basics</option>
                <option value="experienced">Experienced</option>
              </Select>
            </Field>
          </div>
          {save.error && <Alert>{errorMessage(save.error)}</Alert>}
          {save.isSuccess && <Alert tone="success">Settings saved.</Alert>}
          <Button type="submit" loading={save.isPending}>
            Save changes
          </Button>
        </form>
      </Card>
      <Card>
        <CardHeader title="Appearance" subtitle="Stored on this device only." />
        <div className="flex gap-2 px-5 pb-5">
          {(['light', 'dark', 'system'] as const).map((t) => (
            <Button key={t} variant={theme === t ? 'primary' : 'secondary'} size="sm" onClick={() => setTheme(t)} className="capitalize">
              {t}
            </Button>
          ))}
        </div>
      </Card>
    </div>
  );
}
