import type { SimState } from './scenario';
import type { City, Vec2 } from './types';

/**
 * Virtual drone reconnaissance planner. SIMULATION ONLY — the twin never
 * connects to, commands or claims to control a real aircraft.
 *
 * Inspection points are chosen greedily. At each step every remaining
 * candidate is scored:
 *
 *   score = 0.5 · severity/5 + 0.3 · newCoverage/maxNewCoverage − 0.2 · distance/maxDistance
 *
 * where newCoverage counts buildings inside the sensor footprint that no
 * earlier point already covers (flood-exposed buildings count double). A
 * candidate is skipped when flying to it and back home would exceed the
 * flight budget.
 */

export const DRONE_WEIGHTS = { severity: 0.5, coverage: 0.3, distance: 0.2 } as const;
export const DRONE_SENSOR_RADIUS_M = 90;
export const DRONE_ALTITUDE_M = 80;
export const DRONE_CRUISE_MPS = 15;

export type InspectionKind = 'incident' | 'bridge' | 'flood_cluster' | 'facility';

export interface InspectionCandidate {
  id: string;
  label: string;
  kind: InspectionKind;
  position: Vec2;
  severity: number;
}

export interface PlannedInspection extends InspectionCandidate {
  order: number;
  score: number;
  components: { severity: number; coverage: number; distance: number };
  newlyCoveredBuildings: number;
  /** Cumulative path distance (m) at which the drone reaches this point. */
  atDistanceM: number;
}

export interface DronePlan {
  home: Vec2;
  points: PlannedInspection[];
  path: Vec2[];
  totalDistanceM: number;
  /** Earliest path distance at which each building enters the sensor footprint. */
  buildingCoverageAtM: Map<string, number>;
  skipped: InspectionCandidate[];
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

export function inspectionCandidates(state: SimState): InspectionCandidate[] {
  const { city, flood, roads } = state;
  const candidates: InspectionCandidate[] = [];
  for (const incident of state.activeIncidents) {
    candidates.push({ id: `insp-${incident.id}`, label: `Incident ${incident.label}`, kind: 'incident', position: incident.position, severity: incident.severity });
  }
  for (const edge of city.edges.filter(e => e.bridge)) {
    const a = city.nodes.find(n => n.id === edge.from)!;
    const b = city.nodes.find(n => n.id === edge.to)!;
    const closed = roads.get(edge.id)?.status === 'closed';
    candidates.push({
      id: `insp-${edge.bridge!.id}`,
      label: edge.bridge!.name,
      kind: 'bridge',
      position: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      severity: closed ? 4 : 2
    });
  }
  for (const facility of city.facilities) {
    const exposure = flood.exposure.get(facility.buildingId);
    if (exposure && exposure.level !== 'none') {
      candidates.push({ id: `insp-${facility.id}`, label: facility.name, kind: 'facility', position: facility.position, severity: exposure.depthM > 0 ? 4 : 3 });
    }
  }
  // Group flooded buildings by city block and inspect each block's centroid.
  const clusters = new Map<string, { sum: Vec2; n: number; occupants: number }>();
  for (const b of city.buildings) {
    const e = flood.exposure.get(b.id);
    if (!e || e.depthM <= 0) continue;
    const key = `${Math.floor(b.centroid.x / 160)}:${Math.floor(b.centroid.y / 150)}`;
    const c = clusters.get(key) ?? { sum: { x: 0, y: 0 }, n: 0, occupants: 0 };
    c.sum.x += b.centroid.x;
    c.sum.y += b.centroid.y;
    c.n++;
    c.occupants += e.occupantsExposed;
    clusters.set(key, c);
  }
  let k = 1;
  for (const [key, c] of clusters) {
    candidates.push({
      id: `insp-cluster-${key}`,
      label: `Flooded block ${k++}`,
      kind: 'flood_cluster',
      position: { x: c.sum.x / c.n, y: c.sum.y / c.n },
      severity: Math.min(5, 1 + c.occupants / 120)
    });
  }
  return candidates;
}

function buildingsWithin(city: City, p: Vec2, radius: number): string[] {
  return city.buildings.filter(b => dist(b.centroid, p) <= radius).map(b => b.id);
}

export interface DronePlanOptions {
  maxPoints?: number;
  maxFlightM?: number;
  sensorRadiusM?: number;
}

export function planDroneMission(state: SimState, home: Vec2, options: DronePlanOptions = {}): DronePlan {
  const { city, flood } = state;
  const maxPoints = options.maxPoints ?? 8;
  const maxFlightM = options.maxFlightM ?? 6000;
  const radius = options.sensorRadiusM ?? DRONE_SENSOR_RADIUS_M;
  const remaining = inspectionCandidates(state);
  const covered = new Set<string>();
  const points: PlannedInspection[] = [];
  const skipped: InspectionCandidate[] = [];
  let current = home;
  let flown = 0;

  const coverageValue = (c: InspectionCandidate) => {
    let value = 0;
    let count = 0;
    for (const id of buildingsWithin(city, c.position, radius)) {
      if (covered.has(id)) continue;
      count++;
      value += (flood.exposure.get(id)?.depthM ?? 0) > 0 ? 2 : 1;
    }
    return { value, count };
  };

  while (remaining.length > 0 && points.length < maxPoints) {
    const scored = remaining.map(c => ({ c, d: dist(current, c.position), cov: coverageValue(c) }));
    const maxD = Math.max(1, ...scored.map(s => s.d));
    const maxCov = Math.max(1, ...scored.map(s => s.cov.value));
    let best: (typeof scored)[number] | null = null;
    let bestScore = -Infinity;
    let bestComponents = { severity: 0, coverage: 0, distance: 0 };
    for (const s of scored) {
      if (flown + s.d + dist(s.c.position, home) > maxFlightM) continue;
      const components = {
        severity: DRONE_WEIGHTS.severity * (s.c.severity / 5),
        coverage: DRONE_WEIGHTS.coverage * (s.cov.value / maxCov),
        distance: -DRONE_WEIGHTS.distance * (s.d / maxD)
      };
      const score = components.severity + components.coverage + components.distance;
      if (score > bestScore) {
        bestScore = score;
        best = s;
        bestComponents = components;
      }
    }
    if (!best) break;
    flown += best.d;
    for (const id of buildingsWithin(city, best.c.position, radius)) covered.add(id);
    points.push({
      ...best.c,
      order: points.length + 1,
      score: bestScore,
      components: bestComponents,
      newlyCoveredBuildings: best.cov.count,
      atDistanceM: flown
    });
    current = best.c.position;
    remaining.splice(remaining.indexOf(best.c), 1);
  }
  skipped.push(...remaining);

  const path = [home, ...points.map(p => p.position), home];
  let totalDistanceM = 0;
  for (let i = 1; i < path.length; i++) totalDistanceM += dist(path[i - 1], path[i]);

  // Sweep the sensor footprint along the path to find when each building is seen.
  const buildingCoverageAtM = new Map<string, number>();
  let travelled = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const len = dist(a, b);
    const steps = Math.max(1, Math.ceil(len / 20));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      const at = travelled + len * t;
      for (const building of city.buildings) {
        if (buildingCoverageAtM.has(building.id)) continue;
        if (dist(building.centroid, p) <= radius * 0.6) buildingCoverageAtM.set(building.id, at);
      }
    }
    travelled += len;
  }
  return { home, points, path, totalDistanceM, buildingCoverageAtM, skipped };
}

