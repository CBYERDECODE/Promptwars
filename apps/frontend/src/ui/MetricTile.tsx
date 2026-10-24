import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { TONE_STYLES, Tone, cx } from './tones';

interface Props {
  label: string;
  /** Primary figure. Prefer pre-formatted strings so the unit can be styled. */
  value: React.ReactNode;
  unit?: string;
  icon?: LucideIcon;
  tone?: Tone;
  /** Short clarification, e.g. "target 12 min". */
  help?: string;
  /** Optional second figure for a comparison, e.g. the baseline value. */
  comparison?: { label: string; value: React.ReactNode };
  /**
   * Explicit status for the tile. When present an icon AND a text label are
   * rendered, so the tile's meaning never rests on colour alone.
   */
  status?: { tone: Tone; icon: LucideIcon; label: string };
  className?: string;
}

/**
 * A single scannable figure. Deliberately small and annotated: a coordinator
 * under stress needs the number, its unit and its meaning in one glance.
 */
export const MetricTile: React.FC<Props> = ({
  label,
  value,
  unit,
  icon: Icon,
  tone = 'neutral',
  help,
  comparison,
  status,
  className
}) => (
  <div className={cx('rounded-card border border-line bg-surface px-3.5 py-3', className)}>
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-1.5 min-w-0">
        {Icon && <Icon className={cx('w-3.5 h-3.5 shrink-0', TONE_STYLES[tone].ink)} aria-hidden="true" />}
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle truncate">
          {label}
        </span>
      </div>
      {status && (
        <span
          className={cx(
            'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold',
            TONE_STYLES[status.tone].chip
          )}
        >
          <status.icon className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
          <span>{status.label}</span>
        </span>
      )}
    </div>

    <div className="mt-1.5 flex items-baseline gap-1">
      <span data-metric className="text-xl font-bold text-ink tabular-nums leading-6">
        {value}
      </span>
      {unit && <span className="text-xs font-medium text-ink-subtle">{unit}</span>}
    </div>

    {comparison && (
      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-subtle">
        <span className="font-semibold">{comparison.label}</span>
        <span data-metric className="tabular-nums font-semibold text-ink-muted">
          {comparison.value}
        </span>
      </div>
    )}

    {help && <p className="mt-1 text-[11px] text-ink-subtle leading-4">{help}</p>}
  </div>
);
