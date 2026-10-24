import React from 'react';
import { RefreshCw, ScrollText, Shield, Trash2, Lock } from 'lucide-react';
import { ApiError, clearActivityLogs, fetchActivityLogs, type ActivityLogEntry } from '../api/client';
import { useOnlineStatus } from '../hooks/useRescueData';
import {
  Badge,
  Button,
  CardSkeleton,
  Dialog,
  EmptyState,
  ErrorState,
  OfflineState,
  calloutClasses,
  cx,
  useToast
} from '../ui';

/**
 * Audit trail of every triage, extraction, fusion and human decision.
 *
 * The list itself is read-only. Purging it is deliberately awkward: the server
 * guards `DELETE /api/activity` with `requireAdmin`, so the action sits behind a
 * confirmation step that asks for the coordinator token, and the local list is
 * only emptied once the server has actually confirmed the purge. A refusal is
 * surfaced verbatim instead of being dressed up as success.
 */
export const ActivityLogView: React.FC = () => {
  const { push } = useToast();
  const online = useOnlineStatus();

  const [entries, setEntries] = React.useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<{ message: string; details: Array<{ path: string; message: string }> } | null>(
    null
  );

  const [purgeOpen, setPurgeOpen] = React.useState(false);
  const [adminToken, setAdminToken] = React.useState('');
  const [purging, setPurging] = React.useState(false);
  const [purgeError, setPurgeError] = React.useState<string | null>(null);

  const loadLogs = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchActivityLogs();
      setEntries(res.entries ?? []);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? { message: err.message, details: err.details }
          : { message: 'The audit trail could not be read from the server.', details: [] }
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const closePurge = () => {
    if (purging) return;
    setPurgeOpen(false);
    setPurgeError(null);
  };

  const handlePurge = async () => {
    setPurging(true);
    setPurgeError(null);
    try {
      await clearActivityLogs(adminToken.trim() || undefined);
      // Only now is it true that the trail is empty.
      setEntries([]);
      setPurgeOpen(false);
      setAdminToken('');
      push({
        tone: 'success',
        title: 'Audit trail purged',
        description: 'The server confirmed the log was cleared.'
      });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'The audit trail was not cleared: the server could not be reached.';
      setPurgeError(message);
      // The list is deliberately left intact — nothing was deleted.
      push({ tone: 'critical', title: 'Purge refused', description: message });
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-black text-ink tracking-tight">Operational Activity Log</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            Audit trail of triage operations, intelligence extractions, fusions and human decisions.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button icon={RefreshCw} onClick={loadLogs} loading={loading} loadingLabel="Refreshing the audit trail">
            Refresh
          </Button>
          <Button variant="danger" icon={Trash2} onClick={() => setPurgeOpen(true)} disabled={!online}>
            Clear Log
          </Button>
        </div>
      </div>

      {!online && (
        <OfflineState message="You are offline. The audit trail shown below is the last copy this device read; it cannot be refreshed and nothing can be purged until the connection returns." />
      )}

      <div className={cx(calloutClasses('accent'), 'flex items-start gap-2')}>
        <Shield className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        <span>
          <strong>Privacy preserving audit:</strong> entries hold only high-level sanitized action descriptors. No raw
          caller text, names, phone numbers or uploaded media bytes are stored in the log stream.
        </span>
      </div>

      {loading && <CardSkeleton label="Reading the audit trail" rows={6} />}

      {!loading && error && (
        <ErrorState
          title="Could not read the audit trail"
          message={error.message}
          details={error.details}
          onRetry={loadLogs}
        />
      )}

      {!loading && !error && entries.length === 0 && (
        <EmptyState
          icon={ScrollText}
          title="No activity recorded yet"
          description="Triages, extractions, fusions and coordinator decisions appear here as soon as they happen. An empty trail is expected on a freshly reset demo."
          action={
            <Button size="sm" icon={RefreshCw} onClick={loadLogs}>
              Check again
            </Button>
          }
        />
      )}

      {!loading && !error && entries.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <Badge tone="accent" icon={ScrollText}>
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </Badge>
            <span className="text-[11px] text-ink-subtle">Newest first, as returned by the server.</span>
          </div>

          <ol className="space-y-2">
            {entries.map(entry => (
              <li
                key={entry.id}
                className="flex flex-col gap-1.5 rounded-card border border-line bg-surface px-4 py-3 shadow-card sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{entry.action_type}</Badge>
                    {entry.incident_id && (
                      <span className="font-mono text-[11px] text-ink-subtle">ID: {entry.incident_id}</span>
                    )}
                  </div>
                  <p className="text-xs font-medium text-ink leading-5">{entry.summary}</p>
                </div>
                <time
                  dateTime={entry.timestamp}
                  className="shrink-0 font-mono text-[11px] text-ink-subtle"
                  data-metric
                >
                  {new Date(entry.timestamp).toLocaleString()}
                </time>
              </li>
            ))}
          </ol>
        </>
      )}

      <Dialog
        open={purgeOpen}
        onClose={closePurge}
        title="Clear the audit trail?"
        description="This deletes every recorded action and human decision on the server. It cannot be undone."
        footer={
          <>
            <Button onClick={closePurge} disabled={purging}>
              Cancel
            </Button>
            <Button variant="danger" icon={Trash2} onClick={handlePurge} loading={purging} loadingLabel="Purging the audit trail">
              Purge log
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-ink-muted leading-5">
            Purging is an administrative action, so the server requires a coordinator token. Without it the request is
            refused and nothing is deleted.
          </p>

          <div className="rounded-card border border-line bg-surface-muted px-3 py-2">
            <label htmlFor="purge-admin-token" className="flex items-center gap-2 text-[11px] font-semibold text-ink-muted">
              <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
              Coordinator token
            </label>
            <input
              id="purge-admin-token"
              type="password"
              autoComplete="off"
              value={adminToken}
              onChange={event => setAdminToken(event.target.value)}
              className="mt-2 w-full rounded-control border border-line-strong bg-white px-3 py-2 text-xs text-ink"
            />
            <p className="mt-1 text-[11px] text-ink-subtle">
              Sent as the <code className="font-mono">X-Admin-Token</code> header. It is never stored in the browser.
            </p>
          </div>

          {purgeError && (
            <p role="alert" className="rounded-card border border-critical-border bg-critical-soft px-3 py-2.5 text-[11px] text-ink">
              {purgeError}
            </p>
          )}
        </div>
      </Dialog>
    </div>
  );
};
