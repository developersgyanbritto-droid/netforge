'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Calculator,
  FileText,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Menu,
  Network,
  Radar,
  ScrollText,
  Settings,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { relativeTime } from '@/lib/format';
import { Logo } from '@/components/site/Logo';
import { ThemeToggle } from '@/components/site/ThemeToggle';
import { Spinner } from '@/components/ui';

const STUDENT_NAV = [
  { href: '/app', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/app/path', label: 'Learning path', icon: MapIcon },
  { href: '/app/lab', label: 'Network lab', icon: Network },
  { href: '/app/subnetting', label: 'Subnetting trainer', icon: Calculator },
  { href: '/app/skills', label: 'Skill map', icon: Radar },
  { href: '/app/achievements', label: 'Achievements', icon: Award },
  { href: '/app/notes', label: 'Notes & bookmarks', icon: FileText },
  { href: '/app/settings', label: 'Settings', icon: Settings },
];

const ADMIN_NAV = [
  { href: '/admin', label: 'Analytics', icon: BarChart3, exact: true },
  { href: '/admin/content', label: 'Content', icon: BookOpen },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/audit', label: 'Audit log', icon: ScrollText },
];

interface Notification {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<{ notifications: Notification[] }>('/me/notifications'), refetchInterval: 60_000 });
  const read = useMutation({ mutationFn: () => api.post('/me/notifications/read', {}), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const unread = q.data?.notifications.filter((n) => !n.readAt).length ?? 0;
  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen(!open);
          if (!open && unread) read.mutate();
        }}
        className="relative rounded-md p-2 text-muted hover:bg-surface-2 hover:text-fg"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
        aria-expanded={open}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-accent" />}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
          <div className="border-b border-border px-4 py-2.5 text-sm font-semibold">Notifications</div>
          <ul className="max-h-96 overflow-y-auto">
            {!q.data?.notifications.length && <li className="px-4 py-6 text-center text-sm text-muted">Nothing yet.</li>}
            {q.data?.notifications.map((n) => (
              <li key={n.id} className="border-b border-border px-4 py-3 last:border-0">
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-xs text-muted">{n.body}</p>
                <p className="mt-1 text-[11px] text-faint">{relativeTime(n.createdAt)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Records active study time: one minute per minute of visible, recently-interacted use. */
function useStudyHeartbeat(enabled: boolean) {
  const lastInteraction = useRef(Date.now());
  useEffect(() => {
    if (!enabled) return;
    const mark = () => (lastInteraction.current = Date.now());
    const evs = ['pointerdown', 'keydown', 'scroll'];
    evs.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const t = setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - lastInteraction.current < 120_000) {
        api.post('/me/heartbeat', { minutes: 1 }).catch(() => undefined);
      }
    }, 60_000);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, mark));
      clearInterval(t);
    };
  }, [enabled]);
}

export function AppShell({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  useStudyHeartbeat(!!user && !admin);

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);
  useEffect(() => setMobileOpen(false), [pathname]);

  if (loading || !user) return <Spinner label="Loading your workspace…" className="min-h-screen" />;
  if (admin && user.role === 'STUDENT') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
        <Shield className="h-8 w-8 text-muted" />
        <p className="font-medium">Admin access required</p>
        <Link href="/app" className="text-sm text-accent hover:underline">
          Back to your dashboard
        </Link>
      </div>
    );
  }

  const nav = admin ? ADMIN_NAV : STUDENT_NAV;
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-3" aria-label={admin ? 'Admin navigation' : 'App navigation'}>
      <div className="mb-4 flex items-center justify-between px-2 pt-1">
        <Logo href={admin ? '/admin' : '/app'} />
        <button className="rounded p-1 text-muted lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu">
          <X className="h-4 w-4" />
        </button>
      </div>
      {nav.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          aria-current={isActive(n.href, n.exact) ? 'page' : undefined}
          className={clsx('flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition', isActive(n.href, n.exact) ? 'bg-surface-2 font-medium text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg')}
        >
          <n.icon className="h-4 w-4" aria-hidden /> {n.label}
        </Link>
      ))}
      <div className="mt-auto space-y-1 border-t border-border pt-3">
        {user.role !== 'STUDENT' && (
          <Link href={admin ? '/app' : '/admin'} className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
            <Shield className="h-4 w-4" /> {admin ? 'Student view' : 'Admin'}
          </Link>
        )}
        <div className="flex items-center gap-2 px-2.5 py-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{user.displayName.slice(0, 1).toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.displayName}</p>
            <p className="truncate text-xs text-muted">{user.xp} XP</p>
          </div>
          <button onClick={logout} className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Sign out" title="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-border bg-surface lg:block">{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)}>
          <aside className="h-full w-64 bg-surface" onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-bg/85 px-4 backdrop-blur">
          <button className="rounded-md p-2 text-muted hover:bg-surface-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-4 w-4" />
          </button>
          <div className="lg:hidden">
            <Logo href={admin ? '/admin' : '/app'} />
          </div>
          <div className="ml-auto flex items-center gap-1">
            {!admin && <Notifications />}
            <ThemeToggle />
          </div>
        </header>
        <main id="main" className="min-w-0 flex-1 px-4 py-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
