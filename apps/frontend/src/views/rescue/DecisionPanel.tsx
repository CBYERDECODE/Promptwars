import React from 'react';
import { CircleCheckBig, CircleX, PencilLine, ClipboardCheck, Lock, TriangleAlert } from 'lucide-react';
import { AllocationStrategy } from '@resq-ai/shared';
import {
  ApiError,
  RescueDecision,
  RescueDecisionRecord,
  postDecision
} from '../../api/client';
import { Badge, Button, Card, Dialog, Tone, cx, useToast } from '../../ui';

interface Props {
  strategy: AllocationStrategy;
  strategyLabel: string;
  /** Deterministic signature of the plan the coordinator is reviewing. */
  planSignature: string;
  activeConstraints: string[];
  /** Notified once the server has written the audit entry. */
  onRecorded?: (record: RescueDecisionRecord) => void;
  className?: string;
}

const DECISIONS: Array<{ id: RescueDecision; label: string; icon: typeof CircleCheckBig; tone: Tone }> = [
  { id: 'APPROVED', label: 'Approve', icon: CircleCheckBig, tone: 'success' },
  { id: 'REJECTED', label: 'Reject', icon: CircleX, tone: 'critical' },
  { id: 'MODIFIED', label: 'Modify', icon: PencilLine, tone: 'warning' }
];

const DECISION_LABEL: Record<RescueDecision, string> = {
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  MODIFIED: 'Marked for modification'
};

/**
 * FNV-1a over the decision payload. Bounded to 32 bits so the idempotency key
 * stays well inside the server's 128-character limit, while still changing
 * whenever the coordinator's intent changes.
 */
