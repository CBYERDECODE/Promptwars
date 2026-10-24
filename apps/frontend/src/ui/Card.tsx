import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { TONE_STYLES, Tone, cx } from './tones';

interface Props {
  /** Rendered as the card heading and used as its accessible name. */
  title?: string;
  description?: string;
  icon?: LucideIcon;
  tone?: Tone;
  /** Controls rendered in the header, right-aligned. */
  actions?: React.ReactNode;
  /** Region below the body, separated by a hairline. */
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Adds a tone-coloured left rail — used for flagged/at-risk content. */
  accentRail?: boolean;
  as?: 'section' | 'article' | 'div';
}

/**
 * Surface primitive for the whole app. Renders a real landmark with an
 * accessible name when a title is supplied, so screen-reader users can navigate
 * between panels by region instead of by heading order alone.
 */
export const Card: React.FC<Props> = ({
  title,
  description,
  icon: Icon,
  tone = 'neutral',
  actions,
  footer,
  children,
  className,
  bodyClassName,
  accentRail = false,
  as: Element = 'section'
}) => {
  const headingId = React.useId();
  const descriptionId = React.useId();
  const hasHeader = Boolean(title) || Boolean(actions);

  return (
    <Element
      aria-labelledby={title ? headingId : undefined}
      aria-describedby={description ? descriptionId : undefined}
      className={cx(
        'bg-surface rounded-card border border-line shadow-card overflow-hidden',
        accentRail && cx('border-l-4', TONE_STYLES[tone].rail),
        className
      )}
    >
      {hasHeader && (
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-line bg-surface">
          <div className="flex items-start gap-2.5 min-w-0">
            {Icon && (
              <Icon className={cx('w-4 h-4 mt-0.5 shrink-0', TONE_STYLES[tone].ink)} aria-hidden="true" />
            )}
            <div className="min-w-0">
              {title && (
                <h2 id={headingId} className="text-sm font-semibold text-ink leading-5">
                  {title}
                </h2>
              )}
              {description && (
                <p id={descriptionId} className="text-xs text-ink-subtle mt-0.5 leading-5">
                  {description}
                </p>
              )}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}

      <div className={cx('px-4 py-3.5', bodyClassName)}>{children}</div>

      {footer && <div className="px-4 py-3 border-t border-line bg-surface-muted">{footer}</div>}
    </Element>
  );
};
