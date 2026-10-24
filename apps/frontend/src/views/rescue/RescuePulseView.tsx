import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Pencil,
  PhoneCall,
  RotateCw,
  Send,
  ShieldAlert,
  Trash2,
  TriangleAlert
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  PULSE_DELIVERY_NOTICE,
  PULSE_LIMITS,
  PULSE_SIMULATION_LABEL,
  PulseStructuredReportSchema,
  QUEUE_STATUS_LABELS,
  describeIncidentType,
  describePulse,
  type IncidentType,
  type PulseQueueStatus
} from '@resq-ai/shared';
import { Badge, Button, Card, EmptyState, OfflineState, SimulatedNotice, cx } from '../../ui';
import type { Tone } from '../../ui';
import { useOnlineStatus } from '../../hooks/useRescueData';
import { usePulseQueue } from '../../hooks/usePulseQueue';

/**
 * RescuePulse — silent reporting from a phone, with an honest offline queue.
 *
 * The surface is deliberately mobile-first (single column, 44px targets,
 * 16px inputs so iOS never zooms) because it is the one a member of the public
 * reaches for on a handset.
 *
 * What this screen may and may not say is fixed by copy, not styling:
 *  - it never claims a report reached emergency services or a coordinator;
 *  - a report is only ever shown as delivered once the server confirmed it and
 *    returned an incident id; and
 *  - the SIMULATED label is mounted unconditionally.
 */

const INCIDENT_TYPES: IncidentType[] = [
  'FLOOD',
  'FIRE',
  'INFRASTRUCTURE_DAMAGE',
  'BLOCKED_ROAD',
  'LANDSLIDE',
  'MEDICAL_EMERGENCY',
  'HAZARDOUS_MATERIAL',
  'OTHER'
];

const STATUS_BADGE: Record<PulseQueueStatus, { tone: Tone; icon: LucideIcon }> = {
  NOT_DELIVERED: { tone: 'warning', icon: Clock3 },
  DELIVERING: { tone: 'accent', icon: LoaderCircle },
  DELIVERED: { tone: 'success', icon: CheckCircle2 },
  FAILED: { tone: 'critical', icon: TriangleAlert }
};

const FIELD_CLASS =
  'w-full min-h-tap rounded-control border border-line-strong bg-white px-3 py-2 text-base sm:text-sm text-ink ' +
  'placeholder:text-ink-faint focus:border-accent focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent';

const LABEL_CLASS = 'block text-xs font-semibold text-ink-muted mb-1';

function formatTimestamp(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleString();
}

interface Feedback {
  tone: Tone;
  text: string;
}

