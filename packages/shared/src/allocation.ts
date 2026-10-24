/**
 * FairRescue / RescueBrain allocation engine (SIMULATED).
 *
 * DETERMINISM
 * -----------
 * Every strategy is a pure greedy algorithm over a fully ordered pair list.
 * Travel times come from the deterministic router in `geo.ts`. There is no
 * randomness and no clock, so identical inputs always produce identical plans,
 * including identical tie-breaks.
 *
 * SAFETY
 * ------
 * The engine only *proposes* a plan. Nothing here executes anything: every plan
 * is surfaced for human approval, and each assignment carries the reasons that
 * produced it so a coordinator can audit or override it.
 */

import {
  AllocationPlan,
  AllocationStrategy,
  Assignment,
  PlanMetrics,
  PlanScenario,
  SimIncident,
  SimUnit,
  SimulationDataset,
  UnassignedIncident
} from './rescue.js';
import { compareIds, shortestPaths } from './geo.js';
import { isHighSeverity, severityRank } from './severity.js';

export const STRATEGY_LABELS: Record<AllocationStrategy, string> = {
  FASTEST: 'Fastest response',
  SEVERITY_FIRST: 'Severity first',
  COVERAGE_BALANCED: 'Coverage balanced'
};

export const ALLOCATION_PARAMETERS = {
  /** Extra modelled handover time when the regional hospital is at capacity. */
  hospitalDiversionMinutes: 8,
  /** Zone thresholds below which an area is classified "hard to reach". */
  hardToReachConnectivityThreshold: 0.5,
  hardToReachRoadAccessThreshold: 0.5
} as const;

export const ALL_STRATEGIES: AllocationStrategy[] = ['FASTEST', 'SEVERITY_FIRST', 'COVERAGE_BALANCED'];

/* ------------------------------------------------------------------ */
/* Scenario resolution                                                 */
/* ------------------------------------------------------------------ */

interface ResolvedScenario {
  units: SimUnit[];
  availableUnits: SimUnit[];
  incidents: SimIncident[];
  blockedKeys: Set<string>;
  constraints: string[];
  hospitalAtCapacity: boolean;
  forced: { unit_id: string; incident_id: string } | null;
}

function resolveScenario(dataset: SimulationDataset, scenario: PlanScenario): ResolvedScenario {
  const unavailable = new Set(scenario.unavailable_unit_ids ?? []);
  const units = dataset.units.map((unit) =>
    unavailable.has(unit.id) ? { ...unit, status: 'UNAVAILABLE' as const } : unit
  );
  const availableUnits = units.filter((unit) => unit.status === 'AVAILABLE');

  const injected = scenario.extra_incidents ?? [];
  const incidents = [...dataset.incidents, ...injected];

  const blockedKeys = new Set(scenario.blocked_edge_keys ?? []);

  const constraints: string[] = [`Target response time (SLA): ${dataset.sla_minutes} minutes.`];

  if (unavailable.size > 0) {
    const labels = units.filter((unit) => unavailable.has(unit.id)).map((unit) => unit.label);
    constraints.push(`${labels.length} unit(s) marked unavailable: ${labels.join(', ')}.`);
  }
  if (blockedKeys.size > 0) {
    const labels = Array.from(blockedKeys).map((key) => {
      const [from, to] = key.split('|');
      const edge = dataset.graph.edges.find((candidate) => {
        const pair = [candidate.from, candidate.to].sort(compareIds).join('|');
        return pair === key;
      });
      if (edge?.label) return edge.label;
      const fromLabel = dataset.graph.nodes.find((node) => node.id === from)?.label ?? from;
      const toLabel = dataset.graph.nodes.find((node) => node.id === to)?.label ?? to;
      return `${fromLabel} ↔ ${toLabel}`;
    });
    constraints.push(`${blockedKeys.size} road segment(s) closed: ${labels.join(', ')}.`);
  }
  if (injected.length > 0) {
    constraints.push(`${injected.length} incident(s) injected by the scenario.`);
  }
  if (scenario.hospital_at_capacity) {
    constraints.push(
      `Regional hospital at capacity — patients must be diverted, adding ${ALLOCATION_PARAMETERS.hospitalDiversionMinutes} modelled minutes to every ambulance assignment.`
    );
  }
  if (scenario.forced_assignment) {
    const unitLabel = units.find((unit) => unit.id === scenario.forced_assignment?.unit_id)?.label ?? 'unit';
    const incidentTitle =
      incidents.find((incident) => incident.id === scenario.forced_assignment?.incident_id)?.title ?? 'incident';
    constraints.push(`Forced assignment: ${unitLabel} → ${incidentTitle}.`);
  }
  if (availableUnits.length === 0) {
    constraints.push('No units are available in this scenario — nothing can be dispatched.');
  }

  return {
    units,
    availableUnits,
    incidents,
    blockedKeys,
    constraints,
    hospitalAtCapacity: Boolean(scenario.hospital_at_capacity),
    forced: scenario.forced_assignment ?? null
  };
}

