import type { Metadata } from 'next';
import { AppShell } from '@/components/app/AppShell';

export const metadata: Metadata = { title: 'Admin', robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AppShell admin>{children}</AppShell>;
}
