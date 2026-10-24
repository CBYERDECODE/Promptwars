import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { LoaderCircle } from 'lucide-react';
import { Tone, TONE_STYLES, cx } from './tones';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'sm';
  icon?: LucideIcon;
  /** Renders a spinner, disables the button and announces the pending state. */
  loading?: boolean;
  /** Text announced while loading, e.g. "Recording decision". */
  loadingLabel?: string;
  fullWidth?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white border border-accent-strong hover:bg-accent-strong',
  secondary: 'bg-white text-ink border border-line-strong hover:bg-surface-sunken',
  danger: 'bg-critical text-white border border-critical hover:opacity-90',
  ghost: 'bg-transparent text-ink-muted border border-transparent hover:bg-surface-sunken'
};

const SIZES: Record<'md' | 'sm', string> = {
  // 44px minimum target for `md`, matching WCAG 2.2 "Target Size (Minimum)".
  md: 'min-h-tap px-3.5 py-2 text-xs gap-2',
  sm: 'min-h-[36px] px-2.5 py-1.5 text-[11px] gap-1.5'
};

/**
 * Single button primitive so every action in the app has the same target size,
 * focus ring and disabled treatment. Disabled and loading buttons are inert but
 * keep their label, so the layout never shifts and nothing becomes a dead end.
 */
export const Button = React.forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    icon: Icon,
    loading = false,
    loadingLabel,
    fullWidth = false,
    children,
    className,
    disabled,
    type = 'button',
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center rounded-control font-semibold transition duration-fast',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:cursor-not-allowed disabled:opacity-60',
        SIZES[size],
        VARIANTS[variant],
        fullWidth && 'w-full',
        className
      )}
      {...rest}
    >
      {loading ? (
        <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
      ) : (
        Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      <span>{children}</span>
      {loading && loadingLabel && <span className="sr-only">{loadingLabel}</span>}
    </button>
  );
});

/** Tone-aware helper for the one-off textual callout, kept here for symmetry. */
export const calloutClasses = (tone: Tone): string =>
  cx('rounded-card border px-3 py-2.5 text-xs leading-5', TONE_STYLES[tone].surface, TONE_STYLES[tone].border);
