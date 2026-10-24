/**
 * Chain — relief supply distribution API tests (SIMULATED), Tier 3.
 *
 * Covers, per the project quality gate:
 *  - Zod validation of every new endpoint (invalid input -> 400),
 *  - admin authorization on the human-decision endpoint (401/201),
 *  - the SIMULATED labelling and the "human decides" framing,
 *  - determinism of the distribution proposal,
 *  - idempotent recording of human decisions.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { InMemoryIncidentRepository } from './repository/inMemoryRepository.js';
import { config } from './config.js';

const BRIDGE_KEY = 'junction|westdepot';

describe('Chain — relief supply distribution API (SIMULATED)', () => {
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

  const app = () => createApp(repo);

  it('publishes a SIMULATED distribution proposal that only a human can turn into action', async () => {
    const res = await request(app()).post('/api/chain/plan').send({});

    expect(res.status).toBe(200);
    expect(res.body.is_simulated).toBe(true);
    expect(res.body.label).toContain('SIMULATED');
    expect(res.body.notice).toContain('SIMULATED');
    expect(res.body.framing).toContain('approved by a human coordinator');

    const result = res.body.result;
    expect(result.is_simulated).toBe(true);
    // Five zones × four commodities of demand.
    expect(result.requirements).toHaveLength(20);
    // The fixture is deliberately under-stocked, so shortfalls must be surfaced.
    expect(result.unmet.length).toBeGreaterThan(0);
    expect(result.metrics.fulfilment_pct).toBeLessThan(100);
    // Silence is a data gap, stated out loud, never "safe".
    expect(result.disadvantaged_summary).toContain('Cedar Hollow');
    expect(result.disadvantaged_summary.toLowerCase()).toContain('data gap');
    for (const line of result.requirements) {
      expect(line.reasons.length).toBeGreaterThan(0);
    }
    for (const row of result.unmet) {
      expect(row.reason.length).toBeGreaterThan(0);
      expect(row.allocated + row.shortfall).toBe(row.required);
    }
  });

  it('is deterministic: identical inputs produce an identical plan', async () => {
    const first = await request(app()).post('/api/chain/plan').send({ scenario: { planning_horizon_days: 3 } });
    const second = await request(app()).post('/api/chain/plan').send({ scenario: { planning_horizon_days: 3 } });

    expect(first.status).toBe(200);
    expect(first.body.result).toEqual(second.body.result);
  });

  it('recomputes the plan when the Mill Bridge closes and names the closure', async () => {
    const open = await request(app()).post('/api/chain/plan').send({});
    const closed = await request(app())
      .post('/api/chain/plan')
      .send({ scenario: { blocked_edge_keys: [BRIDGE_KEY] } });

    expect(closed.status).toBe(200);
    expect(closed.body.result.active_constraints.join(' ')).toContain('Mill Bridge');

    const shippedToCedarHollow = (result: { shipments: Array<{ zone_id: string; quantity: number }> }) =>
      result.shipments
        .filter(shipment => shipment.zone_id === 'z-cedarhollow')
        .reduce((total, shipment) => total + shipment.quantity, 0);
    // With the bridge down, Cedar Hollow loses the East Depot stock that reached it.
    expect(shippedToCedarHollow(closed.body.result)).toBeLessThan(shippedToCedarHollow(open.body.result));
  });

  it('rejects invalid scenario input with a validation error', async () => {
    const badEdge = await request(app())
      .post('/api/chain/plan')
      .send({ scenario: { blocked_edge_keys: ['not an edge key'] } });
    expect(badEdge.status).toBe(400);
    expect(badEdge.body.error.code).toBe('VALIDATION_ERROR');

    const badHorizon = await request(app())
      .post('/api/chain/plan')
      .send({ scenario: { planning_horizon_days: 99 } });
    expect(badHorizon.status).toBe(400);
    expect(badHorizon.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('records a coordinator decision in the audit log with a timestamp and note', async () => {
    const server = app();
    const res = await request(server).post('/api/chain/decision').send({
      decision: 'APPROVED',
      coordinator_note: 'Approved; water reaches the west bank before any depot is doubled up.',
      plan_signature: 'dep-west->z-riverside|WATER; dep-hilltop->z-northgate|WATER',
      active_constraints: ['Planning horizon: 3 day(s) of relief per round.']
    });

    expect(res.status).toBe(201);
    expect(res.body.is_simulated).toBe(true);
    expect(res.body.decision).toBe('APPROVED');
    expect(res.body.coordinator_note).toContain('west bank');
    expect(Date.parse(res.body.recorded_at)).not.toBeNaN();

    const activity = await request(server).get('/api/activity');
    const entry = activity.body.entries.find(
      (candidate: { id: string }) => candidate.id === res.body.log_entry_id
    );
    expect(entry).toBeDefined();
    expect(entry.action_type).toBe('CHAIN_PLAN_APPROVED');
    expect(entry.summary).toContain('west bank');
  });

  it('is idempotent: replaying the same decision never writes a second audit entry', async () => {
    const server = app();
    const body = {
      decision: 'REJECTED',
      coordinator_note: 'Rejected: the data-gap zone would receive nothing at all.',
      plan_signature: 'dep-west->z-riverside|WATER'
    };

    const before = await request(server).get('/api/activity');
    const first = await request(server).post('/api/chain/decision').set('Idempotency-Key', 'chain-abc').send(body);
    const second = await request(server).post('/api/chain/decision').set('Idempotency-Key', 'chain-abc').send(body);
    const after = await request(server).get('/api/activity');

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.replayed).toBe(true);
    expect(second.body.log_entry_id).toBe(first.body.log_entry_id);
    expect(after.body.entries.length).toBe(before.body.entries.length + 1);
  });

  it('requires a valid admin token for a decision once ADMIN_TOKEN is configured', async () => {
    const server = app();
    const body = {
      decision: 'MODIFIED',
      coordinator_note: 'Modified to serve the critical zone before the others.',
      plan_signature: 'dep-hilltop->z-northgate|WATER'
    };

    try {
      config.adminToken = 'super-secret-admin-token';

      const denied = await request(server).post('/api/chain/decision').send(body);
      expect(denied.status).toBe(401);
      expect(denied.body.error.code).toBe('ADMIN_UNAUTHORIZED');

      const allowed = await request(server)
        .post('/api/chain/decision')
        .set('X-Admin-Token', 'super-secret-admin-token')
        .send(body);
      expect(allowed.status).toBe(201);
      expect(allowed.body.decision).toBe('MODIFIED');
    } finally {
      config.adminToken = null;
    }
  });

  it('sanitises a hostile coordinator note before it is stored in the audit log', async () => {
    const res = await request(app()).post('/api/chain/decision').send({
      decision: 'APPROVED',
      coordinator_note: `Approved\u202E after checking\u0000 the depot stock with the field lead.`,
      plan_signature: 'dep-hilltop->z-northgate|WATER'
    });

    expect(res.status).toBe(201);
    expect(res.body.coordinator_note).not.toContain('\u202E');
    expect(res.body.coordinator_note).not.toContain('\u0000');
  });

  it('rejects a decision with missing, too-short or unknown fields', async () => {
    const server = app();

    const shortNote = await request(server).post('/api/chain/decision').send({
      decision: 'APPROVED',
      coordinator_note: 'ok',
      plan_signature: 'dep-hilltop->z-northgate|WATER'
    });
    expect(shortNote.status).toBe(400);
    expect(shortNote.body.error.code).toBe('VALIDATION_ERROR');

    const badDecision = await request(server).post('/api/chain/decision').send({
      decision: 'MAYBE',
      coordinator_note: 'This note is long enough to pass the length rule.',
      plan_signature: 'dep-hilltop->z-northgate|WATER'
    });
    expect(badDecision.status).toBe(400);
  });
});
