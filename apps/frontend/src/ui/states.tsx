import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { CircleAlert, FlaskConical, Inbox, RefreshCw, TriangleAlert, WifiOff } from 'lucide-react';
import { Button } from './Button';
import { cx } from './tones';

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

interface SkeletonProps {
  className?: string;
}

/** Neutral shimmer block used to build view-specific skeletons. */
export const Skeleton: React.FC<SkeletonProps> = ({ className }) => (
  <div className={cx('animate-pulse rounded-control bg-surface-sunken', className)} aria-hidden="true" />
);

/**
 * Loading placeholder. The visual shimmer is hidden from assistive tech; a
 * single polite status message announces the wait once instead of announcing
 * every rectangle.
 */
export const LoadingBlock: React.FC<{ label: string; lines?: number; className?: string }> = ({
  label,
  lines = 3,
  className
}) => (
  <div role="status" className={cx('space-y-2', className)}>
    <span className="sr-only">{label}</span>
    {Array.from({ length: lines }).map((_, index) => (
      <Skeleton key={index} className={cx('h-3.5', index === lines - 1 ? 'w-2/3' : 'w-full')} />
    ))}
  </div>
);

/** Card-shaped skeleton for panels that load as a unit. */
export const CardSkeleton: React.FC<{ label: string; rows?: number }> = ({ label, rows = 4 }) => (
  <div className="rounded-card border border-line bg-surface p-4">
    <LoadingBlock label={label} lines={rows} />
  </div>
);

/* ------------------------------------------------------------------ */
/* Empty / Error / Offline                                             */
/* ------------------------------------------------------------------ */

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}

/** Shown when a request succeeded but there is genuinely nothing to display. */
export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, icon: Icon = Inbox, action }) => (
  <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-line-strong bg-surface-muted px-4 py-8 text-center">
    <Icon className="h-6 w-6 text-ink-faint" aria-hidden="true" />
    <p className="text-sm font-semibold text-ink">{title}</p>
    <p className="max-w-md text-xs text-ink-subtle leading-5">{description}</p>
    {action}
  </div>
);

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  /** Validation details returned by the API, rendered as a list. */
  details?: Array<{ path: string; message: string }>;
}

/** Shown when a request failed. Uses `role="alert"` so failures are announced. */
export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message,
  onRetry,
  details = []
}) => (
  <div role="alert" className="rounded-card border border-critical-border bg-critical-soft px-4 py-3.5">
    <div className="flex items-start gap-2.5">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-critical" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-xs text-ink-muted leading-5">{message}</p>
        {details.length > 0 && (
          <ul className="mt-2 space-y-1">
            {details.map(detail => (
              <li key={`${detail.path}-${detail.message}`} className="text-[11px] text-ink-muted">
                <span className="font-semibold">{detail.path || 'request'}</span>: {detail.message}
              </li>
            ))}
          </ul>
        )}
        {onRetry && (
          <div className="mt-3">
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRetry}>
              Retry
            </Button>
          </div>
        )}
      </div>
    </div>
  </div>
);

/** Shown when the browser reports no connectivity. */
export const OfflineState: React.FC<{ onRetry?: () => void; message?: string }> = ({ onRetry, message }) => (
  <div role="status" className="rounded-card border border-warning-border bg-warning-soft px-4 py-3.5">
    <div className="flex items-start gap-2.5">
      <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">You appear to be offline</p>
        <p className="mt-0.5 text-xs text-ink-muted leading-5">
          {message ??
            'Simulation results already on screen stay readable, but nothing can be recomputed and no decision can be recorded until the connection returns.'}
        </p>
        {onRetry && (
          <div className="mt-3">
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRetry}>
              Check connection
            </Button>
          </div>
        )}
      </div>
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Simulation labelling                                                */
/* ------------------------------------------------------------------ */

interface SimulatedNoticeProps {
  /** Dataset label, e.g. "SIMULATED — Riverbend flood exercise". */
  label?: string;
  notice?: string;
  className?: string;
}

/**
 * Mandatory SIMULATED banner. Every rescue-intelligence view mounts this, so no
 * screen in the app can ever present synthetic output as a real prediction.
 */
export const SimulatedNotice: React.FC<SimulatedNoticeProps> = ({ label, notice, className }) => (
  <div
    className={cx(
      'flex items-start gap-2.5 rounded-card border border-uncertain-border bg-uncertain-soft px-3.5 py-2.5',
      className
    )}
  >
    <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-uncertain" aria-hidden="true" />
    <div className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-wide text-uncertain">
        Simulated exercise{label ? ` — ${label}` : ''}
      </p>
      <p className="mt-0.5 text-[11px] text-ink-muted leading-4">
        {notice ??
          'Every city, road time, population, unit and incident below is fictional. Nothing here is a real-world prediction, and no dispatch happens automatically.'}
      </p>
    </div>
  </div>
);

/** Inline advisory used next to hatched/uncertain data. */
export const UncertaintyNote: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className
}) => (
  <p className={cx('flex items-start gap-1.5 text-[11px] text-uncertain leading-4', className)}>
    <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
    <span>{children}</span>
  </p>
);
