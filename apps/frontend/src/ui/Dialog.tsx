import React from 'react';
import { createPortal } from 'react-dom';
import { CircleX } from 'lucide-react';
import { cx } from './tones';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Max width utility, e.g. `max-w-lg`. */
  widthClassName?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal.
 *
 * Implements the behaviour expected of `role="dialog"` by hand (no extra
 * dependency): Escape closes, Tab cycles inside the panel, focus moves into the
 * panel on open and returns to the trigger on close, and background scroll is
 * locked. `aria-modal` plus a labelled heading satisfies screen readers.
 */
export const Dialog: React.FC<Props> = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  widthClassName = 'max-w-lg'
}) => {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const headingId = React.useId();
  const descriptionId = React.useId();

  React.useEffect(() => {
    if (!open) return undefined;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (firstFocusable ?? panel)?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        element => element.offsetParent !== null || element === document.activeElement
      );
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-ink/40 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cx(
          'relative w-full rounded-t-panel bg-surface shadow-panel border border-line animate-rise-in sm:rounded-panel',
          widthClassName
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 id={headingId} className="text-sm font-semibold text-ink">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-0.5 text-xs text-ink-subtle leading-5">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 -mt-1 flex min-h-tap min-w-tap items-center justify-center rounded-control text-ink-subtle transition duration-fast hover:bg-surface-sunken hover:text-ink"
          >
            <span className="sr-only">Close dialog</span>
            <CircleX className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-4 py-3.5">{children}</div>

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-muted px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
