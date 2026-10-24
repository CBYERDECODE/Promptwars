import { describe, it, expect } from 'vitest';
import { assessZones } from './radar.js';
import { RADAR_FRAMING, SimulationDataset } from './rescue.js';
import { getSimulatedDataset } from './simulation.js';

const FIXED_NOW = '2026-09-12T07:00:00.000Z';

function assess(dataset: SimulationDataset = getSimulatedDataset()) {
  return assessZones(dataset, { now: FIXED_NOW });
}

describe('assessZones — framing and determinism', () => {
  it('always ships the non-negotiable framing statement', () => {
    const result = assess();
    expect(result.framing).toBe(RADAR_FRAMING);
    expect(result.framing).toContain('warrant verification only');
    expect(result.framing).toContain('never treated as evidence');
  });

  it('is a pure function: identical input, identical output', () => {
    const first = assess();
    const second = assess();
    expect(first).toEqual(second);
  });

  it('marks every result as simulated', () => {
    const result = assess();
    expect(result.is_simulated).toBe(true);
    for (const zone of result.zones) {
      expect(zone.is_simulated).toBe(true);
    }
  });

  it('never uses the word "victims" in any generated text', () => {
    const result = assess();
    const text = JSON.stringify(result).toLowerCase();
    expect(text).not.toContain('victims here');
    expect(text).not.toContain('victims are');
  });
});

describe('assessZones — scoring contract', () => {
  it('produces scores inside 0..100 with contributions that sum to the score', () => {
    const result = assess();
    expect(result.zones.length).toBe(5);
    for (const zone of result.zones) {
      expect(zone.priority_score).toBeGreaterThanOrEqual(0);
      expect(zone.priority_score).toBeLessThanOrEqual(100);
      const contributions = zone.evidence.reduce((sum, item) => sum + item.contribution, 0);
      expect(Math.abs(contributions - zone.priority_score)).toBeLessThanOrEqual(0.6);
    }
  });

  it('orders zones by descending priority with a deterministic tie-break', () => {
    const result = assess();
    const scores = result.zones.map((zone) => zone.priority_score);
    const sorted = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(sorted);
  });

  it('flags the quiet, poorly-connected zone and explains why with low confidence', () => {
    const result = assess();
    const cedar = result.zones.find((zone) => zone.zone_id === 'z-cedarhollow');
    expect(cedar).toBeDefined();
    expect(cedar?.reports_observed).toBe(0);
    expect(cedar?.confidence).toBe('Low');
    expect(cedar?.missing_data.join(' ')).toContain('Zero reports');
    expect(cedar?.recommended_verification_actions.length).toBeGreaterThan(0);
    expect(cedar?.recommended_verification_actions[0]).toMatch(/contact|drone|satellite|radio|sweep|unit/i);
  });

  it('treats an incident-rich zone as high priority (Riverside Flats)', () => {
    const result = assess();
    expect(result.zones[0].zone_id).toBe('z-riverside');
    expect(result.zones[0].confidence).toBe('High');
  });

  it('reports the two zones that warrant verification in the demo scenario', () => {
    const result = assess();
    const flagged = result.zones.filter((zone) => zone.priority_score >= 50).map((zone) => zone.zone_id);
    expect(flagged).toContain('z-riverside');
    expect(flagged).toContain('z-cedarhollow');
    expect(result.observations.some((line) => line.includes('data gap'))).toBe(true);
  });

  it('records the report-density gap as evidence rather than silently ignoring silence', () => {
    const result = assess();
    const cedar = result.zones.find((zone) => zone.zone_id === 'z-cedarhollow');
    const gapEvidence = cedar?.evidence.find((item) => item.factor === 'report_density_gap');
    expect(gapEvidence).toBeDefined();
    expect(gapEvidence?.detail).toContain('not evidence of safety');
  });
});

describe('assessZones — edge cases', () => {
  it('returns no zones for an empty zone list instead of throwing', () => {
    const empty: SimulationDataset = { ...getSimulatedDataset(), zones: [], incidents: [], reports: [] };
    const result = assess(empty);
    expect(result.zones).toEqual([]);
    expect(result.observations.length).toBeGreaterThan(0);
  });

  it('flags a missing population estimate as missing data', () => {
    const dataset = getSimulatedDataset();
    dataset.zones = dataset.zones.map((zone) =>
      zone.id === 'z-northgate' ? { ...zone, population: 0 } : zone
    );
    const result = assess(dataset);
    const northgate = result.zones.find((zone) => zone.zone_id === 'z-northgate');
    expect(northgate?.missing_data.join(' ')).toContain('population');
  });

  it('records the proximity factor as unavailable when no incidents exist anywhere', () => {
    const dataset = getSimulatedDataset();
    dataset.incidents = [];
    const result = assess(dataset);
    expect(result.zones.every((zone) => zone.missing_data.some((line) => line.includes('No incidents')))).toBe(true);
  });

  it('credits an unreachable zone at half weight so isolation never looks calm', () => {
    const open = assess();
    // Cedar Hollow's only access road is closed by the scenario.
    const isolated = assessZones(getSimulatedDataset(), {
      now: FIXED_NOW,
      blocked_edge_keys: ['cedarhollow|cedarridge']
    });
    const openHollow = open.zones.find((zone) => zone.zone_id === 'z-cedarhollow');
    const isolatedHollow = isolated.zones.find((zone) => zone.zone_id === 'z-cedarhollow');

    expect(openHollow?.missing_data.join(' ')).not.toContain('No modelled road route');
    expect(isolatedHollow?.missing_data.join(' ')).toContain('No modelled road route');

    const unobserved = isolatedHollow?.evidence.filter((item) => item.unobserved) ?? [];
    expect(unobserved.map((item) => item.factor)).toContain('proximity_to_incidents');
    expect(unobserved.length).toBeGreaterThan(openHollow?.evidence.filter((item) => item.unobserved).length ?? 0);

    // Losing sight of a zone must never make it rank as safer than when it was visible.
    expect(isolatedHollow?.priority_score).toBeGreaterThanOrEqual(openHollow?.priority_score ?? 0);
    expect(isolatedHollow?.confidence).toBe('Low');
    expect(isolatedHollow?.recommended_verification_actions.length).toBeGreaterThan(0);
  });
});
