import type { Metadata } from 'next';
import { AuthForm } from '@/components/site/AuthForm';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } };

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1 mb-8 text-sm text-muted">Sign in to continue your learning path.</p>
      <AuthForm mode="login" />
    </div>
  );
}
