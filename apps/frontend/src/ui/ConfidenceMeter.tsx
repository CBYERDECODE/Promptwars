import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { CircleAlert, BadgeCheck, CircleHelp } from 'lucide-react';
import { Confidence } from '@resq-ai/shared';
import { Tone, TONE_STYLES, cx } from './tones';

/**
 * Confidence is shown, never hidden. The meter renders three segments plus an
 * icon plus the word itself, so a coordinator can read it in greyscale, through
 * a screen reader, or at arm's length on a tablet in daylight.
 *
 * `Low` uses the `uncertain` tone, not `warning`: having thin evidence is not
 * the same as being in danger.
 */
const CONFIDENCE_META: Record<Confidence, { filled: number; tone: Tone; icon: LucideIcon; hint: string }> = {
  Low: {
    filled: 1,
    tone: 'uncertain',
    icon: CircleHelp,
    hint: 'Thin or missing inputs — treat any conclusion as unconfirmed.'
  },
  Medium: {
    filled: 2,
    tone: 'accent',
    icon: CircleAlert,
    hint: 'Some inputs are missing, so the result is partial.'
  },
  High: {
    filled: 3,
    tone: 'success',
    icon: BadgeCheck,
    hint: 'The inputs needed for this result are present.'
  }
};

interface Props {
  confidence: Confidence;
  /** What the confidence refers to, e.g. "Zone assessment". */
  label?: string;
  /** Renders the explanatory hint under the meter. */
  showHint?: boolean;
  className?: string;
}

export const ConfidenceMeter: React.FC<Props> = ({ confidence, label = 'Confidence', showHint = false, className }) => {
  const meta = CONFIDENCE_META[confidence];
  const Icon = meta.icon;

  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <div className="flex items-center gap-2">
        <span className="sr-only">{`${label}: ${confidence} (${meta.filled} of 3)`}</span>
        <span
          aria-hidden="true"
          className="flex items-center gap-0.5"
          title={`${label}: ${confidence}`}
        >
          {[1, 2, 3].map(segment => (
            <span
              key={segment}
              className={cx(
                'h-1.5 w-4 rounded-full border',
                segment <= meta.filled
                  ? cx(TONE_STYLES[meta.tone].surface, TONE_STYLES[meta.tone].border)
                  : 'bg-surface-sunken border-line'
              )}
            />
          ))}
        </span>
        <span
          aria-hidden="true"
          className={cx('inline-flex items-center gap-1 text-[11px] font-semibold', TONE_STYLES[meta.tone].ink)}
        >
          <Icon className="w-3 h-3 shrink-0" />
          <span>
            {label}: {confidence}
          </span>
        </span>
      </div>
      {showHint && <p className="text-[11px] text-ink-subtle leading-4">{meta.hint}</p>}
    </div>
  );
};
