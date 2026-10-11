'use client';

import { useAuth } from '@/lib/auth';
import { ButtonLink } from '@/components/ui';

export function HeaderAuth() {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-8 w-28" />;
  if (user) {
    return (
      <ButtonLink href="/app" size="sm">
        Open dashboard
      </ButtonLink>
    );
  }
  return (
    <>
      <ButtonLink href="/login" variant="ghost" size="sm">
        Sign in
      </ButtonLink>
      <ButtonLink href="/register" size="sm">
        Start free
      </ButtonLink>
    </>
  );
}
