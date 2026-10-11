import Link from 'next/link';
import { Logo } from '@/components/site/Logo';
import { ThemeToggle } from '@/components/site/ThemeToggle';
import { HeaderAuth } from '@/components/site/HeaderAuth';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Logo />
          <nav className="hidden items-center gap-5 text-sm text-muted md:flex" aria-label="Main">
            <Link href="/#how" className="hover:text-fg">
              How it works
            </Link>
            <Link href="/curriculum" className="hover:text-fg">
              Curriculum
            </Link>
            <Link href="/#labs" className="hover:text-fg">
              Labs
            </Link>
            <Link href="/about" className="hover:text-fg">
              About
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <HeaderAuth />
          </div>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <Logo />
          <nav className="flex gap-5" aria-label="Footer">
            <Link href="/curriculum" className="hover:text-fg">
              Curriculum
            </Link>
            <Link href="/about" className="hover:text-fg">
              About
            </Link>
            <Link href="/register" className="hover:text-fg">
              Start learning
            </Link>
          </nav>
          <p className="text-xs">Original educational content. Not affiliated with Cisco or MikroTik.</p>
        </div>
      </footer>
    </div>
  );
}
