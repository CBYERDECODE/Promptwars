import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { TONE_STYLES, Tone, cx } from './tones';

interface Props {
  /** Semantic tone. Never the only signal — an icon and text are always rendered. */
  tone?: Tone;
  /** Status icon. Required for status badges so colour is never the sole indicator. */
  icon?: LucideIcon;
  children: React.ReactNode;
  /**
   * Optional screen-reader-only prefix that names what the tone refers to,
   * e.g. `srPrefix="Severity"` renders "Severity: High" to assistive tech.
   */
  srPrefix?: string;
  size?: 'sm' | 'md';
  className?: string;
  title?: string;
}

const SIZES: Record<'sm' | 'md', string> = {
  sm: 'px-2 py-0.5 text-[11px] gap-1.5',
  md: 'px-2.5 py-1 text-xs gap-1.5'
};

const ICON_SIZES: Record<'sm' | 'md', string> = {
  sm: 'w-3 h-3',
  md: 'w-3.5 h-3.5'
};

/**
 * Compact status chip. Always renders an icon plus a text label so the status
 * survives greyscale printing, colour-blindness and screen readers.
 */
export const Badge: React.FC<Props> = ({
  tone = 'neutral',
  icon: Icon,
  children,
  srPrefix,
  size = 'sm',
  className,
  title
}) => (
  <span
    title={title}
    className={cx(
      'inline-flex items-center rounded-full border font-semibold whitespace-nowrap',
      SIZES[size],
      TONE_STYLES[tone].chip,
      className
    )}
  >
    {Icon && <Icon className={cx(ICON_SIZES[size], 'shrink-0')} aria-hidden="true" />}
    {srPrefix && <span className="sr-only">{srPrefix}: </span>}
    <span>{children}</span>
  </span>
);
