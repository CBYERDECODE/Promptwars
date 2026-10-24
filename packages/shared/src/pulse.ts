/**
 * RescuePulse / LastSignal — silent reporting and the offline delivery queue.
 *
 * SAFETY RULES ENCODED HERE
 * -------------------------
 * 1. A report created on the device is `NOT_DELIVERED` until the server answers.
 *    Nothing in this module can mark an entry delivered without a server ack.
 * 2. The queue is idempotent: the key is derived deterministically from the
 *    report's own content, so a retry after a lost response resolves to the
 *    original record instead of creating a duplicate.
 * 3. Nothing here claims that a queued report reached emergency services. The
 *    shipped notice says the opposite, in plain language.
 * 4. Every value is labelled SIMULATED (`is_simulated: true`), because the whole
 *    exercise is a fictional demonstration.
 *
 * All parsing is Zod-validated, so a corrupted or tampered storage row can never
 * become a submitted report.
 */

import { z } from 'zod';
import { IncidentType, Provenance } from './types.js';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type PulseQueueStatus = 'NOT_DELIVERED' | 'DELIVERING' | 'DELIVERED' | 'FAILED';

/** The structured report a person builds on the device, before any network call. */
export interface PulseStructuredReport {
  /** What kind of emergency this is (reuses the single incident taxonomy). */
  incident_type: IncidentType;
  /** Free-text location, exactly as the reporter typed it. */
  location_text: string;
  /** How many people are involved, if the reporter knows. */
  people_estimate: number | null;
  /** Reporter's own statement that there is immediate danger. */
  immediate_danger: boolean;
  /** Optional extra detail. */
  notes: string;
}

/** A structured report plus its device-local identity. */
export interface PulseDraft extends PulseStructuredReport {
  /** Device-generated id. Stable for the life of the queued entry. */
  client_id: string;
  /** When the reporter created the entry (device clock). */
  created_at: string;
  /** Always true: this is a simulated exercise, never a live report. */
  is_simulated: true;
}

/** A queue row: the draft plus everything the delivery layer needs. */
export interface QueuedPulse extends PulseDraft {
  /**
   * Deterministic idempotency key. Two submissions of the same draft share it,
   * so the server can de-duplicate a retry without the client tracking state.
   */
  idempotency_key: string;
  status: PulseQueueStatus;
  /** Number of delivery attempts that have actually been made. */
  attempts: number;
  last_attempt_at: string | null;
  /** Human-readable reason for the last failure. Never contains a token. */
  last_error: string | null;
  /** Set only from a server response. Proof the report was accepted. */
  server_incident_id: string | null;
}

/** Extraction shape sent to `POST /api/incidents` (subset of the Gemini schema). */
export interface PulseExtraction {
  incident_type: IncidentType;
  summary: string;
  reported_location: string | null;
  hazard_indicators: string[];
  people_at_risk: { estimated_count: number | null; description: string | null };
  reported_injuries: { estimated_count: number | null; description: string | null };
  access_constraints: string[];
  reported_at: string;
  missing_information: string[];
  conflicting_information: string[];
  evidence_items: Array<{
    id: string;
    claim: string;
    provenance: Provenance;
    confidence: number;
  }>;
  uncertainty_notes: string[];
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

export const PULSE_LIMITS = {
  /** Maximum characters accepted in the free-text location field. */
  maxLocationLength: 120,
  /** Maximum characters accepted in the optional notes field. */
  maxNotesLength: 500,
  /** Upper bound on a self-reported headcount. */
  maxPeople: 999,
  /** How many queued entries the device keeps before refusing new ones. */
  maxQueuedEntries: 50
} as const;

/**
 * Shipped verbatim with every queued entry. The second sentence is the one that
 * matters most: an offline device must never imply it reached anyone.
 */
export const PULSE_DELIVERY_NOTICE =
  'Reports saved on this device are NOT DELIVERED until the server confirms receipt. ' +
  'This app cannot contact emergency services for you — if you are in immediate danger, call your local emergency number now.';

/** Labelled proof for the UI that this surface is a fictional exercise. */
export const PULSE_SIMULATION_LABEL = 'SIMULATED — silent reporting exercise';

/** Confidence assigned to a single unverified human report. */
export const PULSE_REPORT_CONFIDENCE = 0.6;

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

/**
 * `sanitiseText` mirrors the pipeline used elsewhere in the product:
 * strip control characters/newlines that could break a log or a CSV, collapse
 * runs of whitespace, then cap the length. Applied before validation so the
 * schema's `.max()` limits are measured on the stored value.
 */
function sanitiseText(value: string, maxLength: number): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export const PulseStructuredReportSchema = z.object({
  incident_type: z.enum([
    'FLOOD',
    'FIRE',
    'INFRASTRUCTURE_DAMAGE',
    'BLOCKED_ROAD',
    'LANDSLIDE',
    'MEDICAL_EMERGENCY',
    'HAZARDOUS_MATERIAL',
    'OTHER'
  ]),
  location_text: z
    .string()
    .transform(value => sanitiseText(value, PULSE_LIMITS.maxLocationLength))
    .pipe(z.string().max(PULSE_LIMITS.maxLocationLength)),
  people_estimate: z
    .union([z.number(), z.null(), z.undefined()])
    .transform(value => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null))
    .pipe(z.number().int().min(0).max(PULSE_LIMITS.maxPeople).nullable()),
  immediate_danger: z.boolean().default(false),
  notes: z
    .string()
    .default('')
    .transform(value => sanitiseText(value, PULSE_LIMITS.maxNotesLength))
    .pipe(z.string().max(PULSE_LIMITS.maxNotesLength))
});

/**
 * Validates a stored queue row. Anything that fails this check is treated as
 * unusable and surfaced to the reporter rather than silently submitted.
 */
