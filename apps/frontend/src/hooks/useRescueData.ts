import React from 'react';
import { fetchRescueDataset, RescueDatasetResponse } from '../api/client';

/**
 * The SIMULATED dataset is identical for every rescue view and never changes
 * during a session, so it is fetched at most once and shared. Module-level
 * caching (plus in-flight de-duplication) avoids four identical requests when a
 * coordinator moves between Radar, FairRescue, RescueBrain and CrisisReplay.
 */
let datasetCache: RescueDatasetResponse | null = null;
let inFlight: Promise<RescueDatasetResponse> | null = null;

async function loadDataset(force: boolean): Promise<RescueDatasetResponse> {
  if (!force && datasetCache) return datasetCache;
  if (!force && inFlight) return inFlight;

  inFlight = fetchRescueDataset()
    .then(response => {
      datasetCache = response;
      return response;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export interface RescueDatasetState {
  data: RescueDatasetResponse | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

/** Loads the simulated dataset plus every algorithm parameter the UI displays. */
export function useRescueDataset(): RescueDatasetState {
  const [data, setData] = React.useState<RescueDatasetResponse | null>(datasetCache);
  const [loading, setLoading] = React.useState(datasetCache === null);
  const [error, setError] = React.useState<Error | null>(null);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    loadDataset(nonce > 0)
      .then(response => {
        if (!cancelled) setData(response);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Unable to load the simulated dataset.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const reload = React.useCallback(() => setNonce(current => current + 1), []);

  return { data, loading, error, reload };
}

/** Tracks browser connectivity so views can render a real offline state. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = React.useState(true);

  React.useEffect(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      setOnline(navigator.onLine);
    }
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return online;
}