/* ------------------------------------------------------------------ */
/* Public entry point                                                  */
/* ------------------------------------------------------------------ */

export interface PlanDetail extends AllocationPlan {
  /** Ids of incidents that received no unit, in deterministic order. */
  total_incidents: number;
}

export function computePlan(
  dataset: SimulationDataset,
  strategy: AllocationStrategy,
  scenario: PlanScenario = {}
): PlanDetail {
  const resolved = resolveScenario(dataset, scenario);

  // One Dijkstra run per available unit; reused for every incident.
  const travelLookup = new Map<string, Map<string, number>>();
  for (const unit of resolved.availableUnits) {
    const estimates = shortestPaths(dataset.graph, unit.home_node, resolved.blockedKeys);
    const minutesByNode = new Map<string, number>();
    for (const [nodeId, estimate] of estimates) minutesByNode.set(nodeId, estimate.minutes);
    travelLookup.set(unit.id, minutesByNode);
  }

  const minutesFor = (unitId: string, nodeId: string): number | null => {
    const value = travelLookup.get(unitId)?.get(nodeId);
    return value === undefined ? null : value;
  };

  const remainingUnits = [...resolved.availableUnits].sort((a, b) => compareIds(a.id, b.id));
  const remainingIncidents = [...resolved.incidents].sort((a, b) => compareIds(a.id, b.id));

  const chosen: Array<{ unit: SimUnit; incident: SimIncident; baseMinutes: number | null; reason: string }> = [];

  /* --- Forced assignment first (CrisisReplay / coordinator override) --- */
  if (resolved.forced) {
    const unit = remainingUnits.find((candidate) => candidate.id === resolved.forced?.unit_id);
    const incident = remainingIncidents.find((candidate) => candidate.id === resolved.forced?.incident_id);
    if (unit && incident) {
      const baseMinutes = minutesFor(unit.id, incident.node_id);
      chosen.push({
        unit,
        incident,
        baseMinutes,
        reason:
          baseMinutes === null
            ? 'Forced assignment (coordinator override): pinned to this incident even though no road route currently exists.'
            : `Forced assignment (coordinator override): pinned to this incident regardless of the strategy rule (${baseMinutes} min modelled).`
      });
      removeById(remainingUnits, unit.id);
      removeById(remainingIncidents, incident.id);
    }
  }

  /* --- Strategy-specific greedy allocation ---------------------------- */
  switch (strategy) {
    case 'FASTEST':
      allocateFastest(remainingUnits, remainingIncidents, minutesFor, chosen);
      break;
    case 'SEVERITY_FIRST':
      allocateSeverityFirst(remainingUnits, remainingIncidents, minutesFor, chosen);
      break;
    case 'COVERAGE_BALANCED':
      allocateCoverageBalanced(dataset, remainingUnits, remainingIncidents, minutesFor, chosen);
      break;
    default:
      allocateFastest(remainingUnits, remainingIncidents, minutesFor, chosen);
      break;
  }

  /* --- Finalise assignments ------------------------------------------ */
  const assignments: Assignment[] = chosen.map(({ unit, incident, baseMinutes, reason }) => {
    const diversion =
      resolved.hospitalAtCapacity && unit.type === 'AMBULANCE'
        ? ALLOCATION_PARAMETERS.hospitalDiversionMinutes
        : 0;
    const travel = baseMinutes === null ? null : round1(baseMinutes + diversion);

    const reasons: string[] = [reason];
    if (diversion > 0) {
      reasons.push(
        `Hospital at capacity: +${diversion} min modelled diversion to an alternate facility.`
      );
    }
    if (travel !== null) {
      reasons.push(
        `${travel} min is ${travel <= dataset.sla_minutes ? 'within' : 'beyond'} the ${dataset.sla_minutes} min target response time.`
      );
    }

    return {
      unit_id: unit.id,
      unit_label: unit.label,
      unit_type: unit.type,
      incident_id: incident.id,
      incident_title: incident.title,
      severity: incident.severity,
      zone_id: incident.zone_id,
      travel_minutes: travel,
      within_sla: travel !== null && travel <= dataset.sla_minutes,
      reasons
    };
  });

  // Deterministic presentation order: worst response first, then by unit id.
  assignments.sort((a, b) => {
    const aMinutes = a.travel_minutes ?? Number.POSITIVE_INFINITY;
    const bMinutes = b.travel_minutes ?? Number.POSITIVE_INFINITY;
    if (aMinutes !== bMinutes) return bMinutes - aMinutes;
    return compareIds(a.unit_id, b.unit_id);
  });

  const unassigned: UnassignedIncident[] = remainingIncidents
    .map((incident) => ({
      incident_id: incident.id,
      incident_title: incident.title,
      severity: incident.severity,
      zone_id: incident.zone_id,
      reason: explainUnassigned(incident, resolved, minutesFor, strategy)
    }))
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || compareIds(a.incident_id, b.incident_id));

  const metrics = computeMetrics(dataset, resolved, assignments, unassigned);

  return {
    is_simulated: true,
    strategy,
    strategy_label: STRATEGY_LABELS[strategy],
    assignments,
    unassigned,
    metrics,
    active_constraints: resolved.constraints,
    disadvantaged_summary: buildDisadvantagedSummary(dataset, strategy, metrics, unassigned),
    total_incidents: resolved.incidents.length
  };
}