export const RescuePulseView: React.FC = () => {
  const queue = usePulseQueue();
  const online = useOnlineStatus();

  const [incidentType, setIncidentType] = useState<IncidentType>('FLOOD');
  const [location, setLocation] = useState('');
  const [people, setPeople] = useState('');
  const [immediateDanger, setImmediateDanger] = useState(false);
  const [notes, setNotes] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const resetForm = () => {
    setIncidentType('FLOOD');
    setLocation('');
    setPeople('');
    setImmediateDanger(false);
    setNotes('');
    setEditingId(null);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const parsed = PulseStructuredReportSchema.safeParse({
      incident_type: incidentType,
      location_text: location,
      people_estimate: people.trim() === '' ? null : Number(people),
      immediate_danger: immediateDanger,
      notes
    });

    if (!parsed.success) {
      setFeedback({
        tone: 'critical',
        text: parsed.error.issues[0]?.message ?? 'Some details could not be accepted. Please check the form.'
      });
      return;
    }

    const result = editingId ? queue.update(editingId, parsed.data) : queue.save(parsed.data);

    if (!result.ok) {
      setFeedback({ tone: 'critical', text: result.message });
      return;
    }

    setFeedback({
      tone: online ? 'accent' : 'warning',
      text: online
        ? 'Saved on this device and sending now. It stays listed below until the server confirms receipt.'
        : 'Saved on this device. It has NOT been delivered — it will be sent when the connection returns.'
    });
    resetForm();
  };

  const startEditing = (clientId: string) => {
    const entry = queue.entries.find(candidate => candidate.client_id === clientId);
    if (!entry) return;
    setIncidentType(entry.incident_type);
    setLocation(entry.location_text);
    setPeople(entry.people_estimate === null ? '' : String(entry.people_estimate));
    setImmediateDanger(entry.immediate_danger);
    setNotes(entry.notes);
    setEditingId(clientId);
    setFeedback(null);
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <SimulatedNotice label={PULSE_SIMULATION_LABEL} />

      <header>
        <h1 className="text-lg font-semibold text-ink">RescuePulse — silent reporting</h1>
        <p className="mt-0.5 text-xs text-ink-subtle leading-5">
          Describe what you can see in your own words. Report only what you have observed; leave anything you do not
          know blank rather than guessing.
        </p>
      </header>

      {/*
        Safety-critical notice, rendered as a warning callout rather than inside
        the SIMULATED banner, so it is not read as part of the exercise framing.
      */}
      <div role="note" className="flex items-start gap-2.5 rounded-card border border-warning-border bg-warning-soft px-3.5 py-3">
        <PhoneCall className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <p className="text-xs text-ink-muted leading-5">{PULSE_DELIVERY_NOTICE}</p>
      </div>

      {!queue.persistent && (
        <div role="status" className="flex items-start gap-2.5 rounded-card border border-critical-border bg-critical-soft px-3.5 py-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-critical" aria-hidden="true" />
          <p className="text-xs text-ink-muted leading-5">
            This browser is not allowing local storage. A report saved here will be lost if you reload or close the
            page, so send it before you leave.
          </p>
        </div>
      )}

      {queue.invalidCount > 0 && (
        <div role="status" className="flex items-start gap-2.5 rounded-card border border-uncertain-border bg-uncertain-soft px-3.5 py-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-uncertain" aria-hidden="true" />
          <p className="text-xs text-ink-muted leading-5">
            {queue.invalidCount} saved {queue.invalidCount === 1 ? 'report' : 'reports'} could not be read and
            {queue.invalidCount === 1 ? ' has' : ' have'} not been sent. Nothing was guessed or repaired; please retype
            that report.
          </p>
        </div>
      )}

      {!online && <OfflineState message="You are offline. You can still write a report — it will be saved on this device and shown as not delivered until the connection returns." />}

      <Card
        title={editingId ? 'Edit the saved report' : 'Write a report'}
        description="Everything below is taken from your own statement."
        icon={Send}
      >
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className={LABEL_CLASS} htmlFor="pulse-type">
              What kind of emergency is it?
            </label>
            <select
              id="pulse-type"
              className={FIELD_CLASS}
              value={incidentType}
              onChange={event => setIncidentType(event.target.value as IncidentType)}
            >
              {INCIDENT_TYPES.map(type => (
                <option key={type} value={type}>
                  {describeIncidentType(type)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="pulse-location">
              Where is it? Leave blank if you do not know.
            </label>
            <input
              id="pulse-location"
              type="text"
              className={FIELD_CLASS}
              maxLength={PULSE_LIMITS.maxLocationLength}
              value={location}
              onChange={event => setLocation(event.target.value)}
              placeholder="e.g. Riverside Walk, by the old mill bridge"
              autoComplete="off"
            />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="pulse-people">
              How many people are involved? (optional)
            </label>
            <input
              id="pulse-people"
              type="number"
              inputMode="numeric"
              min={0}
              max={PULSE_LIMITS.maxPeople}
              className={cx(FIELD_CLASS, 'sm:max-w-[10rem]')}
              value={people}
              onChange={event => setPeople(event.target.value)}
              placeholder="Unknown"
            />
          </div>

          <div className="flex items-start gap-3 rounded-control border border-line bg-surface-muted px-3 py-2.5">
            <input
              id="pulse-danger"
              type="checkbox"
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-line-strong text-accent focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent"
              checked={immediateDanger}
              onChange={event => setImmediateDanger(event.target.checked)}
            />
            <label className="text-xs text-ink leading-5" htmlFor="pulse-danger">
              There is immediate danger to life right now.
              <span className="block text-ink-subtle">
                Only tick this if you believe it yourself — it is recorded as your statement, not as a measured fact.
              </span>
            </label>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="pulse-notes">
              Anything else you can see? (optional)
            </label>
            <textarea
              id="pulse-notes"
              className={cx(FIELD_CLASS, 'min-h-[5rem] resize-y')}
              rows={3}
              maxLength={PULSE_LIMITS.maxNotesLength}
              value={notes}
              onChange={event => setNotes(event.target.value)}
              placeholder="Water level, access problems, what you can hear or see…"
            />
          </div>

          {feedback && (
            <div
              role={feedback.tone === 'critical' ? 'alert' : 'status'}
              className={cx(
                'rounded-control border px-3 py-2.5 text-xs leading-5',
                feedback.tone === 'critical'
                  ? 'border-critical-border bg-critical-soft text-ink-muted'
                  : feedback.tone === 'warning'
                    ? 'border-warning-border bg-warning-soft text-ink-muted'
                    : 'border-accent-border bg-accent-soft text-ink-muted'
              )}
            >
              {feedback.text}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              type="submit"
              variant="primary"
              icon={editingId ? CheckCircle2 : Send}
              className="w-full sm:w-auto"
            >
              {editingId ? 'Save changes on this device' : 'Save report on this device'}
            </Button>
            {editingId && (
              <Button
                variant="secondary"
                icon={RotateCw}
                className="w-full sm:w-auto"
                onClick={() => {
                  resetForm();
                  setFeedback(null);
                }}
              >
                Cancel editing
              </Button>
            )}
          </div>
        </form>
      </Card>

      <Card
        title="Saved on this device"
        description={
          queue.entries.length === 0
            ? 'Nothing is stored here yet.'
            : `${queue.entries.length} stored ${queue.entries.length === 1 ? 'report' : 'reports'} — ${queue.pendingCount} not yet confirmed by the server.`
        }
        icon={Clock3}
      >
        {queue.entries.length === 0 ? (
          <EmptyState
            title="No reports saved on this device"
            description="A report you write is stored here until the server confirms it. This list never claims a report reached anyone — only the server's reply does."
          />
        ) : (
          <ul role="list" aria-live="polite" className="divide-y divide-line">
            {queue.entries.map(entry => {
              const badge = STATUS_BADGE[entry.status];
              const Icon = badge.icon;
              const canSend = entry.status === 'NOT_DELIVERED' || entry.status === 'FAILED';
              const canEdit = canSend;

              return (
                <li key={entry.client_id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={badge.tone} icon={Icon} srPrefix="Delivery status">
                      {QUEUE_STATUS_LABELS[entry.status]}
                    </Badge>
                    <span className="text-[11px] text-ink-faint">Written {formatTimestamp(entry.created_at)}</span>
                  </div>

                  <p className="text-xs text-ink leading-5">{describePulse(entry)}</p>

                  <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-subtle">
                    <div className="flex gap-1">
                      <dt className="font-semibold">Attempts</dt>
                      <dd>{entry.attempts}</dd>
                    </div>
                    {entry.server_incident_id && (
                      <div className="flex gap-1">
                        <dt className="font-semibold">Incident id</dt>
                        <dd className="font-mono">{entry.server_incident_id}</dd>
                      </div>
                    )}
                  </dl>

                  {entry.status === 'FAILED' && entry.last_error && (
                    <p className="text-[11px] text-critical leading-4">
                      Last attempt failed: {entry.last_error}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {canSend && (
                      <Button
                        size="sm"
                        variant="primary"
                        icon={Send}
                        onClick={() => void queue.deliver(entry.client_id)}
                      >
                        {entry.status === 'FAILED' ? 'Retry sending' : 'Send now'}
                      </Button>
                    )}
                    {canEdit && (
                      <Button size="sm" variant="secondary" icon={Pencil} onClick={() => startEditing(entry.client_id)}>
                        Edit
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Trash2}
                        onClick={() => queue.remove(entry.client_id)}
                        aria-label={`Remove the saved report about ${describeIncidentType(entry.incident_type)} from this device`}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <p className="text-[11px] text-ink-faint leading-5">
        Reports on this device are drafts written by a member of the public. They are not confirmed facts, and a
        coordinator still has to review them before anything is acted on.
      </p>
    </div>
  );
};
