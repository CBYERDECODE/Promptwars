import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PULSE_LIMITS,
  PulseStructuredReport,
  QueuedPulse,
  QueuedPulseSchema,
  buildPulseExtraction,
  deriveIdempotencyKey,
  isDeliverable,
  isEditable
} from '@resq-ai/shared';
import { createIncident } from '../api/client';
import { useOnlineStatus } from './useRescueData';

/**
 * RescuePulse / LastSignal — the offline reporting queue.
 *
 * HONESTY RULES ENFORCED HERE
 * ---------------------------
 * 1. An entry is `NOT_DELIVERED` from the moment it is created until the server
 *    answers with an incident id. Nothing in this module can mark an entry
 *    delivered on its own — only a successful server response does that.
 * 2. Every attempt re-sends the entry's own deterministic idempotency key, so a
 *    retry after a lost response resolves to the original incident (and its
 *    audit entry) instead of creating a duplicate.
 * 3. A queue row that fails validation on read is never repaired by guessing.
 *    It is counted and reported so the reporter knows something is unusable.
 */

export const PULSE_STORAGE_KEY = 'resq.pulse.queue.v1';

export interface PulseQueueReadResult {
  entries: QueuedPulse[];
  /** Rows found on disk that failed validation and are therefore unusable. */
  invalid: number;
}

/**
 * `localStorage` throws in some privacy modes. Probing once lets the view tell
 * the reporter the truth: without storage, a queued report does not survive a
 * reload.
 */
