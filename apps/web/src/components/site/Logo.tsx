import Link from 'next/link';

export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold tracking-tight" aria-label="NetForge Academy home">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="7" fill="#0b1117" />
        <circle cx="9" cy="16" r="3.2" fill="#22d3ee" />
        <circle cx="23" cy="9" r="3.2" fill="#a78bfa" />
        <circle cx="23" cy="23" r="3.2" fill="#4ade80" />
        <path d="M11.8 14.6 20.2 10.4M11.8 17.4l8.4 4.2M23 12.2v7.6" stroke="#cfe3ef" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span>
        NetForge<span className="font-normal text-muted"> Academy</span>
      </span>
    </Link>
  );
}
