import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { CircleCheckBig, Equal, TriangleAlert } from 'lucide-react';
import { Tone, TONE_STYLES, cx } from './tones';

/**
 * `null` means the metric did not change (or could not be compared). It is
 * rendered as "Unchanged" rather than left blank, so an absence of change is
 * never mistaken for missing data.
 */
export type DiffDirection = boolean | null;

const DIRECTION_META: Record<'better' | 'worse' | 'same', { tone: Tone; icon: LucideIcon; label: string }> = {
  better: { tone: 'success', icon: CircleCheckBig, label: 'Better' },
  worse: { tone: 'critical', icon: TriangleAlert, label: 'Worse' },
  same: { tone: 'neutral', icon: Equal, label: 'Unchanged' }
};

function metaFor(direction: DiffDirection) {
  if (direction === null) return DIRECTION_META.same;
  return direction ? DIRECTION_META.better : DIRECTION_META.worse;
}

interface Props {
  label: string;
  before: React.ReactNode;
  after: React.ReactNode;
  /** true = the change is an improvement, false = a regression, null = no change. */
  direction: DiffDirection;
  /** Extra context, e.g. the absolute delta in the metric's own unit. */
  detail?: string;
  className?: string;
}

/**
 * One row of a before/after comparison. Highlights the changed figure and states
 * the direction in words plus an icon, so "better/worse" never depends on a
 * colour or on which column the eye lands on first.
 */
export const DiffRow: React.FC<Props> = ({ label, before, after, direction, detail, className }) => {
  const meta = metaFor(direction);
  const Icon = meta.icon;
  const changed = direction !== null;

  return (
    <div
      className={cx(
        'grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-x-3 gap-y-1 items-center border-t border-line py-2 first:border-t-0',
        className
      )}
    >
      <div className="text-xs font-medium text-ink-muted min-w-0">{label}</div>

      <div className="hidden sm:block text-xs text-ink-subtle text-right">
        <span className="sm:hidden">Before </span>
        <span data-metric className="tabular-nums">
          {before}
        </span>
      </div>

      <div className="text-xs text-right">
        <span className="sm:hidden text-ink-subtle">After </span>
        <span
          data-metric
          className={cx('tabular-nums font-semibold', changed ? TONE_STYLES[meta.tone].ink : 'text-ink')}
        >
          {/* On narrow screens the "before" value is shown inline so nothing is lost. */}
          <span className="sm:hidden">
            {before} → {after}
          </span>
          <span className="hidden sm:inline">{after}</span>
        </span>
      </div>

      <div className="flex items-center justify-end gap-1.5">
        <span
          className={cx(
            'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold',
            TONE_STYLES[meta.tone].chip
          )}
        >
          <Icon className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
          <span>{meta.label}</span>
        </span>
        {detail && <span className="hidden sm:inline text-[10px] text-ink-subtle whitespace-nowrap">{detail}</span>}
      </div>
    </div>
  );
};
