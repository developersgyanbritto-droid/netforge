import type { Metadata } from 'next';
import { AuthForm } from '@/components/site/AuthForm';

export const metadata: Metadata = { title: 'Create your account', description: 'Start learning networking with interactive labs — free.' };

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Start learning networking</h1>
      <p className="mt-1 mb-8 text-sm text-muted">Your progress, labs and skill map are saved to your account.</p>
      <AuthForm mode="register" />
    </div>
  );
}
