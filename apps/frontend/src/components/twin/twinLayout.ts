/**
 * Geometry and palette helpers shared by the 3D Disaster Twin scene and the
 * panels beside it.
 *
 * Keeping the projection in one place means the 3D scene, the schematic
 * fallback and the accessibility table all describe the same coordinates, so a
 * building can never appear in one place in the scene and another place in the
 * list next to it.
 *
 * ⚠️ SIMULATED: the plan coordinate space (0..100), the elevations and the
 * vertical exaggeration below are synthetic model inputs, not surveyed data.
 */

import type {
  Severity,
  TwinCity,
  TwinDroneMission,
  TwinExposure,
  TwinFloodAssessment,
  TwinRiskBand,
  TwinTone
} from '@resq-ai/shared';

/** Schematic 0..100 space → world units. The district spans 10 world units. */
export const PLAN_TO_WORLD = 0.1;

/**
 * Vertical exaggeration. A real 25 m tower over a 3.6 km district is invisible,
 * so metres are scaled up for display only. Every height shown to the user is
 * still quoted in real metres in the panels.
 */
export const METRE_TO_WORLD = 0.05;

/** Width/height of the modelled district in world units. */
export const WORLD_SPAN = 100 * PLAN_TO_WORLD;

/** Modelled cruise altitude of the virtual drone, in metres. */
export const DRONE_ALTITUDE_M = 55;

/** Schematic (x, y) → world (x, z). */
export function planToWorld(x: number, y: number): [number, number] {
  return [(x - 50) * PLAN_TO_WORLD, (y - 50) * PLAN_TO_WORLD];
}

/** Metres above the simulated datum → world Y. */
export function elevationToWorld(metres: number): number {
  return metres * METRE_TO_WORLD;
}

/** Building height (metres) → world Y. */
export function buildingHeightWorld(floors: number, floorHeightM: number): number {
  return floors * floorHeightM * METRE_TO_WORLD;
}

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

/** Plain hex per semantic tone. Tailwind CSS variables cannot reach WebGL. */
export const TONE_HEX: Record<TwinTone, string> = {
  neutral: '#64748B',
  accent: '#2563EB',
  critical: '#DC2626',
  warning: '#B45309',
  success: '#15803D',
  uncertain: '#7C3AED'
};

export const SEVERITY_HEX: Record<Severity, string> = {
  Critical: '#DC2626',
  High: '#D97706',
  Moderate: '#2563EB',
  Low: '#64748B'
};

/** Building fill per modelled exposure band. */
export const EXPOSURE_HEX: Record<TwinExposure, string> = {
  NONE: '#E2E8F0',
  LOW: '#BAE6FD',
  MODERATE: '#FDE68A',
  SEVERE: '#FCA5A5'
};

export const RISK_HEX: Record<TwinRiskBand, string> = {
  SAFE: '#E2E8F0',
  LOW: '#BAE6FD',
  MODERATE: '#FDE68A',
  HIGH: '#FDBA74',
  SEVERE: '#FCA5A5'
};

/** Tone per exposure band, so panels colour-code the same way the scene does. */
export const EXPOSURE_TONE: Record<TwinExposure, TwinTone> = {
  NONE: 'neutral',
  LOW: 'accent',
  MODERATE: 'warning',
  SEVERE: 'critical'
};

export const RISK_TONE: Record<TwinRiskBand, TwinTone> = {
  SAFE: 'success',
  LOW: 'accent',
  MODERATE: 'warning',
  HIGH: 'warning',
  SEVERE: 'critical'
};

export const SEVERITY_TONE: Record<Severity, TwinTone> = {
  Critical: 'critical',
  High: 'warning',
  Moderate: 'accent',
  Low: 'neutral'
};

/* ------------------------------------------------------------------ */
/* Scene geometry                                                      */
/* ------------------------------------------------------------------ */

/** World endpoints of a road segment, at its modelled deck elevation. */
export function roadWorldGeometry(
  city: TwinCity,
  from: string,
  to: string,
  deckElevationM: number
): { start: [number, number, number]; end: [number, number, number]; length: number } | null {
  const a = city.graph.nodes.find(node => node.id === from);
  const b = city.graph.nodes.find(node => node.id === to);
  if (!a || !b) return null;

  const [ax, az] = planToWorld(a.x, a.y);
  const [bx, bz] = planToWorld(b.x, b.y);
  const y = elevationToWorld(deckElevationM);
  const length = Math.hypot(bx - ax, bz - az);
  return { start: [ax, y, az], end: [bx, y, bz], length };
}

/** Ground elevation used to draw a node's pedestal. */
export function nodeElevationM(city: TwinCity, nodeId: string): number {
  return city.node_elevations_m[nodeId] ?? 4;
}

/** Ordered points the virtual drone flies: base, then each inspection stop. */
export function droneFlightPath(
  city: TwinCity,
  mission: TwinDroneMission
): Array<{ x: number; y: number }> {
  const baseNode = city.graph.nodes.find(node => node.id === mission.base_node);
  const base = baseNode ? { x: baseNode.x, y: baseNode.y } : { x: 50, y: 50 };
  return [base, ...mission.points.map(point => ({ x: point.x, y: point.y }))];
}

export interface DronePose {
  x: number;
  y: number;
  altitude_m: number;
}

/**
 * Interpolate the drone's position for a 0..1 mission progress. Constant-speed
 * along the planned legs, so the on-screen flight matches the reported path
 * length rather than racing through later legs.
 */
export function dronePoseAt(
  city: TwinCity,
  mission: TwinDroneMission,
  progress: number
): DronePose {
  const path = droneFlightPath(city, mission);
  if (path.length === 0) return { x: 50, y: 50, altitude_m: DRONE_ALTITUDE_M };
  if (path.length === 1) return { x: path[0].x, y: path[0].y, altitude_m: DRONE_ALTITUDE_M };

  const clamped = Math.min(1, Math.max(0, progress));
  const segments = path.length - 1;
  const scaled = clamped * segments;
  const index = Math.min(segments - 1, Math.floor(scaled));
  const t = scaled - index;
  const from = path[index];
  const to = path[index + 1];

  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    altitude_m: DRONE_ALTITUDE_M
  };
}

/**
 * Which inspection stops a mission has reached at a given progress. Used by the
 * coverage statistics so the numbers describe the flight actually flown.
 */
export function inspectedPointIds(
  city: TwinCity,
  mission: TwinDroneMission,
  progress: number
): Set<string> {
  const path = droneFlightPath(city, mission);
  const segments = Math.max(1, path.length - 1);
  const reached = Math.min(segments, Math.floor(Math.max(0, progress) * segments + 1e-9));
  return new Set(mission.points.slice(0, reached).map(point => point.id));
}

/** Aggregate flood figures for the scene's legend and the panel summaries. */
export function floodSummary(flood: TwinFloodAssessment) {
  return {
    exposed: flood.stats.buildings_exposed,
    total: flood.stats.buildings_total,
    occupants: flood.stats.exposed_occupants,
    roadsImpassable: flood.stats.roads_impassable,
    roadsTotal: flood.stats.roads_total
  };
}