export interface DronePose {
  position: Vec2;
  headingRad: number;
  segment: number;
}

export function dronePoseAt(plan: DronePlan, distanceM: number): DronePose {
  let remaining = Math.max(0, Math.min(distanceM, plan.totalDistanceM));
  for (let i = 1; i < plan.path.length; i++) {
    const a = plan.path[i - 1];
    const b = plan.path[i];
    const len = dist(a, b);
    if (remaining <= len || i === plan.path.length - 1) {
      const t = len === 0 ? 0 : Math.min(1, remaining / len);
      return {
        position: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        headingRad: Math.atan2(b.y - a.y, b.x - a.x),
        segment: i - 1
      };
    }
    remaining -= len;
  }
  return { position: plan.home, headingRad: 0, segment: 0 };
}

export interface DroneStats {
  inspectedPoints: number;
  totalPoints: number;
  buildingsCovered: number;
  exposedCovered: number;
  exposedTotal: number;
  coveragePct: number;
  exposedCoveragePct: number;
  distanceFlownM: number;
  remainingM: number;
  etaRemainingS: number;
}

export function droneStats(plan: DronePlan, state: SimState, distanceM: number): DroneStats {
  const exposedIds = state.city.buildings.filter(b => (state.flood.exposure.get(b.id)?.depthM ?? 0) > 0).map(b => b.id);
  let covered = 0;
  for (const at of plan.buildingCoverageAtM.values()) if (at <= distanceM) covered++;
  const exposedCovered = exposedIds.filter(id => (plan.buildingCoverageAtM.get(id) ?? Infinity) <= distanceM).length;
  const flown = Math.min(distanceM, plan.totalDistanceM);
  return {
    inspectedPoints: plan.points.filter(p => p.atDistanceM <= distanceM).length,
    totalPoints: plan.points.length,
    buildingsCovered: covered,
    exposedCovered,
    exposedTotal: exposedIds.length,
    coveragePct: (covered / state.city.buildings.length) * 100,
    exposedCoveragePct: exposedIds.length ? (exposedCovered / exposedIds.length) * 100 : 100,
    distanceFlownM: flown,
    remainingM: plan.totalDistanceM - flown,
    etaRemainingS: (plan.totalDistanceM - flown) / DRONE_CRUISE_MPS
  };
}
