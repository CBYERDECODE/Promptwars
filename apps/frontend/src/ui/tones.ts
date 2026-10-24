/**
 * Semantic tone tokens.
 *
 * Every status colour in ResQ AI resolves through this file. Two rules:
 *  1. A tone is never the only signal — `Badge`, `MetricTile`, `DiffRow` and
 *     `ConfidenceMeter` always pair a tone with an icon AND a text label.
 *  2. `uncertain` is deliberately separate from `warning`. "We do not know" must
 *     never look like "watch out".
 *
 * Every text colour below was checked against WCAG 2.2 AA on the surface it is
 * rendered on (white #FFFFFF and the muted surface #F8FAFC).
 */

export type Tone = 'neutral' | 'accent' | 'critical' | 'warning' | 'success' | 'uncertain';

export interface ToneStyle {
  /** Chip/badge surface: background + text + border. */
  chip: string;
  /** Text/icon colour only, for inline use. */
  ink: string;
  /** Background tint for callouts. */
  surface: string;
  /** Border colour for callouts and rails. */
  border: string;
  /** Left rail accent, for cards that carry a tone. */
  rail: string;
  /** Raw hex value, for inline SVG where Tailwind classes cannot reach. */
  hex: string;
}

export const TONE_STYLES: Record<Tone, ToneStyle> = {
  neutral: {
    chip: 'bg-white text-ink-muted border-line',
    ink: 'text-ink-muted',
    surface: 'bg-surface-muted',
    border: 'border-line',
    rail: 'border-l-line-strong',
    hex: '#CBD5E1'
  },
  accent: {
    chip: 'bg-accent-soft text-accent-strong border-accent-border',
    ink: 'text-accent',
    surface: 'bg-accent-soft',
    border: 'border-accent-border',
    rail: 'border-l-accent',
    hex: 'var(--resq-accent, #2563EB)'
  },
  critical: {
    chip: 'bg-critical-soft text-critical border-critical-border',
    ink: 'text-critical',
    surface: 'bg-critical-soft',
    border: 'border-critical-border',
    rail: 'border-l-critical',
    hex: 'var(--resq-critical, #B91C1C)'
  },
  warning: {
    chip: 'bg-warning-soft text-warning border-warning-border',
    ink: 'text-warning',
    surface: 'bg-warning-soft',
    border: 'border-warning-border',
    rail: 'border-l-warning',
    hex: 'var(--resq-warning, #B45309)'
  },
  success: {
    chip: 'bg-success-soft text-success border-success-border',
    ink: 'text-success',
    surface: 'bg-success-soft',
    border: 'border-success-border',
    rail: 'border-l-success',
    hex: 'var(--resq-success, #15803D)'
  },
  uncertain: {
    chip: 'bg-uncertain-soft text-uncertain border-uncertain-border',
    ink: 'text-uncertain',
    surface: 'bg-uncertain-soft',
    border: 'border-uncertain-border',
    rail: 'border-l-uncertain',
    hex: 'var(--resq-uncertain, #7C3AED)'
  }
};

/** Join class names, dropping falsy values. */
export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}