function payloadKey(strategy: string, signature: string, decision: string, note: string): string {
  const input = `${strategy}|${signature}|${decision}|${note}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `resq-decision-${hash.toString(16).padStart(8, '0')}`;
}

/**
 * The mandatory human approval step.
 *
 * Approve / Reject / Modify all require a written coordinator note, are
 * confirmed in a dialog before being sent, and are recorded in the server's
 * tamper-evident audit trail with a timestamp. The Idempotency-Key makes a
 * double-click or a retry harmless: an identical submission returns the ORIGINAL
 * audit entry instead of writing a second one.
 */
export const DecisionPanel: React.FC<Props> = ({
  strategy,
  strategyLabel,
  planSignature,
  activeConstraints,
  onRecorded,
  className
}) => {
  const toast = useToast();
  const [decision, setDecision] = React.useState<RescueDecision | null>(null);
  const [note, setNote] = React.useState('');
  const [adminToken, setAdminToken] = React.useState('');
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [record, setRecord] = React.useState<RescueDecisionRecord | null>(null);

  // A different plan invalidates any decision captured against the old one.
  React.useEffect(() => {
    setDecision(null);
    setNote('');
    setError(null);
    setRecord(null);
  }, [planSignature, strategy]);

  const trimmedNote = note.trim();
  const canSubmit = decision !== null && trimmedNote.length >= 3 && !submitting;

  const submit = async () => {
    if (decision === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await postDecision(
        {
          decision,
          strategy,
          coordinator_note: trimmedNote,
          plan_signature: planSignature,
          active_constraints: activeConstraints
        },
        payloadKey(strategy, planSignature, decision, trimmedNote),
        adminToken.trim() || undefined
      );
      setRecord(response);
      setConfirmOpen(false);
      onRecorded?.(response);
      toast.push({
        tone: response.replayed ? 'neutral' : 'success',
        title: response.replayed ? 'Decision already recorded' : `${DECISION_LABEL[response.decision]} recorded`,
        description: response.replayed
          ? 'An identical decision already exists in the audit trail, so no second entry was written.'
          : `Audit entry ${response.log_entry_id} written at ${new Date(response.recorded_at).toLocaleTimeString()}.`
      });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.code === 'UNAUTHORIZED' || err.status === 401 || err.status === 403
            ? 'The server rejected this decision: coordinator authorization is required. Add the coordinator token below and try again.'
            : err.message
          : 'The decision could not be recorded. Nothing was written to the audit trail.';
      setError(message);
      setConfirmOpen(false);
      toast.push({ tone: 'critical', title: 'Decision not recorded', description: message });
    } finally {
      setSubmitting(false);
    }
  };

  const activeMeta = DECISIONS.find(item => item.id === decision);

  return (
    <Card
      title="Coordinator decision"
      description="ResQ AI never dispatches anything. This step records the human decision that owns the plan."
      icon={ClipboardCheck}
      tone={record ? 'success' : 'accent'}
      className={className}
      bodyClassName="space-y-3"
    >
      <fieldset>
        <legend className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">Decision</legend>
        <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Plan decision">
          {DECISIONS.map(item => {
            const isActive = decision === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => setDecision(item.id)}
                className={cx(
                  'flex min-h-tap items-center justify-center gap-2 rounded-control border px-3 py-2 text-xs font-semibold transition duration-fast',
                  isActive
                    ? 'border-accent bg-accent-soft text-accent-strong'
                    : 'border-line-strong bg-white text-ink-muted hover:bg-surface-sunken'
                )}
              >
                <item.icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor="coordinator-note" className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
          Coordinator note (required)
        </label>
        <textarea
          id="coordinator-note"
          value={note}
          onChange={event => setNote(event.target.value)}
          maxLength={500}
          rows={3}
          aria-describedby="coordinator-note-help"
          placeholder="Why did you accept, reject or change this plan?"
          className="mt-1.5 w-full rounded-control border border-line-strong bg-white px-3 py-2 text-xs text-ink placeholder:text-ink-faint"
        />
        <div id="coordinator-note-help" className="mt-1 flex items-center justify-between gap-2">
          <span className="text-[11px] text-ink-subtle">
            {trimmedNote.length < 3 ? 'At least 3 characters are required.' : 'Recorded verbatim in the audit log.'}
          </span>
          <span data-metric className="text-[11px] tabular-nums text-ink-subtle">
            {trimmedNote.length}/500
          </span>
        </div>
      </div>

      <details className="rounded-card border border-line bg-surface-muted px-3 py-2">
        <summary className="flex cursor-pointer items-center gap-2 text-[11px] font-semibold text-ink-muted">
          <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
          Coordinator authorization (only needed when the server enforces it)
        </summary>
        <label htmlFor="admin-token" className="mt-2 block text-[11px] font-semibold text-ink-subtle">
          Coordinator token
        </label>
        <input
          id="admin-token"
          type="password"
          autoComplete="off"
          value={adminToken}
          onChange={event => setAdminToken(event.target.value)}
          className="mt-1 w-full rounded-control border border-line-strong bg-white px-3 py-2 text-xs text-ink"
        />
        <p className="mt-1 text-[11px] text-ink-subtle">
          Sent as the <code className="font-mono">X-Admin-Token</code> header. It is never stored in the browser or in
          client code.
        </p>
      </details>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-card border border-critical-border bg-critical-soft px-3 py-2.5 text-[11px] text-ink">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-critical" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          icon={ClipboardCheck}
          disabled={!canSubmit}
          onClick={() => setConfirmOpen(true)}
        >
          Review and record decision
        </Button>
        {activeMeta && (
          <Badge tone={activeMeta.tone} icon={activeMeta.icon}>
            {activeMeta.label} selected
          </Badge>
        )}
      </div>

      {record && (
        <div
          role="status"
          className="rounded-card border border-success-border bg-success-soft px-3 py-2.5"
        >
          <p className="text-xs font-semibold text-ink">
            {DECISION_LABEL[record.decision]} — written to the audit trail
          </p>
          <p className="mt-1 text-[11px] text-ink-muted leading-4">
            Recorded at {new Date(record.recorded_at).toLocaleString()} as entry{' '}
            <span className="font-mono">{record.log_entry_id}</span>. {record.notice}
          </p>
          {record.replayed && (
            <p className="mt-1 text-[11px] text-ink-muted leading-4">
              This response was replayed from the server cache, so no duplicate audit entry exists.
            </p>
          )}
        </div>
      )}

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Confirm ${decision ? DECISION_LABEL[decision].toLowerCase() : 'decision'}`}
        description="This writes a permanent entry to the audit trail. It cannot be edited afterwards."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="primary" icon={ClipboardCheck} loading={submitting} loadingLabel="Recording decision" onClick={() => void submit()}>
              Record decision
            </Button>
          </>
        }
      >
        <dl className="space-y-2 text-xs">
          <div className="flex flex-wrap items-baseline gap-2">
            <dt className="font-semibold text-ink-subtle">Strategy</dt>
            <dd className="text-ink">{strategyLabel}</dd>
          </div>
          <div className="flex flex-wrap items-baseline gap-2">
            <dt className="font-semibold text-ink-subtle">Decision</dt>
            <dd>
              {activeMeta && (
                <Badge tone={activeMeta.tone} icon={activeMeta.icon} size="md">
                  {activeMeta.label}
                </Badge>
              )}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink-subtle">Note</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-ink-muted">{trimmedNote}</dd>
          </div>
          {activeConstraints.length > 0 && (
            <div>
              <dt className="font-semibold text-ink-subtle">Constraints in force</dt>
              <dd className="mt-0.5 text-ink-muted">{activeConstraints.join(' ')}</dd>
            </div>
          )}
          <div>
            <dt className="font-semibold text-ink-subtle">Plan signature</dt>
            <dd className="mt-0.5 break-words font-mono text-[11px] text-ink-muted">
              {planSignature || 'no assignments'}
            </dd>
          </div>
        </dl>
      </Dialog>
    </Card>
  );
};
