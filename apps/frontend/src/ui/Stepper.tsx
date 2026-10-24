import React from 'react';
import { Check } from 'lucide-react';
import { cx } from './tones';

export interface StepDefinition {
  id: string;
  label: string;
  description?: string;
}

interface Props {
  steps: StepDefinition[];
  /** Zero-based index of the active step. */
  current: number;
  ariaLabel: string;
  /** When provided, steps become buttons (guided tours, wizards). */
  onSelect?: (index: number) => void;
  /** Highest index the user may jump to. Defaults to `current`. */
  maxReachable?: number;
}

/**
 * Progress indicator that doubles as navigation. Reuses the ordered-list
 * semantics so assistive tech announces "step 3 of 6" naturally, and marks the
 * active step with `aria-current="step"` rather than colour.
 */
export const Stepper: React.FC<Props> = ({ steps, current, ariaLabel, onSelect, maxReachable }) => {
  const limit = maxReachable ?? current;

  return (
    <ol aria-label={ariaLabel} className="flex flex-wrap items-center gap-x-1 gap-y-2">
      {steps.map((step, index) => {
        const isCurrent = index === current;
        const isComplete = index < current;
        const reachable = index <= limit;
        const interactive = Boolean(onSelect) && reachable;

        const content = (
          <>
            <span
              className={cx(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold',
                isCurrent && 'border-accent bg-accent text-white',
                !isCurrent && isComplete && 'border-success bg-success text-white',
                !isCurrent && !isComplete && 'border-line-strong bg-white text-ink-subtle'
              )}
              aria-hidden="true"
            >
              {isComplete ? <Check className="h-3 w-3" /> : index + 1}
            </span>
            <span className={cx('text-xs font-semibold', isCurrent ? 'text-ink' : 'text-ink-subtle')}>
              {step.label}
            </span>
            <span className="sr-only">
              {isComplete ? ' (completed)' : isCurrent ? ' (current step)' : ''}
            </span>
          </>
        );

        return (
          <li key={step.id} className="flex items-center">
            {interactive ? (
              <button
                type="button"
                onClick={() => onSelect?.(index)}
                aria-current={isCurrent ? 'step' : undefined}
                className={cx(
                  'flex min-h-tap items-center gap-2 rounded-control px-2 py-1 transition duration-fast',
                  'hover:bg-surface-sunken focus-visible:bg-surface-sunken',
                  isCurrent && 'bg-accent-soft'
                )}
              >
                {content}
              </button>
            ) : (
              <span
                aria-current={isCurrent ? 'step' : undefined}
                className={cx('flex items-center gap-2 rounded-control px-2 py-1', isCurrent && 'bg-accent-soft')}
              >
                {content}
              </span>
            )}

            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={cx('mx-0.5 h-px w-4', isComplete ? 'bg-success' : 'bg-line-strong')}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
};
