import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { CircleCheckBig, CircleX, Info, TriangleAlert } from 'lucide-react';
import { Tone, TONE_STYLES, cx } from './tones';

export interface ToastRecord {
  id: string;
  tone: Tone;
  title: string;
  description?: string;
}

interface ToastInput {
  tone?: Tone;
  title: string;
  description?: string;
}

interface ToastContextValue {
  push: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 6000;

const TOAST_ICONS: Record<Tone, LucideIcon> = {
  neutral: Info,
  accent: Info,
  critical: CircleX,
  warning: TriangleAlert,
  success: CircleCheckBig,
  uncertain: Info
};

/** Access the toast queue. Must be called under `<ToastProvider>`. */
export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>.');
  return ctx;
}

/**
 * Holds transient notifications and renders an accessible viewport.
 *
 * Critical toasts use `role="alert"` (assertive) so a failed approval is
 * announced immediately; everything else uses `role="status"` (polite) so it
 * does not interrupt what the coordinator is currently reading.
 */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([]);
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = React.useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  const push = React.useCallback(
    (input: ToastInput) => {
      const id = `toast-${Math.random().toString(36).slice(2, 9)}`;
      setToasts(current => [...current, { id, tone: input.tone ?? 'neutral', title: input.title, description: input.description }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
      );
      return id;
    },
    [dismiss]
  );

  // Clear pending timers if the provider unmounts.
  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(timer => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const value = React.useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/*
        `role="region"` is required for `aria-label` to be permitted here — a
        bare `<div>` has the generic role, on which ARIA forbids a label. The
        individual toasts remain the live regions (status/alert).
      */}
      <div
        role="region"
        aria-label="Notifications"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map(toast => {
          const Icon = TOAST_ICONS[toast.tone];
          return (
            <div
              key={toast.id}
              role={toast.tone === 'critical' ? 'alert' : 'status'}
              className={cx(
                'pointer-events-auto flex items-start gap-2.5 rounded-card border px-3 py-2.5 shadow-panel animate-rise-in',
                TONE_STYLES[toast.tone].surface,
                TONE_STYLES[toast.tone].border
              )}
            >
              <Icon className={cx('mt-0.5 h-4 w-4 shrink-0', TONE_STYLES[toast.tone].ink)} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-ink leading-5">{toast.title}</p>
                {toast.description && <p className="mt-0.5 text-[11px] text-ink-muted leading-4">{toast.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="min-h-tap min-w-tap -mr-1 -mt-1 flex items-center justify-center rounded-control text-ink-subtle transition duration-fast hover:bg-white/60 hover:text-ink"
              >
                <span className="sr-only">Dismiss notification</span>
                <CircleX className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
