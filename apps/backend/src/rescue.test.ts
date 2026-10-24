/**
 * Rescue Intelligence API tests (SIMULATED).
 *
 * Covers, per the project quality gate:
 *  - Zod validation of every new endpoint (invalid input -> 400),
 *  - admin authorization on the human-decision endpoint (401/201),
 *  - rate limiting on the dedicated limiters,
 *  - the "Gemini explains, never allocates" contract, including the mandatory
 *    deterministic-template fallback when the model fails,
 *  - the SIMULATED labelling and the "warrants verification" wording,
 *  - idempotent recording of human decisions.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { InMemoryIncidentRepository } from './repository/inMemoryRepository.js';
import { config } from './config.js';
import { RescueNarrativeService } from './services/rescueNarrative.js';

const BRIDGE_KEY = 'junction|westdepot';

const VALID_EXPLANATION = JSON.stringify({
  explanation:
    'Two zones warrant verification because reported volume is far below expectation and one access road is closed.',
  verification_suggestions: [
    'Call the community contact in Cedar Hollow before dispatching.',
    'Fly a drone along the accessible approach to confirm road state.'
  ]
});

describe('Rescue Intelligence API (SIMULATED)', () => {
  let repo: InMemoryIncidentRepository;
  const originalToken = config.adminToken;

  beforeEach(() => {
    repo = new InMemoryIncidentRepository();
    // Local/dev bypass of the admin guard, so the decision route is reachable.
    config.adminToken = null;
  });

  afterEach(() => {
    config.adminToken = originalToken;
  });

  const appWithNarrative = (narrative?: RescueNarrativeService) =>
    createApp(repo, undefined, undefined, narrative);

  /* ---------------------------------------------------------------- */
  /* Dataset + algorithm transparency                                  */
  /* ---------------------------------------------------------------- */

  it('publishes the SIMULATED dataset and the exact parameters the algorithms use', async () => {
    const res = await request(appWithNarrative()).get('/api/rescue/dataset');

    expect(res.status).toBe(200);
    expect(res.body.is_simulated).toBe(true);
    expect(res.body.label).toContain('SIMULATED');
    expect(res.body.dataset.is_simulated).toBe(true);
    expect(res.body.dataset.zones).toHaveLength(5);
    expect(res.body.dataset.units).toHaveLength(5);
    expect(res.body.dataset.incidents).toHaveLength(5);

    // Weights are published and normalised, so the score is auditable.
    const weights = res.body.methods.radar_weights;
    const sum = Object.values<number>(weights).reduce((total, value) => total + value, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(res.body.methods.strategies.map((s: { id: string }) => s.id)).toEqual([
      'FASTEST',
      'SEVERITY_FIRST',
      'COVERAGE_BALANCED'
    ]);
    expect(res.body.framing).toContain('warrant verification');
  });

  /* ---------------------------------------------------------------- */
  /* Invisible Victims Radar                                           */
  /* ---------------------------------------------------------------- */

  it('flags quiet zones for verification and never claims victims are present', async () => {
    const res = await request(appWithNarrative()).post('/api/rescue/radar').send({});

    expect(res.status).toBe(200);
    expect(res.body.is_simulated).toBe(true);
    expect(res.body.result.framing).toContain('warrant verification');

    const zones = res.body.result.zones as Array<{
      reports_observed: number;
      priority_score: number;
      confidence: string;
      missing_data: string[];
      recommended_verification_actions: string[];
      evidence: Array<{ detail: string; unobserved?: boolean }>;
    }>;

    // A zone with zero reports must be treated as a data gap, not as calm.
    const silent = zones.filter((zone) => zone.reports_observed === 0);
    expect(silent.length).toBeGreaterThan(0);
    for (const zone of silent) {
      expect(zone.priority_score).toBeGreaterThan(0);
      expect(zone.missing_data.length).toBeGreaterThan(0);
      expect(zone.recommended_verification_actions.length).toBeGreaterThan(0);
    }
    expect(zones.some((zone) => zone.confidence === 'Low')).toBe(true);

    // Language contract: no zone may assert that casualties exist.
    const rendered = JSON.stringify(res.body.result);
    expect(rendered.toLowerCase()).not.toContain('victims are');
    expect(rendered.toLowerCase()).not.toContain('casualties present');
  });

  it('is deterministic: identical inputs produce identical zone scores', async () => {
    const app = appWithNarrative();
    const first = await request(app).post('/api/rescue/radar').send({ window_hours: 3 });
    const second = await request(app).post('/api/rescue/radar').send({ window_hours: 3 });

    expect(first.status).toBe(200);
    expect(first.body.result.zones).toEqual(second.body.result.zones);
  });

  it('rejects invalid radar input with a validation error', async () => {
    const app = appWithNarrative();

    const badWindow = await request(app).post('/api/rescue/radar').send({ window_hours: -4 });
    expect(badWindow.status).toBe(400);
    expect(badWindow.body.error.code).toBe('VALIDATION_ERROR');

    const badEdge = await request(app).post('/api/rescue/radar').send({ blocked_edge_keys: ['not an edge key'] });
    expect(badEdge.status).toBe(400);
    expect(badEdge.body.error.code).toBe('VALIDATION_ERROR');
  });

  /* ---------------------------------------------------------------- */
  /* FairRescue                                                        */
  /* ---------------------------------------------------------------- */

  it('returns all three strategies over identical inputs so they can be compared', async () => {
    const app = appWithNarrative();
    const res = await request(app).post('/api/rescue/plans').send({});

    expect(res.status).toBe(200);
    expect(res.body.is_simulated).toBe(true);
    expect(res.body.plans).toHaveLength(3);
    for (const plan of res.body.plans) {
      expect(plan.strategy_label.length).toBeGreaterThan(0);
      expect(plan.metrics.coverage_pct).toBeGreaterThanOrEqual(0);
      expect(plan.disadvantaged_summary.length).toBeGreaterThan(0);
    }

    const again = await request(app).post('/api/rescue/plans').send({});
    expect(again.body.plans).toEqual(res.body.plans);
  });

  /* ---------------------------------------------------------------- */
  /* RescueBrain                                                       */
  /* ---------------------------------------------------------------- */

  it('recomputes the plan when the Mill Bridge closes and explains the consequence', async () => {
    const app = appWithNarrative();

    const open = await request(app).post('/api/rescue/plan').send({ strategy: 'FASTEST' });
    const closed = await request(app)
      .post('/api/rescue/plan')
      .send({ strategy: 'FASTEST', scenario: { blocked_edge_keys: [BRIDGE_KEY] } });

    expect(open.status).toBe(200);
    expect(closed.status).toBe(200);
    expect(closed.body.result.is_simulated).toBe(true);
    expect(closed.body.result.active_constraints.join(' ')).toContain('Mill Bridge');
    expect(closed.body.result.unassigned.length).toBeGreaterThan(open.body.result.unassigned.length);
    // Cutting the only west-bank link costs capacity: fewer units end up committed.
    expect(closed.body.result.metrics.utilization_pct).toBeLessThan(open.body.result.metrics.utilization_pct);
    for (const incident of closed.body.result.unassigned) {
      expect(typeof incident.reason).toBe('string');
      expect(incident.reason.length).toBeGreaterThan(0);
    }

    // Every assignment must carry a "why", and every plan a disadvantaged summary.
    for (const assignment of closed.body.result.assignments) {
      expect(assignment.reasons.length).toBeGreaterThan(0);
    }
    expect(closed.body.result.disadvantaged_summary.length).toBeGreaterThan(0);
  });

  it('accepts an injected critical incident and rejects a malformed one', async () => {
    const app = appWithNarrative();

    const injected = {
      id: 'inc-new-critical',
      zone_id: 'z-marketrow',
      node_id: 'marketrow',
      severity: 'Critical',
      title: 'Collapsed walkway trapping residents',
      people_at_risk: 12,
      reported_at: '2026-10-24T09:00:00.000Z'
    };

    const ok = await request(app)
      .post('/api/rescue/plan')
      .send({ strategy: 'SEVERITY_FIRST', scenario: { extra_incidents: [injected] } });
    expect(ok.status).toBe(200);
    expect(ok.body.result.total_incidents).toBe(6);
    expect(ok.body.result.active_constraints.join(' ')).toContain('injected');

    const badId = await request(app)
      .post('/api/rescue/plan')
      .send({ strategy: 'SEVERITY_FIRST', scenario: { extra_incidents: [{ ...injected, id: 'Not A Slug!' }] } });
    expect(badId.status).toBe(400);
    expect(badId.body.error.code).toBe('VALIDATION_ERROR');

    const badStrategy = await request(app).post('/api/rescue/plan').send({ strategy: 'MOST_DRAMATIC' });
    expect(badStrategy.status).toBe(400);
  });

  /* ---------------------------------------------------------------- */
  /* CrisisReplay                                                      */
  /* ---------------------------------------------------------------- */

  it('compares a hypothetical override against the baseline with a permanent banner', async () => {
    const app = appWithNarrative();
    const res = await request(app)
      .post('/api/rescue/replay')
      .send({ strategy: 'FASTEST', override: { unit_id: 'unit-amb-1', incident_id: 'inc-northgate' } });

    expect(res.status).toBe(200);
    expect(res.body.result.is_simulated).toBe(true);
    expect(res.body.result.banner).toContain('not verified');
    expect(res.body.result.deltas).toHaveLength(7);
    expect(res.body.result.assumptions.length).toBeGreaterThan(0);
    expect(res.body.result.override_summary).toContain('What if');
  });

  it('rejects an invalid replay override', async () => {
    const res = await request(appWithNarrative())
      .post('/api/rescue/replay')
      .send({ strategy: 'FASTEST', override: { unit_id: 'unit amb 1', incident_id: 'inc-northgate' } });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  /* ---------------------------------------------------------------- */
  /* Narrative layer — Gemini explains, never allocates                */
  /* ---------------------------------------------------------------- */

  it('returns a validated model explanation and labels its source', async () => {
    const app = appWithNarrative(
      new RescueNarrativeService({ generator: async () => VALID_EXPLANATION })
    );
    const res = await request(app).post('/api/rescue/explain').send({ kind: 'RADAR', request: {} });

    expect(res.status).toBe(200);
    expect(res.body.is_simulated).toBe(true);
    expect(res.body.result.zones).toBeDefined();
    expect(res.body.narrative.source).toBe('GEMINI');
    expect(res.body.narrative.explanation).toContain('warrant verification');
    expect(res.body.narrative.verification_suggestions.length).toBeGreaterThan(0);
  });

  it('falls back to the deterministic template when the model fails, without leaking the provider error', async () => {
    const app = appWithNarrative(
      new RescueNarrativeService({
        generator: async () => {
          throw new Error('ECONNREFUSED: provider endpoint unreachable');
        }
      })
    );
    const res = await request(app).post('/api/rescue/explain').send({ kind: 'RADAR', request: {} });

    expect(res.status).toBe(200);
    expect(res.body.narrative.source).toBe('TEMPLATE');
    expect(res.body.narrative.explanation.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
  });

  it('falls back to the template when the model returns unparseable or schema-invalid output', async () => {
    const notJson = appWithNarrative(
      new RescueNarrativeService({ generator: async () => 'I think three zones are in danger.' })
    );
    const first = await request(notJson).post('/api/rescue/explain').send({ kind: 'PLAN', request: { strategy: 'FASTEST' } });
    expect(first.status).toBe(200);
    expect(first.body.narrative.source).toBe('TEMPLATE');

    const wrongShape = appWithNarrative(
      new RescueNarrativeService({ generator: async () => JSON.stringify({ nope: true }) })
    );
    const second = await request(wrongShape)
      .post('/api/rescue/explain')
      .send({ kind: 'REPLAY', request: { strategy: 'FASTEST', override: { unit_id: 'unit-amb-1', incident_id: 'inc-northgate' } } });
    expect(second.status).toBe(200);
    expect(second.body.narrative.source).toBe('TEMPLATE');
  });

  it('sanitises bidirectional overrides out of model output before it can reach a user', async () => {
    const hostile = JSON.stringify({
      explanation: `Zone A is fine\u202E but zone B is not, and this sentence must not be re-ordered.`,
      verification_suggestions: ['Verify\u202E the bridge by radio.']
    });
    const app = appWithNarrative(new RescueNarrativeService({ generator: async () => hostile }));
    const res = await request(app).post('/api/rescue/explain').send({ kind: 'RADAR', request: {} });

    expect(res.status).toBe(200);
    expect(res.body.narrative.explanation).not.toContain('\u202E');
    expect(res.body.narrative.verification_suggestions.join(' ')).not.toContain('\u202E');
  });

  it('rejects an unknown narrative kind and a bad nested request', async () => {
    const app = appWithNarrative(new RescueNarrativeService({ generator: async () => VALID_EXPLANATION }));

    const badKind = await request(app).post('/api/rescue/explain').send({ kind: 'FORTUNE_TELLING' });
    expect(badKind.status).toBe(400);
    expect(badKind.body.error.code).toBe('VALIDATION_ERROR');

    const badNested = await request(app)
      .post('/api/rescue/explain')
      .send({ kind: 'PLAN', request: { strategy: 'FASTEST', scenario: { blocked_edge_keys: ['oops'] } } });
    expect(badNested.status).toBe(400);
    expect(badNested.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rate-limits the model-backed route independently of the global limiter', async () => {
    const app = appWithNarrative(
      new RescueNarrativeService({ generator: async () => VALID_EXPLANATION })
    );

    let lastStatus = 0;
    let lastBody: { error?: { code?: string } } = {};
    // The explain limiter allows 40 requests per window; the 41st must be refused.
    for (let i = 0; i < 41; i += 1) {
      const res = await request(app).post('/api/rescue/explain').send({ kind: 'RADAR', request: {} });
      lastStatus = res.status;
      lastBody = res.body;
    }

    expect(lastStatus).toBe(429);
    expect(lastBody.error?.code).toBe('NARRATIVE_RATE_LIMIT_EXCEEDED');
  });

  /* ---------------------------------------------------------------- */
  /* Human approval step                                               */
  /* ---------------------------------------------------------------- */

  it('records a coordinator decision in the audit log with a timestamp and note', async () => {
    const app = appWithNarrative();
    const res = await request(app).post('/api/rescue/decision').send({
      decision: 'APPROVED',
      strategy: 'COVERAGE_BALANCED',
      coordinator_note: 'Approved; the west bank gets a unit before any zone is doubled up.',
      plan_signature: 'unit-amb-1->inc-marketrow-square; unit-res-1->inc-oldmill',
      active_constraints: ['Target response time (SLA): 12 minutes.']
    });

    expect(res.status).toBe(201);
    expect(res.body.is_simulated).toBe(true);
    expect(res.body.decision).toBe('APPROVED');
    expect(res.body.coordinator_note).toContain('west bank');
    expect(Date.parse(res.body.recorded_at)).not.toBeNaN();

    const activity = await request(app).get('/api/activity');
    const entry = activity.body.entries.find(
      (candidate: { id: string }) => candidate.id === res.body.log_entry_id
    );
    expect(entry).toBeDefined();
    expect(entry.action_type).toBe('RESCUE_PLAN_APPROVED');
    expect(entry.summary).toContain('Coverage balanced');
    expect(entry.summary).toContain('west bank');
  });

  it('is idempotent: replaying the same decision never writes a second audit entry', async () => {
    const app = appWithNarrative();
    const body = {
      decision: 'REJECTED',
      strategy: 'FASTEST',
      coordinator_note: 'Rejected: the worst modelled response exceeds the target.',
      plan_signature: 'unit-amb-1->inc-northgate'
    };

    const before = await request(app).get('/api/activity');
    const first = await request(app).post('/api/rescue/decision').set('Idempotency-Key', 'decision-abc').send(body);
    const second = await request(app).post('/api/rescue/decision').set('Idempotency-Key', 'decision-abc').send(body);
    const after = await request(app).get('/api/activity');

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.replayed).toBe(true);
    expect(second.body.log_entry_id).toBe(first.body.log_entry_id);
    expect(after.body.entries.length).toBe(before.body.entries.length + 1);
  });

  it('requires a valid admin token for a decision once ADMIN_TOKEN is configured', async () => {
    const app = appWithNarrative();
    const body = {
      decision: 'MODIFIED',
      strategy: 'FASTEST',
      coordinator_note: 'Modified to serve the Critical call first.',
      plan_signature: 'unit-amb-1->inc-northgate'
    };

    try {
      config.adminToken = 'super-secret-admin-token';

      const denied = await request(app).post('/api/rescue/decision').send(body);
      expect(denied.status).toBe(401);
      expect(denied.body.error.code).toBe('ADMIN_UNAUTHORIZED');

      const allowed = await request(app)
        .post('/api/rescue/decision')
        .set('X-Admin-Token', 'super-secret-admin-token')
        .send(body);
      expect(allowed.status).toBe(201);
      expect(allowed.body.decision).toBe('MODIFIED');
    } finally {
      config.adminToken = null;
    }
  });

  it('sanitises a hostile coordinator note before it is stored in the audit log', async () => {
    const app = appWithNarrative();
    const res = await request(app).post('/api/rescue/decision').send({
      decision: 'APPROVED',
      strategy: 'FASTEST',
      coordinator_note: `Approved\u202E after checking\u0000 the road reports with the field lead.`,
      plan_signature: 'unit-amb-1->inc-marketrow-square'
    });

    expect(res.status).toBe(201);
    expect(res.body.coordinator_note).not.toContain('\u202E');
    expect(res.body.coordinator_note).not.toContain('\u0000');
  });

  it('rejects a decision with missing or too-short fields', async () => {
    const app = appWithNarrative();

    const shortNote = await request(app).post('/api/rescue/decision').send({
      decision: 'APPROVED',
      strategy: 'FASTEST',
      coordinator_note: 'ok',
      plan_signature: 'unit-amb-1->inc-marketrow-square'
    });
    expect(shortNote.status).toBe(400);
    expect(shortNote.body.error.code).toBe('VALIDATION_ERROR');

    const badDecision = await request(app).post('/api/rescue/decision').send({
      decision: 'MAYBE',
      strategy: 'FASTEST',
      coordinator_note: 'This note is long enough to pass the length rule.',
      plan_signature: 'unit-amb-1->inc-marketrow-square'
    });
    expect(badDecision.status).toBe(400);
  });
});
