import Link from 'next/link';

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="font-mono text-sm text-muted">404 · destination host unreachable</p>
      <h1 className="text-2xl font-semibold">This page has no route.</h1>
      <Link href="/" className="text-sm font-medium text-accent hover:underline">
        Back to the homepage
      </Link>
    </main>
  );
}