/* ------------------------------------------------------------------ */
/* Strategies                                                          */
/* ------------------------------------------------------------------ */

type Chosen = Array<{ unit: SimUnit; incident: SimIncident; baseMinutes: number | null; reason: string }>;
type MinutesFor = (unitId: string, nodeId: string) => number | null;

function allocateFastest(
  units: SimUnit[],
  incidents: SimIncident[],
  minutesFor: MinutesFor,
  chosen: Chosen
): void {
  const pairs: Array<{ unit: SimUnit; incident: SimIncident; minutes: number }> = [];
  for (const unit of units) {
    for (const incident of incidents) {
      const minutes = minutesFor(unit.id, incident.node_id);
      if (minutes === null) continue;
      pairs.push({ unit, incident, minutes });
    }
  }
  // Shortest travel first; ties resolved by unit id then incident id.
  pairs.sort(
    (a, b) =>
      a.minutes - b.minutes || compareIds(a.unit.id, b.unit.id) || compareIds(a.incident.id, b.incident.id)
  );

  for (const pair of pairs) {
    if (!contains(units, pair.unit.id) || !contains(incidents, pair.incident.id)) continue;
    chosen.push({
      unit: pair.unit,
      incident: pair.incident,
      baseMinutes: pair.minutes,
      reason: `Shortest modelled travel of all remaining unit/incident pairs (${round1(pair.minutes)} min).`
    });
    removeById(units, pair.unit.id);
    removeById(incidents, pair.incident.id);
  }
}

function allocateSeverityFirst(
  units: SimUnit[],
  incidents: SimIncident[],
  minutesFor: MinutesFor,
  chosen: Chosen
): void {
  const ordered = [...incidents].sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity) || compareIds(a.id, b.id)
  );

  for (const incident of ordered) {
    if (!contains(incidents, incident.id)) continue;
    const candidates = units
      .map((unit) => ({ unit, minutes: minutesFor(unit.id, incident.node_id) }))
      .filter((candidate): candidate is { unit: SimUnit; minutes: number } => candidate.minutes !== null)
      .sort((a, b) => a.minutes - b.minutes || compareIds(a.unit.id, b.unit.id));

    if (candidates.length === 0) continue;
    const best = candidates[0];
    chosen.push({
      unit: best.unit,
      incident,
      baseMinutes: best.minutes,
      reason: `${incident.severity} incident prioritised ahead of lower-severity calls; ${best.unit.label} is the nearest available unit (${round1(best.minutes)} min).`
    });
    removeById(units, best.unit.id);
    removeById(incidents, incident.id);
  }
}

