import { describe, it, expect } from 'vitest';
import {
  ALLOCATION_PARAMETERS,
  ALL_STRATEGIES,
  computePlan,
  STRATEGY_LABELS
} from './allocation.js';
import { AllocationStrategy, SimulationDataset } from './rescue.js';
import { MILL_BRIDGE_EDGE_KEY, getSimulatedDataset } from './simulation.js';

function plan(strategy: AllocationStrategy, scenario = {}) {
  return computePlan(getSimulatedDataset(), strategy, scenario);
}

describe('computePlan — determinism and structure', () => {
  it.each(ALL_STRATEGIES)('is deterministic for %s', (strategy) => {
    expect(plan(strategy)).toEqual(plan(strategy));
  });

  it.each(ALL_STRATEGIES)('is labelled simulated and carries a human-readable label for %s', (strategy) => {
    const result = plan(strategy);
    expect(result.is_simulated).toBe(true);
    expect(result.strategy_label).toBe(STRATEGY_LABELS[strategy]);
  });

  it.each(ALL_STRATEGIES)('never duplicates a unit or an incident in %s', (strategy) => {
    const result = plan(strategy);
    const units = result.assignments.map((assignment) => assignment.unit_id);
    const incidents = result.assignments.map((assignment) => assignment.incident_id);
    expect(new Set(units).size).toBe(units.length);
    expect(new Set(incidents).size).toBe(incidents.length);
  });

  it.each(ALL_STRATEGIES)('accounts for every incident exactly once in %s', (strategy) => {
    const result = plan(strategy);
    const accounted = [...result.assignments.map((a) => a.incident_id), ...result.unassigned.map((u) => u.incident_id)];
    expect(new Set(accounted).size).toBe(5);
    expect(accounted.length).toBe(5);
  });

  it('explains every assignment with at least one reason', () => {
    for (const strategy of ALL_STRATEGIES) {
      for (const assignment of plan(strategy).assignments) {
        expect(assignment.reasons.length).toBeGreaterThan(0);
        expect(assignment.reasons.join(' ').length).toBeGreaterThan(10);
      }
    }
  });

  it('always states the target response time as an active constraint', () => {
    expect(plan('FASTEST').active_constraints[0]).toContain('12 minutes');
  });

  it('sorts assignments with the worst modelled response first', () => {
    const result = plan('FASTEST');
    const minutes = result.assignments.map((assignment) => assignment.travel_minutes ?? Number.POSITIVE_INFINITY);
    expect(minutes).toEqual([...minutes].sort((a, b) => b - a));
  });
});

describe('computePlan — measured trade-offs on the simulated flood', () => {
  it('fastest response: greedy nearest-pair wins on average but leaves a Critical call far out', () => {
    const result = plan('FASTEST');
    expect(result.assignments.length).toBe(5);
    expect(result.unassigned).toEqual([]);
    expect(result.metrics.avg_response_minutes).toBe(11.4);
    expect(result.metrics.worst_response_minutes).toBe(22);
    expect(result.metrics.coverage_pct).toBe(60);
    expect(result.metrics.utilization_pct).toBe(100);
    // The closest unit is spent on the easiest call, so one Critical call misses the target.
    expect(result.assignments.filter((assignment) => !assignment.within_sla).length).toBe(2);
    expect(
      result.assignments
        .filter((assignment) => assignment.severity === 'Critical' && !assignment.within_sla)
        .map((assignment) => assignment.incident_id)
    ).toEqual(['inc-northgate']);
  });

  it('severity first: reaches both Critical calls inside the target at the cost of the worst case', () => {
    const result = plan('SEVERITY_FIRST');
    expect(result.metrics.avg_response_minutes).toBe(11.4);
    expect(result.metrics.worst_response_minutes).toBe(26);
    expect(result.metrics.coverage_pct).toBe(80);
    // Both Critical incidents must be reached within the target response time.
    const critical = result.assignments.filter((assignment) => assignment.severity === 'Critical');
    expect(critical.length).toBe(2);
    expect(critical.every((assignment) => assignment.within_sla)).toBe(true);
  });

  it('coverage balanced: keeps the worst case lowest but loses target coverage', () => {
    const result = plan('COVERAGE_BALANCED');
    expect(result.metrics.worst_response_minutes).toBe(16);
    expect(result.metrics.coverage_pct).toBe(40);
    // Every zone holding an incident receives exactly one unit.
    const zonesServed = new Set(result.assignments.map((assignment) => assignment.zone_id));
    expect(zonesServed.size).toBe(4);
  });

  it('produces three genuinely different plans', () => {
    const signature = (strategy: AllocationStrategy) =>
      plan(strategy)
        .assignments.map((assignment) => `${assignment.unit_id}->${assignment.incident_id}`)
        .sort()
        .join(',');
    const signatures = new Set(ALL_STRATEGIES.map(signature));
    expect(signatures.size).toBe(3);
  });

  it('summarises who is disadvantaged in plain language', () => {
    for (const strategy of ALL_STRATEGIES) {
      const summary = plan(strategy).disadvantaged_summary;
      expect(summary.length).toBeGreaterThan(40);
      expect(summary).not.toMatch(/undefined|NaN/);
    }
    expect(plan('COVERAGE_BALANCED').disadvantaged_summary).toContain('isolated communities');
  });
});

