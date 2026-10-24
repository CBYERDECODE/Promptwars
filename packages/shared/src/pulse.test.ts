import { describe, it, expect } from 'vitest';
import {
  PULSE_LIMITS,
  PULSE_REPORT_CONFIDENCE,
  PulseStructuredReportSchema,
  QueuedPulseSchema,
  buildPulseExtraction,
  deriveIdempotencyKey,
  isDeliverable,
  isEditable,
  type PulseDraft,
  type PulseStructuredReport,
  type QueuedPulse
} from './pulse.js';

const CREATED_AT = '2026-09-12T08:00:00.000Z';

const BASE_REPORT: PulseStructuredReport = {
  incident_type: 'FLOOD',
  location_text: 'Riverside Walk near the old mill',
  people_estimate: 3,
  immediate_danger: true,
  notes: 'Water rising fast'
};

function draft(overrides: Partial<PulseStructuredReport> = {}): PulseDraft {
  return {
    ...BASE_REPORT,
    ...overrides,
    client_id: 'client-0001',
    created_at: CREATED_AT,
    is_simulated: true
  };
}

function queued(overrides: Partial<QueuedPulse> = {}): QueuedPulse {
  const base = draft();
  return {
    ...base,
    idempotency_key: deriveIdempotencyKey(base),
    status: 'NOT_DELIVERED',
    attempts: 0,
    last_attempt_at: null,
    last_error: null,
    server_incident_id: null,
    ...overrides
  };
}

describe('deriveIdempotencyKey', () => {
  it('is deterministic: the same draft always produces the same key', () => {
    expect(deriveIdempotencyKey(draft())).toBe(deriveIdempotencyKey(draft()));
  });

  it('changes when any reporter-controlled field changes', () => {
    const original = deriveIdempotencyKey(draft());
    expect(deriveIdempotencyKey(draft({ notes: 'Different detail' }))).not.toBe(original);
    expect(deriveIdempotencyKey(draft({ location_text: 'Elsewhere' }))).not.toBe(original);
    expect(deriveIdempotencyKey(draft({ immediate_danger: false }))).not.toBe(original);
    expect(deriveIdempotencyKey(draft({ people_estimate: null }))).not.toBe(original);
  });

  it('ignores delivery state so a retry of an unchanged report keeps its key', () => {
    const original = deriveIdempotencyKey(draft());
    const retried = queued({
      status: 'FAILED',
      attempts: 4,
      last_error: 'Network unavailable',
      last_attempt_at: CREATED_AT
    });
    expect(deriveIdempotencyKey(retried)).toBe(original);
  });

  it('stays inside the server-side key limit and is namespaced to this surface', () => {
    const key = deriveIdempotencyKey(draft());
    expect(key.startsWith('resq-pulse-')).toBe(true);
    // `Idempotency-Key` is capped at 128 characters by the backend.
    expect(key.length).toBeLessThanOrEqual(128);
  });
});

describe('buildPulseExtraction — never invents what the reporter did not state', () => {
  it('passes the reporter’s own words through and asserts nothing more', () => {
    const extraction = buildPulseExtraction(queued());
    expect(extraction.reported_location).toBe(BASE_REPORT.location_text);
    expect(extraction.people_at_risk.estimated_count).toBe(3);
    expect(extraction.summary).toContain(BASE_REPORT.location_text);
    expect(extraction.summary).toContain('immediate danger');
  });

  it('records an unknown location as unknown instead of guessing', () => {
    const extraction = buildPulseExtraction(queued({ location_text: '' }));
    expect(extraction.reported_location).toBeNull();
    expect(extraction.missing_information).toContain('Exact location not provided');
    expect(extraction.summary).toContain('unspecified location');
  });

  it('records an unknown headcount as unknown', () => {
    const extraction = buildPulseExtraction(queued({ people_estimate: null }));
    expect(extraction.people_at_risk.estimated_count).toBeNull();
    expect(extraction.missing_information).toContain('Number of people affected not stated');
  });

  it('tags the single report as USER_REPORTED and never inflates its confidence', () => {
    const extraction = buildPulseExtraction(queued());
    expect(extraction.evidence_items).toHaveLength(1);
    expect(extraction.evidence_items[0].provenance).toBe('USER_REPORTED');
    expect(extraction.evidence_items[0].confidence).toBe(PULSE_REPORT_CONFIDENCE);
  });

  it('never assigns a severity, a casualty count or an injury estimate', () => {
    const extraction = buildPulseExtraction(queued());
    const text = JSON.stringify(extraction);
    for (const severityWord of ['Critical', 'High', 'Moderate', 'Low', 'Needs review']) {
      expect(text).not.toContain(severityWord);
    }
    expect(extraction.reported_injuries).toEqual({ estimated_count: null, description: null });
  });
});

describe('delivery state machine', () => {
  it('treats only never-sent or failed entries as deliverable', () => {
    expect(isDeliverable(queued({ status: 'NOT_DELIVERED' }))).toBe(true);
    expect(isDeliverable(queued({ status: 'FAILED' }))).toBe(true);
    // A confirmed entry must never be re-sent, and an in-flight one must not be double-sent.
    expect(isDeliverable(queued({ status: 'DELIVERED' }))).toBe(false);
    expect(isDeliverable(queued({ status: 'DELIVERING' }))).toBe(false);
  });

  it('freezes content once an attempt is in flight or the server accepted it', () => {
    expect(isEditable(queued({ status: 'NOT_DELIVERED' }))).toBe(true);
    expect(isEditable(queued({ status: 'FAILED' }))).toBe(true);
    expect(isEditable(queued({ status: 'DELIVERING' }))).toBe(false);
    expect(isEditable(queued({ status: 'DELIVERED' }))).toBe(false);
  });
});

describe('PulseStructuredReportSchema — untrusted input is sanitised before storage', () => {
  it('strips control characters, collapses whitespace and caps the location length', () => {
    const parsed = PulseStructuredReportSchema.parse({
      incident_type: 'FIRE',
      location_text: `  Line\u0000one\n\ttwo   ${'x'.repeat(200)}`,
      people_estimate: 2,
      immediate_danger: false,
      notes: ''
    });

    expect(parsed.location_text).not.toMatch(/[\u0000-\u001F]/);
    expect(parsed.location_text.startsWith('Line one two')).toBe(true);
    expect(parsed.location_text.length).toBeLessThanOrEqual(PULSE_LIMITS.maxLocationLength);
  });

  it('floors and clamps a self-reported headcount', () => {
    expect(
      PulseStructuredReportSchema.parse({ ...BASE_REPORT, people_estimate: 3.9 }).people_estimate
    ).toBe(3);
    expect(
      PulseStructuredReportSchema.parse({ ...BASE_REPORT, people_estimate: -4 }).people_estimate
    ).toBe(0);
  });
});

describe('QueuedPulseSchema — a tampered storage row can never become a report', () => {
  it('accepts a well-formed row', () => {
    expect(QueuedPulseSchema.safeParse(queued()).success).toBe(true);
  });

  it('rejects a row whose simulation label was stripped', () => {
    expect(QueuedPulseSchema.safeParse({ ...queued(), is_simulated: false }).success).toBe(false);
  });

  it('rejects a row with an unknown delivery status', () => {
    expect(QueuedPulseSchema.safeParse({ ...queued(), status: 'SENT' }).success).toBe(false);
  });

  it('rejects a row with a negative attempt count', () => {
    expect(QueuedPulseSchema.safeParse({ ...queued(), attempts: -1 }).success).toBe(false);
  });
});