function allocateCoverageBalanced(
  dataset: SimulationDataset,
  units: SimUnit[],
  incidents: SimIncident[],
  minutesFor: MinutesFor,
  chosen: Chosen
): void {
  /* Round 1 — every zone with an incident gets exactly one unit, hardest-to-
     reach zones first, so no community is left out by a purely greedy rule. */
  const zoneById = new Map(dataset.zones.map((zone) => [zone.id, zone]));
  const zonesWithIncidents = Array.from(new Set(incidents.map((incident) => incident.zone_id)));

  zonesWithIncidents.sort((a, b) => {
    const difficulty = (zoneId: string) => {
      const zone = zoneById.get(zoneId);
      if (!zone) return 0;
      return 1 - zone.connectivity + (1 - zone.road_access);
    };
    return difficulty(b) - difficulty(a) || compareIds(a, b);
  });

  for (const zoneId of zonesWithIncidents) {
    if (units.length === 0) break;
    const zone = zoneById.get(zoneId);
    const zoneIncidents = incidents
      .filter((incident) => incident.zone_id === zoneId)
      .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || compareIds(a.id, b.id));
    if (zoneIncidents.length === 0) continue;
    const target = zoneIncidents[0];

    const candidates = units
      .map((unit) => ({ unit, minutes: minutesFor(unit.id, target.node_id) }))
      .filter((candidate): candidate is { unit: SimUnit; minutes: number } => candidate.minutes !== null)
      .sort((a, b) => a.minutes - b.minutes || compareIds(a.unit.id, b.unit.id));
    if (candidates.length === 0) continue;

    const best = candidates[0];
    chosen.push({
      unit: best.unit,
      incident: target,
      baseMinutes: best.minutes,
      reason: `${zone?.name ?? zoneId} had no unit assigned yet; coverage rules commit one unit to each affected zone before any zone is doubled up. ${best.unit.label} is the nearest available unit (${round1(best.minutes)} min).`
    });
    removeById(units, best.unit.id);
    removeById(incidents, target.id);
  }

  /* Round 2 — remaining incidents by severity, nearest remaining unit. */
  const remaining = [...incidents].sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity) || compareIds(a.id, b.id)
  );
  for (const incident of remaining) {
    if (!contains(incidents, incident.id)) continue;
    const candidates = units
      .map((unit) => ({ unit, minutes: minutesFor(unit.id, incident.node_id) }))
      .filter((candidate): candidate is { unit: SimUnit; minutes: number } => candidate.minutes !== null)
      .sort((a, b) => a.minutes - b.minutes || compareIds(a.unit.id, b.unit.id));
    if (candidates.length === 0) continue;

    const best = candidates[0];
    chosen.push({
      unit: best.unit,
      incident,
      baseMinutes: best.minutes,
      reason: `Nearest remaining unit after every affected zone received at least one unit (${round1(best.minutes)} min).`
    });
    removeById(units, best.unit.id);
    removeById(incidents, incident.id);
  }
}

/* ------------------------------------------------------------------ */
/* Metrics and narrative                                               */
/* ------------------------------------------------------------------ */

function computeMetrics(
  dataset: SimulationDataset,
  resolved: ResolvedScenario,
  assignments: Assignment[],
  unassigned: UnassignedIncident[]
): PlanMetrics {
  const travel = assignments
    .map((assignment) => assignment.travel_minutes)
    .filter((value): value is number => value !== null);

  const avg = travel.length > 0 ? round1(travel.reduce((sum, value) => sum + value, 0) / travel.length) : null;
  const worst = travel.length > 0 ? round1(Math.max(...travel)) : null;

  const totalIncidents = resolved.incidents.length;
  const withinSla = assignments.filter((assignment) => assignment.within_sla).length;
  // Coverage = share of all emergencies reached inside the target response time.
  const coverage = totalIncidents === 0 ? 100 : round1((withinSla / totalIncidents) * 100);

  const hardToReachZoneIds = new Set(
    dataset.zones
      .filter(
        (zone) =>
          zone.connectivity < ALLOCATION_PARAMETERS.hardToReachConnectivityThreshold ||
          zone.road_access < ALLOCATION_PARAMETERS.hardToReachRoadAccessThreshold
      )
      .map((zone) => zone.id)
  );

  const hardToReachServed = assignments.filter((assignment) => hardToReachZoneIds.has(assignment.zone_id)).length;
  const hardToReachUnserved = unassigned.filter((incident) => hardToReachZoneIds.has(incident.zone_id)).length;

  return {
    avg_response_minutes: avg,
    worst_response_minutes: worst,
    coverage_pct: coverage,
    unattended_incidents: unassigned.length,
    unattended_high_severity: unassigned.filter((incident) => isHighSeverity(incident.severity)).length,
    utilization_pct:
      resolved.availableUnits.length === 0 ? 0 : round1((assignments.length / resolved.availableUnits.length) * 100),
    hard_to_reach_served: hardToReachServed,
    hard_to_reach_unserved: hardToReachUnserved
  };
}