describe('computePlan — scenario toggles', () => {
  it('removes an unavailable unit from the plan and reports the constraint', () => {
    const result = plan('FASTEST', { unavailable_unit_ids: ['amb-1'] });
    expect(result.assignments.some((assignment) => assignment.unit_id === 'amb-1')).toBe(false);
    expect(result.metrics.utilization_pct).toBe(100);
    expect(result.active_constraints.join(' ')).toContain('Ambulance A1');
  });

  it('leaves the two Critical calls unattended when the west-bank units are gone', () => {
    const result = plan('FASTEST', { unavailable_unit_ids: ['amb-1', 'rt-1'] });
    // Only three units remain for five calls, and the two Criticals are the ones
    // left out — scarcity, not unreachability, is the reason in this snapshot.
    expect(result.metrics.unattended_incidents).toBe(2);
    expect(result.unassigned.length).toBe(2);
    expect(result.unassigned.map((item) => item.incident_id)).toEqual(['inc-northgate', 'inc-riverside']);
    expect(result.unassigned.every((item) => item.reason.includes('committed to other incidents'))).toBe(true);
    expect(result.metrics.unattended_high_severity).toBe(2);
  });

  it('reports high-severity incidents that are left unattended', () => {
    const result = plan('FASTEST', { unavailable_unit_ids: ['amb-1', 'amb-2', 'amb-3'] });
    expect(result.metrics.unattended_incidents).toBe(3);
    expect(result.metrics.unattended_high_severity).toBeGreaterThan(0);
  });

  it('explains that nothing can be dispatched when no units are available', () => {
    const result = plan('FASTEST', { unavailable_unit_ids: ['amb-1', 'amb-2', 'amb-3', 'rt-1', 'rt-2'] });
    expect(result.assignments).toEqual([]);
    expect(result.metrics.utilization_pct).toBe(0);
    expect(result.active_constraints.join(' ')).toContain('No units are available');
    expect(result.unassigned.every((item) => item.reason.includes('No units are available'))).toBe(true);
  });

  it('strands the west bank when the Mill Bridge closes instead of silently ignoring it', () => {
    const open = plan('FASTEST');
    const closed = plan('FASTEST', { blocked_edge_keys: [MILL_BRIDGE_EDGE_KEY] });

    expect(closed.active_constraints.join(' ')).toContain('Mill Bridge');
    // Every call is served while the bridge is open…
    expect(open.metrics.unattended_incidents).toBe(0);
    // …and closing it makes a Critical call unreachable for the remaining units.
    expect(closed.metrics.unattended_incidents).toBe(1);
    expect(closed.unassigned[0].incident_id).toBe('inc-northgate');
    expect(closed.metrics.utilization_pct).toBeLessThan(open.metrics.utilization_pct);
  });

  it('accepts an injected critical incident and shows which call loses its unit', () => {
    const result = plan('FASTEST', {
      extra_incidents: [
        {
          id: 'inc-new-critical',
          zone_id: 'z-cedarhollow',
          node_id: 'cedarhollow',
          severity: 'Critical',
          title: 'New critical call',
          people_at_risk: 9,
          reported_at: '2026-09-12T06:50:00.000Z'
        }
      ]
    });
    expect(result.total_incidents).toBe(6);
    expect(result.metrics.unattended_incidents).toBe(1);
    // The injected call is picked up…
    expect(result.assignments.some((assignment) => assignment.incident_id === 'inc-new-critical')).toBe(true);
    // …and the cost is explicit: the existing Critical block is the one left uncovered.
    expect(result.unassigned[0].incident_id).toBe('inc-northgate');
    expect(result.unassigned[0].severity).toBe('Critical');
    expect(result.active_constraints.join(' ')).toContain('1 incident(s) injected');
  });

  it('adds modelled diversion time for ambulances only when the hospital is full', () => {
    const normal = plan('SEVERITY_FIRST');
    const diverted = plan('SEVERITY_FIRST', { hospital_at_capacity: true });

    const normalAmbulance = normal.assignments.find((assignment) => assignment.unit_type === 'AMBULANCE');
    const divertedAmbulance = diverted.assignments.find(
      (assignment) => assignment.unit_id === normalAmbulance?.unit_id
    );
    expect(divertedAmbulance?.travel_minutes).toBe(
      (normalAmbulance?.travel_minutes ?? 0) + ALLOCATION_PARAMETERS.hospitalDiversionMinutes
    );

    const normalTeam = normal.assignments.find((assignment) => assignment.unit_type === 'RESCUE_TEAM');
    const divertedTeam = diverted.assignments.find((assignment) => assignment.unit_id === normalTeam?.unit_id);
    expect(divertedTeam?.travel_minutes).toBe(normalTeam?.travel_minutes);

    expect(divertedAmbulance?.reasons.join(' ')).toContain('diversion');
    expect(diverted.active_constraints.join(' ')).toContain('hospital at capacity');
  });

  it('honours a forced assignment (coordinator override)', () => {
    const normal = plan('FASTEST');
    expect(normal.assignments.find((assignment) => assignment.unit_id === 'amb-3')?.incident_id).toBe(
      'inc-marketrow-square'
    );

    const forced = plan('FASTEST', { forced_assignment: { unit_id: 'amb-3', incident_id: 'inc-northgate' } });
    const pinned = forced.assignments.find((assignment) => assignment.unit_id === 'amb-3');
    expect(pinned?.incident_id).toBe('inc-northgate');
    expect(pinned?.reasons[0]).toContain('Forced assignment');
    expect(forced.active_constraints.join(' ')).toContain('Forced assignment');
  });
});

