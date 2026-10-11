'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';

export { clsx };

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-110 shadow-sm',
  secondary: 'bg-surface-2 text-fg hover:bg-surface-3 border border-border',
  outline: 'border border-border-strong text-fg hover:bg-surface-2',
  ghost: 'text-muted hover:text-fg hover:bg-surface-2',
  danger: 'bg-danger text-white hover:brightness-110',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-[15px] gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      className={clsx('inline-flex items-center justify-center rounded-md font-medium transition disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap', variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function ButtonLink({ href, variant = 'primary', size = 'md', className, children }: { href: string; variant?: Variant; size?: Size; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={clsx('inline-flex items-center justify-center rounded-md font-medium transition whitespace-nowrap', variants[variant], sizes[size], className)}>
      {children}
    </Link>
  );
}

export function Card({ className, children, as: As = 'div' }: { className?: string; children: ReactNode; as?: 'div' | 'section' | 'article' }) {
  return <As className={clsx('rounded-xl border border-border bg-surface', className)}>{children}</As>;
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-start justify-between gap-3 px-5 pt-4 pb-3', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const badgeTones = {
  neutral: 'bg-surface-2 text-muted border-border',
  accent: 'bg-accent-soft text-accent border-transparent',
  success: 'bg-success-soft text-success border-transparent',
  warning: 'bg-warning-soft text-warning border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
  l2: 'bg-surface-2 text-l2 border-border',
};
export type Tone = keyof typeof badgeTones;

export function Badge({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return <span className={clsx('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap', badgeTones[tone], className)}>{children}</span>;
}

export function ProgressBar({ value, className, tone = 'accent', label }: { value: number; className?: string; tone?: 'accent' | 'success' | 'warning'; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const color = tone === 'success' ? 'bg-success' : tone === 'warning' ? 'bg-warning' : 'bg-accent';
  return (
    <div className={clsx('h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={clsx('h-full rounded-full transition-all duration-500', color)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Spinner({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div className={clsx('flex items-center justify-center gap-2 py-12 text-sm text-muted', className)} role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <div className="mb-3 text-faint">{icon ?? <Inbox className="h-7 w-7" aria-hidden />}</div>
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-danger/30 bg-danger-soft px-6 py-10 text-center" role="alert">
      <AlertTriangle className="h-6 w-6 text-danger" aria-hidden />
      <p className="text-sm">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Alert({ tone = 'danger', children }: { tone?: 'danger' | 'success' | 'warning' | 'accent'; children: ReactNode }) {
  const t = { danger: 'bg-danger-soft text-danger', success: 'bg-success-soft text-success', warning: 'bg-warning-soft text-warning', accent: 'bg-accent-soft text-accent' }[tone];
  return (
    <div className={clsx('rounded-md px-3 py-2 text-sm', t)} role={tone === 'danger' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

const fieldBase = 'rounded-md border border-border bg-surface px-3 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-60';
/** Full width unless the caller sets an explicit width (avoids w-full vs w-* conflicts). */
const hasWidth = (c?: string) => /(^|\s)w-/.test(c ?? '');

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={clsx(fieldBase, 'h-9', !hasWidth(className) && 'w-full', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={clsx(fieldBase, 'h-9 pr-8', !hasWidth(className) && 'w-full', className)} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={clsx(fieldBase, 'w-full py-2', className)} {...rest} />;
});

export function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor?: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (t: T) => void; className?: string }) {
  return (
    <div role="tablist" className={clsx('flex items-center gap-1 border-b border-border', className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={clsx(
            '-mb-px border-b-2 px-3 py-2 text-[13px] font-medium whitespace-nowrap transition',
            value === t.id ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">{children}</kbd>;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx('max-h-[90vh] w-full overflow-y-auto rounded-xl border border-border bg-surface shadow-2xl', wide ? 'max-w-3xl' : 'max-w-lg')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