export const QueuedPulseSchema = PulseStructuredReportSchema.extend({
  client_id: z.string().min(1).max(80),
  created_at: z.string().min(1),
  is_simulated: z.literal(true),
  idempotency_key: z.string().min(1).max(128),
  status: z.enum(['NOT_DELIVERED', 'DELIVERING', 'DELIVERED', 'FAILED']),
  attempts: z.number().int().min(0),
  last_attempt_at: z.string().nullable(),
  last_error: z.string().nullable(),
  server_incident_id: z.string().nullable()
});

/* ------------------------------------------------------------------ */
/* Deterministic derivation                                            */
/* ------------------------------------------------------------------ */

const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  FLOOD: 'Flooding',
  FIRE: 'Fire',
  INFRASTRUCTURE_DAMAGE: 'Structural damage',
  BLOCKED_ROAD: 'Blocked road',
  LANDSLIDE: 'Landslide',
  MEDICAL_EMERGENCY: 'Medical emergency',
  HAZARDOUS_MATERIAL: 'Hazardous material',
  OTHER: 'Other hazard'
};

/** Plain-language label for an incident type. Never explains, only names. */
export function describeIncidentType(incidentType: IncidentType): string {
  return INCIDENT_TYPE_LABELS[incidentType] ?? 'Other hazard';
}

/**
 * One-line summary built from the reporter's own input only.
 *
 * It asserts nothing the reporter did not state: no severity claim, no
 * inference about people, and no model involvement. Deterministic for a given
 * draft, which is what makes the idempotency key below meaningful.
 */
export function describePulse(report: PulseStructuredReport): string {
  const parts: string[] = [];
  parts.push(`${describeIncidentType(report.incident_type)} reported`);

  const location = report.location_text.trim();
  parts.push(location.length > 0 ? `at ${location}` : 'at an unspecified location');

  if (report.people_estimate !== null) {
    parts.push(`${report.people_estimate} people indicated by the reporter`);
  }
  if (report.immediate_danger) {
    parts.push('reporter states immediate danger');
  }
  if (report.notes.trim().length > 0) {
    parts.push(`details: ${report.notes.trim()}`);
  }
  return `${parts.join('; ')}.`;
}

/**
 * FNV-1a over the report's canonical fields.
 *
 * Bounded to 32 bits so the key stays inside the server's 128-character limit,
 * and derived only from content the reporter controls — the status, attempt
 * count and timestamps are deliberately excluded, so retries of an unchanged
 * report always present the same key.
 */
export function deriveIdempotencyKey(draft: PulseDraft): string {
  const canonical = [
    draft.client_id,
    draft.incident_type,
    draft.location_text.trim(),
    draft.people_estimate === null ? '' : String(draft.people_estimate),
    draft.immediate_danger ? '1' : '0',
    draft.notes.trim()
  ].join('|');

  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `resq-pulse-${hash.toString(16).padStart(8, '0')}`;
}

/**
 * Convert a stored entry into the server's incident-create payload.
 *
 * Everything the server receives is either the reporter's own words or an
 * explicit statement that the value is unknown — the function never invents a
 * severity, a casualty count or a location.
 */
export function buildPulseExtraction(entry: QueuedPulse): PulseExtraction {
  const hazardIndicators: string[] = [];
  if (entry.immediate_danger) hazardIndicators.push('Reporter states immediate danger');
  hazardIndicators.push(`Reported via silent reporting by a member of the public`);

  const missingInformation: string[] = [];
  if (entry.location_text.trim().length === 0) missingInformation.push('Exact location not provided');
  if (entry.people_estimate === null) missingInformation.push('Number of people affected not stated');
  if (entry.notes.trim().length === 0) missingInformation.push('No additional detail supplied');

  return {
    incident_type: entry.incident_type,
    summary: describePulse(entry),
    reported_location: entry.location_text.trim().length > 0 ? entry.location_text.trim() : null,
    hazard_indicators: hazardIndicators,
    people_at_risk: { estimated_count: entry.people_estimate, description: null },
    reported_injuries: { estimated_count: null, description: null },
    access_constraints: [],
    reported_at: entry.created_at,
    missing_information: missingInformation,
    conflicting_information: [],
    evidence_items: [
      {
        id: `pulse-evidence-${entry.idempotency_key}`,
        claim: 'A member of the public reported this on the ground.',
        provenance: 'USER_REPORTED',
        confidence: PULSE_REPORT_CONFIDENCE
      }
    ],
    uncertainty_notes: [
      'Single unverified public report. Nothing here has been confirmed by a coordinator.'
    ]
  };
}

/* ------------------------------------------------------------------ */
/* Status helpers                                                      */
/* ------------------------------------------------------------------ */

/**
 * Entries a delivery attempt may be made for. `DELIVERED` is deliberately
 * excluded: a confirmed entry is never re-sent, and `DELIVERING` avoids two
 * concurrent attempts for the same row.
 */
export function isDeliverable(entry: QueuedPulse): boolean {
  return entry.status === 'NOT_DELIVERED' || entry.status === 'FAILED';
}

/**
 * Entries the reporter may still edit. Once an attempt is in flight or the
 * server has accepted the report, the content is frozen so the audit trail and
 * the idempotency key cannot diverge.
 */
export function isEditable(entry: QueuedPulse): boolean {
  return entry.status === 'NOT_DELIVERED' || entry.status === 'FAILED';
}

export const QUEUE_STATUS_LABELS: Record<PulseQueueStatus, string> = {
  NOT_DELIVERED: 'Not delivered',
  DELIVERING: 'Sending',
  DELIVERED: 'Delivered',
  FAILED: 'Not delivered — last attempt failed'
};