describe('computePlan — edge cases', () => {
  it('handles an empty zone/unit/incident world without dividing by zero', () => {
    const empty: SimulationDataset = { ...getSimulatedDataset(), zones: [], units: [], incidents: [], reports: [] };
    const result = computePlan(empty, 'FASTEST');
    expect(result.assignments).toEqual([]);
    expect(result.unassigned).toEqual([]);
    expect(result.metrics.avg_response_minutes).toBeNull();
    expect(result.metrics.worst_response_minutes).toBeNull();
    expect(result.metrics.coverage_pct).toBe(100);
    expect(result.metrics.utilization_pct).toBe(0);
    expect(result.metrics.hard_to_reach_served).toBe(0);
  });

  it('marks incidents in hard-to-reach zones correctly', () => {
    const result = plan('FASTEST');
    // Riverside Flats is classified hard to reach and is served by the greedy plan.
    expect(result.metrics.hard_to_reach_served).toBeGreaterThan(0);
  });

  it('never claims a route exists when the graph is disconnected', () => {
    const dataset = getSimulatedDataset();
    dataset.graph = {
      nodes: dataset.graph.nodes,
      edges: dataset.graph.edges.filter(
        (edge) => !(edge.from === 'riverside' || edge.to === 'riverside')
      )
    };
    const result = computePlan(dataset, 'FASTEST');
    const riversideIncident = result.unassigned.find((item) => item.incident_id === 'inc-riverside');
    expect(riversideIncident).toBeDefined();
    expect(riversideIncident?.reason).toContain('modelled route');
  });
});
