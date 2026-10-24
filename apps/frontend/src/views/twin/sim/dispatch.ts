import { aStarRoute, formatMinutes, Route, travelTimesFrom } from './routing';
import type { SimState } from './scenario';
import type { Ambulance, TwinIncident } from './types';

/**
 * Simulated resource assignment and coverage analysis. Nothing here sends,
 * books or notifies a real unit: assignments exist only inside the twin.
 */

export type AssignmentStatus = 'assigned' | 'unreachable' | 'queued';

export interface Assignment {
  incident: TwinIncident;
  status: AssignmentStatus;
  ambulance?: Ambulance;
  route?: Route;
}

/** Greedy assignment: most severe (then earliest) incident takes the fastest free ambulance. */
export function assignResources(state: SimState): Assignment[] {
  const { city, roads } = state;
  const free = city.ambulances.filter(a => a.status === 'available');
  const order = [...state.activeIncidents].sort((a, b) => b.severity - a.severity || a.createdAtMin - b.createdAtMin);
  const result: Assignment[] = [];
  for (const incident of order) {
    if (free.length === 0) {
      result.push({ incident, status: 'queued' });
      continue;
    }
    const options = free
      .map(ambulance => ({ ambulance, route: aStarRoute(city, roads, ambulance.nodeId, incident.nodeId) }))
      .filter(o => o.route.found)
      .sort((a, b) => a.route.timeS - b.route.timeS);
    if (options.length === 0) {
      result.push({ incident, status: 'unreachable' });
      continue;
    }
    const pick = options[0];
    free.splice(free.indexOf(pick.ambulance), 1);
    result.push({ incident, status: 'assigned', ambulance: pick.ambulance, route: pick.route });
  }
  return result;
}

export interface DistrictCoverage {
  id: string;
  name: string;
  nodeCount: number;
  withinTargetPct: number;
  unreachableNodes: number;
  medianTimeS: number;
  limited: boolean;
}

/** Target response time used for coverage analysis (simulation parameter). */
export const COVERAGE_TARGET_S = 4 * 60;

const DISTRICTS = [
  { id: 'nw', name: 'North-West (Civic Centre)', test: (x: number, y: number) => y > 0 && x < -267 },
  { id: 'nc', name: 'North-Central (Downtown)', test: (x: number, y: number) => y > 0 && x >= -267 && x <= 267 },
  { id: 'ne', name: 'North-East (Hillcrest)', test: (x: number, y: number) => y > 0 && x > 267 },
  { id: 'sw', name: 'South-West (Lowtown)', test: (x: number, y: number) => y < 0 && x < -267 },
  { id: 'sc', name: 'South-Central (Canal)', test: (x: number, y: number) => y < 0 && x >= -267 && x <= 267 },
  { id: 'se', name: 'South-East (Foundry)', test: (x: number, y: number) => y < 0 && x > 267 }
];

export function districtOf(x: number, y: number): string {
  return DISTRICTS.find(d => d.test(x, y))?.name ?? 'Unknown';
}

export function analyseCoverage(state: SimState): DistrictCoverage[] {
  const { city, roads } = state;
  const best = new Map<string, number>();
  for (const ambulance of city.ambulances.filter(a => a.status === 'available')) {
    for (const [nodeId, t] of travelTimesFrom(city, roads, ambulance.nodeId)) {
      best.set(nodeId, Math.min(best.get(nodeId) ?? Infinity, t));
    }
  }
  return DISTRICTS.map(d => {
    const nodes = city.nodes.filter(n => d.test(n.x, n.y));
    const times = nodes.map(n => best.get(n.id) ?? Infinity);
    const reachable = times.filter(Number.isFinite).sort((a, b) => a - b);
    const within = times.filter(t => t <= COVERAGE_TARGET_S).length;
    const withinTargetPct = nodes.length ? (within / nodes.length) * 100 : 0;
    const unreachableNodes = times.length - reachable.length;
    return {
      id: d.id,
      name: d.name,
      nodeCount: nodes.length,
      withinTargetPct,
      unreachableNodes,
      medianTimeS: reachable.length ? reachable[Math.floor(reachable.length / 2)] : Infinity,
      limited: withinTargetPct < 50 || unreachableNodes > 0
    };
  });
}

/** Rule-based recommendations, each traceable to a computed fact. */
export function recommendations(state: SimState, assignments: Assignment[], coverage: DistrictCoverage[]): string[] {
  const recs: string[] = [];
  const team = state.city.rescueTeams.find(t => t.id === 'TEAM-BOAT-1');
  for (const a of assignments) {
    if (a.status === 'unreachable') {
      recs.push(`Incident ${a.incident.label} has no drivable route — task ${team?.name ?? 'a boat team'} (simulated) instead of an ambulance.`);
    } else if (a.status === 'queued') {
      recs.push(`Incident ${a.incident.label} is queued: all available ambulances are committed in the simulation.`);
    } else if (a.route && a.route.timeS > COVERAGE_TARGET_S * 1.5) {
      recs.push(`Incident ${a.incident.label}: best simulated ETA is ${formatMinutes(a.route.timeS)} (${a.ambulance?.id}) — consider staging a unit on that bank.`);
    }
  }
  const limited = coverage.filter(c => c.limited);
  if (limited.length > 0) {
    recs.push(`Limited simulated coverage in ${limited.map(c => c.name).join(', ')} — pre-position a unit or open a forward post.`);
  }
  const shelters = state.city.facilities.filter(f => f.kind === 'shelter');
  const dryShelters = shelters.filter(f => (state.flood.exposure.get(f.buildingId)?.depthM ?? 0) === 0);
  if (state.flood.occupantsExposed > 0 && dryShelters.length > 0) {
    recs.push(`Direct ~${state.flood.occupantsExposed} exposed occupants (synthetic estimate) to dry shelters: ${dryShelters.map(s => s.name).join(', ')}.`);
  }
  const wetShelters = shelters.filter(f => (state.flood.exposure.get(f.buildingId)?.depthM ?? 0) > 0);
  if (wetShelters.length > 0) recs.push(`Do not route evacuees to ${wetShelters.map(s => s.name).join(', ')} — flooded in this simulation.`);
  if (state.closedBridges.length > 0) {
    recs.push(`${state.closedBridges.map(b => b.name).join(', ')} closed — keep cross-river transfers on the remaining bridges.`);
  }
  if (recs.length === 0) recs.push('No action flagged by the simulation rules at this water level.');
  return recs;
}
