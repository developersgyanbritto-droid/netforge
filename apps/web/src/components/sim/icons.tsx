import type { DeviceKind } from '@netforge/sim-engine';

// Diagram-style device symbols (Cisco-inspired shapes, original artwork).
export function DeviceIcon({ kind, size = 40 }: { kind: DeviceKind; size?: number }) {
  const s = { width: size, height: size, viewBox: '0 0 48 48', fill: 'none', 'aria-hidden': true } as const;
  switch (kind) {
    case 'router':
      return (
        <svg {...s}>
          <circle cx="24" cy="24" r="19" fill="var(--l3)" opacity="0.15" stroke="var(--l3)" strokeWidth="2" />
          <path d="M24 10v10M24 28v10M10 24h10M28 24h10" stroke="var(--l3)" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M20 14l4-4 4 4M20 34l4 4 4-4M14 20l-4 4 4 4M34 20l4 4-4 4" stroke="var(--l3)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'switch':
      return (
        <svg {...s}>
          <rect x="4" y="13" width="40" height="22" rx="4" fill="var(--l2)" opacity="0.15" stroke="var(--l2)" strokeWidth="2" />
          <path d="M12 20h22l-4-3M36 28H14l4 3" stroke="var(--l2)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'server':
      return (
        <svg {...s}>
          <rect x="13" y="5" width="22" height="38" rx="3" fill="currentColor" opacity="0.08" stroke="currentColor" strokeWidth="2" />
          <path d="M17 13h14M17 19h14M17 25h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="24" cy="35" r="2" fill="var(--success)" />
        </svg>
      );
    case 'laptop':
      return (
        <svg {...s}>
          <rect x="9" y="11" width="30" height="20" rx="2" fill="currentColor" opacity="0.08" stroke="currentColor" strokeWidth="2" />
          <path d="M4 36h40l-3 4H7l-3-4z" fill="currentColor" opacity="0.2" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg {...s}>
          <rect x="6" y="8" width="36" height="24" rx="2.5" fill="currentColor" opacity="0.08" stroke="currentColor" strokeWidth="2" />
          <path d="M18 40h12M24 32v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
  }
}

export const KIND_LABEL: Record<DeviceKind, string> = { pc: 'PC', laptop: 'Laptop', server: 'Server', switch: 'Switch', router: 'Router' };