export function getPulseStorage(): Storage | null {
  try {
    const probe = '__resq_pulse_probe__';
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Reads and validates the stored queue. Unusable rows are counted, never coerced. */
export function readPulseQueue(storage: Storage | null): PulseQueueReadResult {
  if (!storage) return { entries: [], invalid: 0 };

  const raw = storage.getItem(PULSE_STORAGE_KEY);
  if (!raw) return { entries: [], invalid: 0 };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { entries: [], invalid: 1 };
  }
  if (!Array.isArray(parsed)) return { entries: [], invalid: 1 };

  const entries: QueuedPulse[] = [];
  let invalid = 0;
  for (const row of parsed) {
    const result = QueuedPulseSchema.safeParse(row);
    if (result.success) {
      entries.push(result.data as QueuedPulse);
    } else {
      invalid += 1;
    }
  }
  return { entries, invalid };
}

export function writePulseQueue(storage: Storage | null, entries: QueuedPulse[]): void {
  if (!storage) return;
  try {
    storage.setItem(PULSE_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // A full or blocked storage never breaks the session: the queue simply
    // stops persisting and the view's `persistent` flag tells the reporter.
  }
}

/** Device-local id. Prefers the platform UUID, falls back for older engines. */
export function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pulse-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Turns a validated report into a queue row. The idempotency key is derived
 * from the content at creation time, so editing the draft produces a new key
 * while retrying an unchanged one does not.
 */
export function createQueuedPulse(
  report: PulseStructuredReport,
  now: string,
  clientId: string
): QueuedPulse {
  const draft = { ...report, client_id: clientId, created_at: now, is_simulated: true as const };
  return {
    ...draft,
    idempotency_key: deriveIdempotencyKey(draft),
    status: 'NOT_DELIVERED',
    attempts: 0,
    last_attempt_at: null,
    last_error: null,
    server_incident_id: null
  };
}

export type PulseSaveResult = { ok: true; entry: QueuedPulse } | { ok: false; message: string };

export interface PulseQueueController {
  entries: QueuedPulse[];
  /** Unusable rows found in storage; shown to the reporter, never silently dropped. */
  invalidCount: number;
  /** False when the browser refused local storage, so the queue is session-only. */
  persistent: boolean;
  /** True while at least one delivery attempt is in flight. */
  delivering: boolean;
  pendingCount: number;
  save: (report: PulseStructuredReport) => PulseSaveResult;
  update: (clientId: string, report: PulseStructuredReport) => PulseSaveResult;
  remove: (clientId: string) => void;
  deliver: (clientId: string) => Promise<void>;
}

/** Surfaces the API's own message, and never implies delivery on a failure. */
function describeFailure(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return 'The report could not be delivered. It stays on this device.';
}

export function usePulseQueue(): PulseQueueController {
  const [storage] = useState<Storage | null>(() => getPulseStorage());
  const [initial] = useState<PulseQueueReadResult>(() => readPulseQueue(storage));
  const [entries, setEntries] = useState<QueuedPulse[]>(initial.entries);
  const [invalidCount] = useState(initial.invalid);
  const [inFlight, setInFlight] = useState<string[]>([]);
  const online = useOnlineStatus();

  // Mirrors `entries` so an attempt can read the current queue without
  // re-creating the delivery callbacks on every keystroke elsewhere.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  useEffect(() => {
    writePulseQueue(storage, entries);
  }, [storage, entries]);

  const patchEntry = useCallback((clientId: string, patch: (entry: QueuedPulse) => QueuedPulse) => {
    setEntries(current => current.map(entry => (entry.client_id === clientId ? patch(entry) : entry)));
  }, []);

  /**
   * Attempts delivery for an entry. `attempts` only increases once a request
   * has actually been made, and `DELIVERED` is reachable only from a server
   * response carrying an incident id.
   */
  const attemptDelivery = useCallback(
    async (entry: QueuedPulse) => {
      if (inFlight.includes(entry.client_id)) return;

      setInFlight(current => [...current, entry.client_id]);
      patchEntry(entry.client_id, current => ({
        ...current,
        status: 'DELIVERING',
        last_attempt_at: new Date().toISOString()
      }));

      try {
        const record = await createIncident({
          extraction: buildPulseExtraction(entry),
          source_channel: 'MANUAL_TEXT',
          is_simulated: true,
          idempotency_key: entry.idempotency_key
        });
        patchEntry(entry.client_id, current => ({
          ...current,
          status: 'DELIVERED',
          attempts: current.attempts + 1,
          last_attempt_at: new Date().toISOString(),
          last_error: null,
          server_incident_id: record.id
        }));
      } catch (error) {
        patchEntry(entry.client_id, current => ({
          ...current,
          status: 'FAILED',
          attempts: current.attempts + 1,
          last_attempt_at: new Date().toISOString(),
          last_error: describeFailure(error)
        }));
      } finally {
        setInFlight(current => current.filter(id => id !== entry.client_id));
      }
    },
    [inFlight, patchEntry]
  );

  const deliver = useCallback(
    async (clientId: string) => {
      const entry = entriesRef.current.find(candidate => candidate.client_id === clientId);
      if (!entry || !isDeliverable(entry)) return;
      await attemptDelivery(entry);
    },
    [attemptDelivery]
  );

  const save = useCallback(
    (report: PulseStructuredReport): PulseSaveResult => {
      if (entriesRef.current.length >= PULSE_LIMITS.maxQueuedEntries) {
        return {
          ok: false,
          message: `This device already holds ${PULSE_LIMITS.maxQueuedEntries} unsent reports. Send or remove one before adding another.`
        };
      }

      const entry = createQueuedPulse(report, new Date().toISOString(), newClientId());
      entriesRef.current = [entry, ...entriesRef.current];
      setEntries(current => [entry, ...current]);

      if (online) void attemptDelivery(entry);
      return { ok: true, entry };
    },
    [attemptDelivery, online]
  );

  const update = useCallback(
    (clientId: string, report: PulseStructuredReport): PulseSaveResult => {
      const existing = entriesRef.current.find(entry => entry.client_id === clientId);
      if (!existing) return { ok: false, message: 'That saved report is no longer on this device.' };
      if (!isEditable(existing)) {
        return { ok: false, message: 'A report that has already been sent cannot be changed.' };
      }

      // The device id and creation time are kept so the trail stays coherent,
      // but the key is re-derived: the content the server receives has changed.
      const next = createQueuedPulse(report, existing.created_at, existing.client_id);
      entriesRef.current = entriesRef.current.map(entry => (entry.client_id === clientId ? next : entry));
      setEntries(current => current.map(entry => (entry.client_id === clientId ? next : entry)));

      if (online) void attemptDelivery(next);
      return { ok: true, entry: next };
    },
    [attemptDelivery, online]
  );

  const remove = useCallback((clientId: string) => {
    entriesRef.current = entriesRef.current.filter(entry => entry.client_id !== clientId);
    setEntries(current => current.filter(entry => entry.client_id !== clientId));
  }, []);

  /**
   * Retrying automatically must happen once per reconnection, not on every
   * re-render — otherwise a permanently failing report would be retried in a
   * loop for as long as the browser is online.
   */
  const attemptRef = useRef(attemptDelivery);
  attemptRef.current = attemptDelivery;
  const wasOnline = useRef(online);

  useEffect(() => {
    const reconnected = online && !wasOnline.current;
    wasOnline.current = online;
    if (!reconnected) return;

    for (const entry of entriesRef.current.filter(isDeliverable)) {
      void attemptRef.current(entry);
    }
  }, [online]);

  return {
    entries,
    invalidCount,
    persistent: storage !== null,
    delivering: inFlight.length > 0,
    pendingCount: entries.filter(entry => entry.status !== 'DELIVERED').length,
    save,
    update,
    remove,
    deliver
  };
}