function explainUnassigned(
  incident: SimIncident,
  resolved: ResolvedScenario,
  minutesFor: MinutesFor,
  strategy: AllocationStrategy
): string {
  if (resolved.availableUnits.length === 0) {
    return 'No units are available in this scenario, so nothing could be dispatched.';
  }
  const reachable = resolved.availableUnits.filter((unit) => minutesFor(unit.id, incident.node_id) !== null);
  if (reachable.length === 0) {
    return 'No available unit has a modelled route to this incident (road network closed or disconnected).';
  }
  return `All ${reachable.length} reachable unit(s) were committed to other incidents under the "${STRATEGY_LABELS[strategy]}" rule.`;
}

function buildDisadvantagedSummary(
  dataset: SimulationDataset,
  strategy: AllocationStrategy,
  metrics: PlanMetrics,
  unassigned: UnassignedIncident[]
): string {
  const zoneNames = new Map(dataset.zones.map((zone) => [zone.id, zone.name]));
  const sentences: string[] = [];

  const objective: Record<AllocationStrategy, string> = {
    FASTEST: 'This plan minimises average travel time, so the closest unit always goes to the nearest call.',
    SEVERITY_FIRST: 'This plan serves the most severe incidents first, so urgent casualties are reached before lower-severity calls.',
    COVERAGE_BALANCED: 'This plan gives every affected zone a unit before any zone receives a second one, which protects isolated communities.'
  };
  sentences.push(objective[strategy]);

  if (metrics.unattended_incidents === 0) {
    sentences.push('Every incident receives a unit.');
  } else {
    const names = Array.from(new Set(unassigned.map((incident) => zoneNames.get(incident.zone_id) ?? incident.zone_id)));
    sentences.push(
      `${metrics.unattended_incidents} incident(s) go unattended${
        metrics.unattended_high_severity > 0
          ? `, ${metrics.unattended_high_severity} of them Critical or High severity`
          : ''
      }. The residents of ${names.join(', ')} bear that risk.`
    );
  }

  if (metrics.hard_to_reach_unserved > 0) {
    sentences.push(
      `${metrics.hard_to_reach_unserved} incident(s) in hard-to-reach zones receive no unit, so the most isolated areas are disadvantaged.`
    );
  }
  if (metrics.worst_response_minutes !== null && metrics.worst_response_minutes > dataset.sla_minutes) {
    sentences.push(
      `Worst modelled response is ${metrics.worst_response_minutes} min, beyond the ${dataset.sla_minutes} min target.`
    );
  }
  if (metrics.avg_response_minutes !== null) {
    const unattendedPenalty =
      metrics.unattended_incidents > 0
        ? ' Note the average excludes incidents that received no unit, so it understates real-world disadvantage.'
        : '';
    sentences.push(`Average modelled response is ${metrics.avg_response_minutes} min.${unattendedPenalty}`);
  }

  return sentences.join(' ');
}

/* ------------------------------------------------------------------ */
/* Small deterministic helpers                                         */
/* ------------------------------------------------------------------ */

function removeById<T extends { id: string }>(list: T[], id: string): void {
  const index = list.findIndex((item) => item.id === id);
  if (index >= 0) list.splice(index, 1);
}

function contains<T extends { id: string }>(list: T[], id: string): boolean {
  return list.some((item) => item.id === id);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
