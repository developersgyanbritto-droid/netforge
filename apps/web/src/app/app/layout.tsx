import type { Metadata } from 'next';
import { AppShell } from '@/components/app/AppShell';

export const metadata: Metadata = { title: 'Dashboard', robots: { index: false, follow: false } };

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
