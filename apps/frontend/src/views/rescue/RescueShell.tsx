import React from 'react';
import { CardSkeleton, ErrorState, OfflineState, SimulatedNotice } from '../../ui';

interface Props {
  /** Short scenario name shown in the SIMULATED banner, e.g. "Riverbend (fictional)". */
  scenario?: string;
  /** Server-supplied simulation notice, used verbatim when present. */
  notice?: string;
  loading: boolean;
  loadingLabel: string;
  error: Error | null;
  onRetry: () => void;
  /** True when the browser reports no connectivity. */
  offline?: boolean;
  children: React.ReactNode;
}

/**
 * Shared frame for every rescue-intelligence view.
 *
 * Centralising this guarantees the two rules the spec makes non-negotiable:
 *  - the SIMULATED banner is mounted by default, so no view can forget it; and
 *  - every view has designed loading, error and offline states rather than a
 *    blank panel.
 */
export const RescueShell: React.FC<Props> = ({
  scenario,
  notice,
  loading,
  loadingLabel,
  error,
  onRetry,
  offline = false,
  children
}) => (
  <div className="space-y-4">
    <SimulatedNotice label={scenario} notice={notice} />

    {offline && <OfflineState onRetry={onRetry} />}

    {loading && <CardSkeleton label={loadingLabel} rows={6} />}

    {!loading && error && (
      <ErrorState
        title="Could not load the rescue intelligence data"
        message={error.message}
        onRetry={onRetry}
      />
    )}

    {!loading && !error && children}
  </div>
);
