import { describe, it, expect } from 'vitest';
import { computeReplay } from './replay.js';
import { CRISIS_REPLAY_BANNER } from './rescue.js';
import { getSimulatedDataset, MILL_BRIDGE_EDGE_KEY } from './simulation.js';

const OVERRIDE = { unit_id: 'amb-3', incident_id: 'inc-northgate' };

describe('computeReplay', () => {
  it('always ships the mandatory hypothetical banner', () => {
    const result = computeReplay(getSimulatedDataset(), 'FASTEST', OVERRIDE);
    expect(result.banner).toBe(CRISIS_REPLAY_BANNER);
    expect(result.banner).toBe('Hypothetical, model-dependent, not verified.');
    expect(result.is_simulated).toBe(true);
  });

  it('is deterministic', () => {
    const first = computeReplay(getSimulatedDataset(), 'SEVERITY_FIRST', OVERRIDE);
    const second = computeReplay(getSimulatedDataset(), 'SEVERITY_FIRST', OVERRIDE);
    expect(first).toEqual(second);
  });

  it('keeps the baseline free of the forced assignment', () => {
    const result = computeReplay(getSimulatedDataset(), 'FASTEST', OVERRIDE);
    expect(result.baseline.assignments.some((assignment) => assignment.unit_id === 'amb-3' && assignment.incident_id === 'inc-northgate')).toBe(
      false
    );
    expect(
      result.hypothetical.assignments.some(
        (assignment) => assignment.unit_id === 'amb-3' && assignment.incident_id === 'inc-northgate'
      )
    ).toBe(true);
    expect(result.baseline.active_constraints.join(' ')).not.toContain('Forced assignment');
    expect(result.hypothetical.active_constraints.join(' ')).toContain('Forced assignment');
  });

  it('explains the override in plain language', () => {
    const result = computeReplay(getSimulatedDataset(), 'FASTEST', OVERRIDE);
    expect(result.override_summary).toContain('Ambulance A3');
    expect(result.override_summary).toContain('Apartment block flooding');
  });

  it('reports before/after values and a direction for every metric', () => {
    const result = computeReplay(getSimulatedDataset(), 'FASTEST', OVERRIDE);
    expect(result.deltas.length).toBeGreaterThanOrEqual(6);
    for (const delta of result.deltas) {
      expect(delta.metric.length).toBeGreaterThan(0);
      if (delta.baseline !== null && delta.hypothetical !== null) {
        expect(delta.delta).toBeCloseTo(delta.hypothetical - delta.baseline, 1);
        if (delta.delta === 0) expect(delta.better).toBeNull();
        else expect(typeof delta.better).toBe('boolean');
      }
    }
  });

  it('surfaces the trade-off of pinning a unit to the Critical call, including the cost', () => {
    const result = computeReplay(getSimulatedDataset(), 'FASTEST', OVERRIDE);
    // Northgate is reached much sooner, so target coverage improves…
    const coverage = result.deltas.find((delta) => delta.metric.startsWith('Coverage'));
    expect(coverage?.baseline).toBe(60);
    expect(coverage?.hypothetical).toBe(80);
    expect(coverage?.better).toBe(true);
    // …but the unit pulled off its old call leaves another incident worse off.
    const worst = result.deltas.find((delta) => delta.metric.startsWith('Worst response'));
    expect(worst?.baseline).toBe(22);
    expect(worst?.hypothetical).toBe(26);
    expect(worst?.better).toBe(false);
  });

  it('lists the assumptions behind the comparison and requires human approval', () => {
    const result = computeReplay(getSimulatedDataset(), 'FASTEST', OVERRIDE);
    expect(result.assumptions.length).toBeGreaterThanOrEqual(5);
    expect(result.assumptions.join(' ')).toContain('static road graph');
    expect(result.assumptions.join(' ')).toContain('human coordinator');
  });

  it('applies the same scenario toggles to both plans', () => {
    const result = computeReplay(getSimulatedDataset(), 'FASTEST', OVERRIDE, {
      scenario: { blocked_edge_keys: [MILL_BRIDGE_EDGE_KEY] }
    });
    expect(result.baseline.active_constraints.join(' ')).toContain('Mill Bridge');
    expect(result.hypothetical.active_constraints.join(' ')).toContain('Mill Bridge');
  });

  it('is a no-op comparison when the baseline already matches the override', () => {
    const baseline = computeReplay(getSimulatedDataset(), 'FASTEST', { unit_id: 'rt-1', incident_id: 'inc-northgate' });
    // rt-1 already serves Northgate under the fastest rule, so nothing should move.
    expect(baseline.deltas.every((delta) => delta.delta === null || delta.delta === 0)).toBe(true);
  });
});
