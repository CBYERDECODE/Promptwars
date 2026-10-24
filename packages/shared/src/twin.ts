/**
 * ResQ AI — 3D Disaster Digital Twin engine (SIMULATED).
 *
 * ⚠️  EVERY VALUE IN THIS MODULE IS FICTIONAL.
 * The city block layout, terrain elevations, building heights, occupant counts,
 * flood depths and drone inspections below are synthetic. They exist only to
 * drive the interactive 3D exercise and must never be presented as a real-world
 * prediction. Every result type carries `is_simulated: true` for that reason.
 *
 * DETERMINISM
 * -----------
 * The whole module is a pure function of (dataset, water level, scenario). No
 * clock, no network, no `Math.random`. Procedural city generation uses a
 * fixed-seed mulberry32 stream, so the same build always produces the same city,
 * and every ordering uses the shared lexicographic `compareIds` tie-break.
 * Replaying a scenario therefore always yields byte-identical output.
 *
 * SAFETY
 * ------
 * Nothing in this module dispatches anything. A route, a drone inspection plan
 * or a timeline frame is a *proposal* rendered in the UI. Movement of a unit is
 * only ever recorded through the existing human-approval flow.
 */

import {
  GraphEdge,
  RoadGraph,
  Severity,
  SimIncident,
  SimReport,
  SimUnit,
  SimZone
} from './rescue.js';
import { compareIds, edgeKey, shortestPaths } from './geo.js';
import { getSimulatedDataset, MILL_BRIDGE_EDGE_KEY } from './simulation.js';
import { severityRank } from './severity.js';
import { AllocationPlan, PlanScenario } from './rescue.js';
import { computePlan } from './allocation.js';

/* ------------------------------------------------------------------ */
/* Labels and explicit model constants                                 */
/* ------------------------------------------------------------------ */

export const TWIN_LABEL = 'SIMULATED — Riverbend 3D disaster twin';

export const TWIN_NOTICE =
  'Every building, road, elevation, occupant count and flood depth in this 3D exercise is synthetic. ' +
  'It is a decision-support rehearsal, never a real-world prediction, and it dispatches nothing.';

/** Framing statement shipped with every flood assessment. */
export const TWIN_FLOOD_FRAMING =
  'Water depth is a modelled scenario input, not a forecast. Exposed buildings are a reason to verify, never a confirmed casualty count.';

/** Highest water level the slider exposes, in metres above the simulated datum. */
export const TWIN_MAX_WATER_LEVEL_M = 5;

/** Freeboard: the modelled depth a carriageway can carry before it is impassable. */
export const TWIN_ROAD_FREEBOARD_M = 0.25;

/** Plan-space scale. The 0..100 schematic grid models a 3.6 km square district. */
export const TWIN_PLAN_UNIT_METRES = 36;

/** Fixed seed for procedural city generation — changing it changes the whole city. */
export const TWIN_GENERATOR_SEED = 20260912;

/** Modelled inspection speed of the virtual drone, in metres per minute. */
export const TWIN_DRONE_SPEED_M_PER_MIN = 720;

/** Fixed weight set for the drone inspection priority score. Sums to 1. */
export const TWIN_DRONE_WEIGHTS = {
  severity: 0.5,
  proximity: 0.3,
  coverageGap: 0.2
} as const;

/** Maximum number of inspection stops a single drone mission will plan. */
export const TWIN_DRONE_MAX_STOPS = 8;

/**
 * Synthetic ground elevation per graph node, in metres above the simulated
 * datum. These are explicit fictional inputs (not derived), so the flood rule
 * is auditable: the west bank is low, Cedar Hollow and Hilltop sit high.
 */
export const TWIN_NODE_ELEVATIONS_M: Record<string, number> = {
  riverside: 1.6,
  oldmill: 2.0,
  hospital: 3.4,
  marketrow: 3.9,
  westdepot: 4.0,
  centraldepot: 4.2,
  junction: 4.8,
  cedarridge: 6.2,
  northgate: 6.8,
  hilltopdepot: 7.6,
  cedarhollow: 8.4
};

/**
 * Road segments whose deck height is fixed by the structure rather than by the
 * lower endpoint. Mill Bridge is the demo's single crossing to the west bank, so
 * it is modelled with its own deck elevation and closes mid-slider.
 */
export const TWIN_BRIDGE_DECK_ELEVATIONS_M: Record<string, number> = {
  [MILL_BRIDGE_EDGE_KEY]: 3.2
};

/* ------------------------------------------------------------------ */
/* Domain types                                                        */
/* ------------------------------------------------------------------ */

export type BuildingCategory =
  | 'RESIDENTIAL'
  | 'COMMERCIAL'
  | 'HOSPITAL'
  | 'SHELTER'
  | 'FIRE_STATION'
  | 'SCHOOL'
  | 'INDUSTRIAL';

export interface TwinBuilding {
  id: string;
  label: string;
  zone_id: string;
  node_id: string;
  /** Footprint centre, in the shared 0..100 schematic space. */
  x: number;
  y: number;
  /** Footprint size in schematic units. */
  width: number;
  depth: number;
  floors: number;
  /** Modelled floor-to-floor height, in metres. */
  floor_height_m: number;
  /** Simulated occupant count for the whole building. */
  occupants: number;
  /** Modelled ground elevation above the simulated datum, in metres. */
  ground_elevation_m: number;
  category: BuildingCategory;
}

export interface TwinCity {
  is_simulated: true;
  label: string;
  city: string;
  notice: string;
  /** Target response time carried over from the simulated dataset, in minutes. */
  sla_minutes: number;
  floor: { plan_unit_metres: number };
  buildings: TwinBuilding[];
  node_elevations_m: Record<string, number>;
  graph: RoadGraph;
  zones: SimZone[];
  units: SimUnit[];
  incidents: SimIncident[];
  reports: SimReport[];
}

export type TwinExposure = 'NONE' | 'LOW' | 'MODERATE' | 'SEVERE';

export type TwinTone = 'neutral' | 'accent' | 'critical' | 'warning' | 'success' | 'uncertain';

export interface TwinFloodBuilding {
  building_id: string;
  /** Modelled water depth above the ground floor, in metres (0 when dry). */
  water_depth_m: number;
  /** Number of floors with water at or above their floor level. */
  flooded_floors: number;
  /** 0..1 share of the building's occupants on flooded floors. */
  exposure_ratio: number;
  exposed_occupants: number;
  exposure: TwinExposure;
  reason: string;
}

export interface TwinFloodRoad {
  edge_key: string;
  from: string;
  to: string;
  label: string;
  /** Modelled water depth over the carriageway, in metres. */
  water_depth_m: number;
  accessible: boolean;
  reason: string;
}

export interface TwinFloodAssessment {
  is_simulated: true;
  water_level_m: number;
  framing: string;
  buildings: TwinFloodBuilding[];
  roads: TwinFloodRoad[];
  /** Undirected edge keys that cannot be driven in this scenario. */
  blocked_edge_keys: string[];
  stats: {
    buildings_total: number;
    buildings_exposed: number;
    buildings_severely_exposed: number;
    exposed_occupants: number;
    roads_total: number;
    roads_impassable: number;
  };
}

export interface TwinRouteChange {
  label: string;
  detail: string;
  tone: TwinTone;
}

export interface TwinRoute {
  /** Stable signature of (unit, incident, blocked set) for audit and keys. */
  signature: string;
  unit_id: string;
  unit_label: string;
  incident_id: string;
  incident_title: string;
  severity: Severity;
  from_node: string;
  to_node: string;
  /** Modelled travel time in minutes, or null when no road route exists. */
  minutes: number | null;
  path: string[];
  /** Polyline through the road nodes, in schematic space. */
  geometry: Array<{ x: number; y: number }>;
  reachable: boolean;
  within_sla: boolean;
  blocked_edge_keys: string[];
  reasons: string[];
}

export interface TwinRouteComparison {
  is_simulated: true;
  baseline: TwinRoute;
  updated: TwinRoute;
  delta_minutes: number | null;
  /** true = the updated route is worse; null = unchanged or not comparable. */
  degraded: boolean | null;
  summary: string;
  changes: TwinRouteChange[];
}

export interface TwinDronePoint {
  id: string;
  building_id: string | null;
  incident_id: string | null;
  label: string;
  x: number;
  y: number;
  /** 0..100 inspection priority. */
  priority: number;
  severity: Severity | null;
  distance_from_base_m: number;
  reasons: string[];
}

export interface TwinDroneMission {
  is_simulated: true;
  base_node: string;
  points: TwinDronePoint[];
  total_points: number;
  path_length_m: number;
  estimated_minutes: number;
  coverage: {
    buildings_total: number;
    buildings_inspected: number;
    coverage_pct: number;
    incidents_total: number;
    incidents_covered: number;
  };
  parameters: Record<string, number>;
}

export type TwinRiskBand = 'SAFE' | 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE';

export interface TwinFloorRisk {
  /** 1-based floor number. */
  floor: number;
  risk: TwinRiskBand;
  /** Modelled water depth at this floor's level, in metres (0 when dry). */
  water_depth_m: number;
  reason: string;
}

export interface TwinNearbyResource {
  kind: 'HOSPITAL' | 'SHELTER' | 'FIRE_STATION' | 'UNIT';
  label: string;
  distance_units: number;
  distance_m: number;
  detail: string;
}

export interface TwinBuildingIntelligence {
  is_simulated: true;
  building: TwinBuilding;
  zone_name: string;
  floods: TwinFloodBuilding;
  floors: TwinFloorRisk[];
  reports: SimReport[];
  incidents: SimIncident[];
  rescue_status: {
    assigned_unit_id: string | null;
    assigned_unit_label: string | null;
    status: string;
    detail: string;
  };
  nearby_resources: TwinNearbyResource[];
}

export type TwinEventKind =
  | 'INCIDENT'
  | 'FLOOD'
  | 'ROAD_CLOSURE'
  | 'ASSIGNMENT'
  | 'ROUTE_CHANGE'
  | 'RECOMMENDATION';

export interface TwinTimelineEvent {
  id: string;
  kind: TwinEventKind;
  offset_minutes: number;
  title: string;
  detail: string;
  tone: TwinTone;
}

export interface TwinTimelineSnapshot {
  buildings_exposed: number;
  exposed_occupants: number;
  roads_impassable: number;
  assigned: number;
  unreachable_incidents: number;
  avg_response_minutes: number | null;
}

export interface TwinTimelineFrame {
  id: string;
  index: number;
  offset_minutes: number;
  label: string;
  water_level_m: number;
  blocked_edge_keys: string[];
  events: TwinTimelineEvent[];
  snapshot: TwinTimelineSnapshot;
}

export interface TwinTimeline {
  is_simulated: true;
  duration_minutes: number;
  frames: TwinTimelineFrame[];
}

export interface TwinCopilotFact {
  label: string;
  value: string;
}

export interface TwinCopilotAnswer {
  is_simulated: true;
  question: string;
  intent: string;
  answer: string;
  facts: TwinCopilotFact[];
  /** Deterministic engines that produced the answer. */
  citations: string[];
  suggestions: string[];
}

export interface TwinCopilotContext {
  city: TwinCity;
  flood: TwinFloodAssessment;
  timeline: TwinTimeline;
  routes: TwinRoute[];
  mission: TwinDroneMission;
  selectedBuildingId: string | null;
  baselineRoute: TwinRoute | null;
  updatedRoute: TwinRoute | null;
}

/* ------------------------------------------------------------------ */
/* Procedural city generation (fixed seed, fully reproducible)         */
/* ------------------------------------------------------------------ */

/** mulberry32 — tiny, fast, and identical for a given seed on every machine. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Modelled occupants per floor, by building category. */
const OCCUPANCY_PER_FLOOR: Record<BuildingCategory, number> = {
  RESIDENTIAL: 14,
  COMMERCIAL: 26,
  HOSPITAL: 40,
  SHELTER: 30,
  FIRE_STATION: 12,
  SCHOOL: 45,
  INDUSTRIAL: 18
};

const FLOOR_HEIGHT_BY_CATEGORY: Record<BuildingCategory, number> = {
  RESIDENTIAL: 3.2,
  COMMERCIAL: 4.0,
  HOSPITAL: 3.6,
  SHELTER: 3.4,
  FIRE_STATION: 4.2,
  SCHOOL: 3.6,
  INDUSTRIAL: 5.0
};

/**
 * Explicit mapping from every graph node to the neighbourhood it belongs to.
 * Nodes that are not a zone centroid (depots, the hospital, junctions) still
 * belong to exactly one zone so every building can be attributed.
 */
const NODE_ZONE: Record<string, string> = {
  riverside: 'z-riverside',
  westdepot: 'z-riverside',
  oldmill: 'z-oldmill',
  hospital: 'z-oldmill',
  marketrow: 'z-marketrow',
  centraldepot: 'z-marketrow',
  junction: 'z-marketrow',
  northgate: 'z-northgate',
  hilltopdepot: 'z-northgate',
  cedarridge: 'z-cedarhollow',
  cedarhollow: 'z-cedarhollow'
};

/** Explicit per-node building counts, so the skyline is reviewable, not random. */
const NODE_BUILDING_COUNTS: Record<string, { residential: number; commercial: number }> = {
  riverside: { residential: 6, commercial: 1 },
  oldmill: { residential: 5, commercial: 2 },
  hospital: { residential: 1, commercial: 1 },
  centraldepot: { residential: 3, commercial: 2 },
  marketrow: { residential: 5, commercial: 4 },
  northgate: { residential: 7, commercial: 3 },
  hilltopdepot: { residential: 4, commercial: 1 },
  junction: { residential: 4, commercial: 3 },
  cedarridge: { residential: 3, commercial: 0 },
  cedarhollow: { residential: 3, commercial: 1 },
  westdepot: { residential: 3, commercial: 1 }
};

/** Landmark buildings placed at fixed nodes so the 3D scene has anchors. */
const LANDMARKS: Array<{
  node_id: string;
  category: BuildingCategory;
  label: string;
  floors: number;
}> = [
  { node_id: 'hospital', category: 'HOSPITAL', label: 'South General Hospital', floors: 6 },
  { node_id: 'centraldepot', category: 'FIRE_STATION', label: 'Central Fire Station', floors: 2 },
  { node_id: 'northgate', category: 'SHELTER', label: 'Northgate Community Shelter', floors: 2 },
  { node_id: 'marketrow', category: 'SHELTER', label: 'Market Row Sports Hall Shelter', floors: 2 },
  { node_id: 'hilltopdepot', category: 'SHELTER', label: 'Hilltop Evacuation Centre', floors: 2 },
  { node_id: 'junction', category: 'SCHOOL', label: 'Midtown Junction Primary School', floors: 3 },
  { node_id: 'oldmill', category: 'INDUSTRIAL', label: 'Old Mill Works', floors: 3 }
];

function buildLandmark(
  node: { id: string; x: number; y: number },
  landmark: (typeof LANDMARKS)[number],
  index: number
): TwinBuilding {
  const zoneId = NODE_ZONE[node.id] ?? 'z-marketrow';
  const floorHeight = FLOOR_HEIGHT_BY_CATEGORY[landmark.category];
  return {
    id: `bld-${node.id}-landmark-${index}`,
    label: landmark.label,
    zone_id: zoneId,
    node_id: node.id,
    x: round2(clamp(node.x + (index % 2 === 0 ? -3.4 : 3.4), 3, 97)),
    y: round2(clamp(node.y + 3.1, 3, 97)),
    width: 4.6,
    depth: 4.2,
    floors: landmark.floors,
    floor_height_m: floorHeight,
    occupants: landmark.floors * OCCUPANCY_PER_FLOOR[landmark.category],
    ground_elevation_m: TWIN_NODE_ELEVATIONS_M[node.id] ?? 4,
    category: landmark.category
  };
}

/**
 * Build the synthetic 3D city. Deterministic: a fixed seed, an explicit node →
 * zone map and explicit per-node building counts mean the same blocks are laid
 * out in the same place on every run.
 */
export function generateTwinCity(): TwinCity {
  const dataset = getSimulatedDataset();
  const random = createRandom(TWIN_GENERATOR_SEED);
  const nodeById = new Map(dataset.graph.nodes.map(node => [node.id, node]));
  const buildings: TwinBuilding[] = [];

  // Landmarks first so they always occupy the same, reviewable positions.
  for (const landmark of LANDMARKS) {
    const node = nodeById.get(landmark.node_id);
    if (!node) continue;
    buildings.push(buildLandmark(node, landmark, LANDMARKS.indexOf(landmark)));
  }

  // Procedural infill: a deterministic ring of blocks around each road node.
  for (const node of dataset.graph.nodes) {
    const counts = NODE_BUILDING_COUNTS[node.id] ?? { residential: 0, commercial: 0 };
    const elevation = TWIN_NODE_ELEVATIONS_M[node.id] ?? 4;
    const zoneId = NODE_ZONE[node.id] ?? 'z-marketrow';

    const plan: Array<{ category: BuildingCategory; count: number }> = [
      { category: 'RESIDENTIAL', count: counts.residential },
      { category: 'COMMERCIAL', count: counts.commercial }
    ];

    for (const group of plan) {
      for (let index = 0; index < group.count; index += 1) {
        const total = Math.max(1, group.count);
        // Spread blocks evenly around the node, then jitter deterministically.
        const angle = (index / total) * Math.PI * 2 + (group.category === 'COMMERCIAL' ? 0.7 : 0);
        const radius = 4 + (index % 3) * 3.2 + random() * 1.8;
        const x = clamp(node.x + Math.cos(angle) * radius, 3, 97);
        const y = clamp(node.y + Math.sin(angle) * radius, 3, 97);
        const floors =
          group.category === 'RESIDENTIAL'
            ? 2 + Math.floor(random() * 7) // 2..8
            : 1 + Math.floor(random() * 4); // 1..4
        const floorHeight = FLOOR_HEIGHT_BY_CATEGORY[group.category];
        const width = round2(2.2 + random() * 1.8);
        const depth = round2(2.2 + random() * 1.8);
        const id = `bld-${node.id}-${group.category === 'RESIDENTIAL' ? 'r' : 'c'}${index}`;

        buildings.push({
          id,
          label:
            group.category === 'RESIDENTIAL'
              ? `${node.label} residential block ${index + 1}`
              : `${node.label} commercial unit ${index + 1}`,
          zone_id: zoneId,
          node_id: node.id,
          x: round2(x),
          y: round2(y),
          width,
          depth,
          floors,
          floor_height_m: floorHeight,
          occupants: floors * OCCUPANCY_PER_FLOOR[group.category],
          ground_elevation_m: round2(elevation + random() * 0.6),
          category: group.category
        });
      }
    }
  }

  // Stable, reviewable ordering: by node, then by id.
  buildings.sort((a, b) => compareIds(a.node_id, b.node_id) || compareIds(a.id, b.id));

  return {
    is_simulated: true,
    label: TWIN_LABEL,
    city: dataset.city,
    notice: TWIN_NOTICE,
    sla_minutes: dataset.sla_minutes,
    floor: { plan_unit_metres: TWIN_PLAN_UNIT_METRES },
    buildings,
    node_elevations_m: { ...TWIN_NODE_ELEVATIONS_M },
    graph: JSON.parse(JSON.stringify(dataset.graph)) as RoadGraph,
    zones: JSON.parse(JSON.stringify(dataset.zones)) as SimZone[],
    units: JSON.parse(JSON.stringify(dataset.units)) as SimUnit[],
    incidents: JSON.parse(JSON.stringify(dataset.incidents)) as SimIncident[],
    reports: JSON.parse(JSON.stringify(dataset.reports)) as SimReport[]
  };
}

/* ------------------------------------------------------------------ */
/* Feature 1 — Dynamic flood simulation                                */
/* ------------------------------------------------------------------ */

function exposureBand(ratio: number): TwinExposure {
  if (ratio <= 0) return 'NONE';
  if (ratio <= 0.25) return 'LOW';
  if (ratio <= 0.6) return 'MODERATE';
  return 'SEVERE';
}

/** Modelled deck elevation a road segment sits at, in metres. */
export function twinRoadElevationM(city: TwinCity, edge: GraphEdge): number {
  const override = TWIN_BRIDGE_DECK_ELEVATIONS_M[edgeKey(edge.from, edge.to)];
  if (override !== undefined) return override;
  const from = city.node_elevations_m[edge.from] ?? 4;
  const to = city.node_elevations_m[edge.to] ?? 4;
  return Math.min(from, to);
}

/**
 * Assess the simulated flood at a given water level.
 *
 * EXPLICIT RULES (both are the whole model, and both are stated in the UI):
 *  - A building's ground floor floods once the water reaches its ground
 *    elevation. `flooded_floors = ceil(depth / floor_height)`, capped at the
 *    building's height, and exposed occupants are those on flooded floors.
 *  - A road segment is impassable once the water is more than
 *    `TWIN_ROAD_FREEBOARD_M` above its deck elevation (see `twinRoadElevationM`).
 */
export function assessTwinFlood(
  city: TwinCity,
  waterLevelM: number,
  extraBlocked: readonly string[] = []
): TwinFloodAssessment {
  const water = clamp(waterLevelM, 0, TWIN_MAX_WATER_LEVEL_M);

  const buildings: TwinFloodBuilding[] = city.buildings.map(building => {
    const depth = round2(Math.max(0, water - building.ground_elevation_m));
    const floodedFloors = Math.min(
      building.floors,
      depth <= 0 ? 0 : Math.ceil(depth / building.floor_height_m)
    );
    const ratio = building.floors === 0 ? 0 : round2(floodedFloors / building.floors);
    const exposedOccupants = Math.round(building.occupants * (floodedFloors / building.floors));
    const exposure = exposureBand(ratio);

    return {
      building_id: building.id,
      water_depth_m: depth,
      flooded_floors: floodedFloors,
      exposure_ratio: ratio,
      exposed_occupants: exposedOccupants,
      exposure,
      reason:
        depth <= 0
          ? `Ground floor sits ${round2(building.ground_elevation_m - water)} m above the modelled water level.`
          : `${depth} m over the ground floor floods ${floodedFloors} of ${building.floors} floors (${Math.round(
              ratio * 100
            )}% of the modelled occupants).`
    };
  });

  const extra = new Set(extraBlocked);
  const roads: TwinFloodRoad[] = city.graph.edges.map(edge => {
    const key = edgeKey(edge.from, edge.to);
    const deck = twinRoadElevationM(city, edge);
    const depth = round2(Math.max(0, water - deck));
    const flooded = depth > TWIN_ROAD_FREEBOARD_M;
    const structurallyClosed = Boolean(edge.blocked);
    const closedExternally = extra.has(key);
    const accessible = !flooded && !structurallyClosed && !closedExternally;

    const label =
      edge.label ??
      `${city.graph.nodes.find(node => node.id === edge.from)?.label ?? edge.from} ↔ ${
        city.graph.nodes.find(node => node.id === edge.to)?.label ?? edge.to
      }`;

    let reason: string;
    if (structurallyClosed) reason = 'Segment is structurally closed in the simulated network.';
    else if (closedExternally) reason = 'Closed by the current scenario toggle.';
    else if (flooded) reason = `${depth} m over a deck at ${round2(deck)} m exceeds the ${TWIN_ROAD_FREEBOARD_M} m freeboard.`;
    else reason = `${depth} m over a deck at ${round2(deck)} m is within the ${TWIN_ROAD_FREEBOARD_M} m freeboard.`;

    return {
      edge_key: key,
      from: edge.from,
      to: edge.to,
      label,
      water_depth_m: depth,
      accessible,
      reason
    };
  });

  const blockedEdgeKeys = Array.from(
    new Set([
      ...roads.filter(road => !road.accessible).map(road => road.edge_key),
      ...city.graph.edges.filter(edge => edge.blocked).map(edge => edgeKey(edge.from, edge.to))
    ])
  ).sort(compareIds);

  return {
    is_simulated: true,
    water_level_m: water,
    framing: TWIN_FLOOD_FRAMING,
    buildings,
    roads,
    blocked_edge_keys: blockedEdgeKeys,
    stats: {
      buildings_total: buildings.length,
      buildings_exposed: buildings.filter(building => building.flooded_floors > 0).length,
      buildings_severely_exposed: buildings.filter(building => building.exposure === 'SEVERE').length,
      exposed_occupants: buildings.reduce((sum, building) => sum + building.exposed_occupants, 0),
      roads_total: roads.length,
      roads_impassable: roads.filter(road => !road.accessible).length
    }
  };
}

/* ------------------------------------------------------------------ */
/* Feature 2 — 3D rescue route optimisation                            */
/* ------------------------------------------------------------------ */

function routeSignature(unitId: string, incidentId: string, blocked: readonly string[]): string {
  return `${unitId}→${incidentId}|${[...blocked].sort(compareIds).join(',')}`;
}

function geometryForPath(city: TwinCity, path: readonly string[]): Array<{ x: number; y: number }> {
  const nodeById = new Map(city.graph.nodes.map(node => [node.id, node]));
  return path
    .map(id => nodeById.get(id))
    .filter((node): node is NonNullable<typeof node> => Boolean(node))
    .map(node => ({ x: node.x, y: node.y }));
}

/**
 * Plan a single unit → incident route with Dijkstra (via the shared router), on
 * the road network as the current flood leaves it. Blocked segments are removed
 * before the search, so an impassable bridge genuinely removes the shortcut
 * rather than merely being drawn over it.
 */
export function planTwinRoute(
  city: TwinCity,
  flood: TwinFloodAssessment,
  unitId: string,
  incidentId: string
): TwinRoute | null {
  const unit = city.units.find(candidate => candidate.id === unitId);
  const incident = city.incidents.find(candidate => candidate.id === incidentId);
  if (!unit || !incident) return null;

  const blockedKeys = new Set(flood.blocked_edge_keys);
  const estimates = shortestPaths(city.graph, unit.home_node, blockedKeys);
  const estimate = estimates.get(incident.node_id);
  const minutes = estimate ? estimate.minutes : null;
  const path = estimate ? estimate.path : [];

  const reasons: string[] = [];
  const incidentNodeLabel =
    city.graph.nodes.find(node => node.id === incident.node_id)?.label ?? incident.node_id;

  if (minutes === null) {
    reasons.push(
      `No road route exists from ${unit.label}'s base to ${incidentNodeLabel} with the current closures, so the incident is unreachable by road.`
    );
  } else {
    reasons.push(
      `Dijkstra shortest path over ${path.length} road node(s) gives ${minutes} min via ${path
        .slice(1, -1)
        .map(id => city.graph.nodes.find(node => node.id === id)?.label ?? id)
        .join(' → ') || 'the direct segment'}.`
    );
    reasons.push(
      `${minutes} min is ${minutes <= city.sla_minutes ? 'within' : 'beyond'} the ${city.sla_minutes} min target response time.`
    );
  }

  const floodClosed = flood.roads.filter(road => !road.accessible);
  if (floodClosed.length > 0) {
    reasons.push(
      `${floodClosed.length} road segment(s) are impassable at ${flood.water_level_m} m, including ${floodClosed
        .slice(0, 3)
        .map(road => road.label)
        .join(', ')}.`
    );
  }

  return {
    signature: routeSignature(unitId, incidentId, flood.blocked_edge_keys),
    unit_id: unit.id,
    unit_label: unit.label,
    incident_id: incident.id,
    incident_title: incident.title,
    severity: incident.severity,
    from_node: unit.home_node,
    to_node: incident.node_id,
    minutes,
    path,
    geometry: geometryForPath(city, path),
    reachable: minutes !== null,
    within_sla: minutes !== null && minutes <= city.sla_minutes,
    blocked_edge_keys: [...flood.blocked_edge_keys],
    reasons
  };
}

/**
 * Compare a baseline route against the recomputed one. A route that becomes
 * unreachable is treated as the worst possible outcome, never as "no change".
 */
export function compareTwinRoutes(baseline: TwinRoute, updated: TwinRoute): TwinRouteComparison {
  const changes: TwinRouteChange[] = [];

  let deltaMinutes: number | null = null;
  let degraded: boolean | null = null;

  if (baseline.minutes === null && updated.minutes === null) {
    deltaMinutes = null;
    degraded = null;
  } else if (updated.minutes === null) {
    degraded = true;
    changes.push({
      label: 'Route lost',
      detail: 'The incident is no longer reachable by road under the updated closures.',
      tone: 'critical'
    });
  } else if (baseline.minutes === null) {
    degraded = false;
    changes.push({
      label: 'Route restored',
      detail: 'A road route now exists where none did before.',
      tone: 'success'
    });
  } else {
    deltaMinutes = Math.round((updated.minutes - baseline.minutes) * 10) / 10;
    if (deltaMinutes === 0) {
      degraded = null;
    } else {
      degraded = deltaMinutes > 0;
      changes.push({
        label: deltaMinutes > 0 ? 'Slower' : 'Faster',
        detail: `${Math.abs(deltaMinutes)} min ${deltaMinutes > 0 ? 'added' : 'saved'} versus the baseline route.`,
        tone: deltaMinutes > 0 ? 'warning' : 'success'
      });
    }
  }

  if (baseline.path.join('>') !== updated.path.join('>') && baseline.path.length > 0 && updated.path.length > 0) {
    const removed = baseline.path.filter(node => !updated.path.includes(node));
    const added = updated.path.filter(node => !baseline.path.includes(node));
    changes.push({
      label: 'Path changed',
      detail:
        removed.length > 0 || added.length > 0
          ? `Detour avoids ${removed.join(', ') || 'nothing'} and now passes ${added.join(', ') || 'nothing new'}.`
          : 'The fastest path changed even though its length did not.',
      tone: 'accent'
    });
  }

  const addedClosures = updated.blocked_edge_keys.filter(key => !baseline.blocked_edge_keys.includes(key));
  if (addedClosures.length > 0) {
    changes.push({
      label: 'New closures',
      detail: `${addedClosures.length} additional segment(s) became impassable: ${addedClosures.join(', ')}.`,
      tone: 'critical'
    });
  }

  const summary =
    updated.minutes === null && baseline.minutes !== null
      ? `Re-routing failed: ${baseline.unit_label} can no longer reach ${baseline.incident_title}. Human review required.`
      : deltaMinutes === null || deltaMinutes === 0
        ? `Modelled travel time for ${baseline.unit_label} → ${baseline.incident_title} is unchanged at ${
            baseline.minutes ?? updated.minutes ?? '—'
          } min.`
        : `${baseline.unit_label} → ${baseline.incident_title} is ${deltaMinutes > 0 ? 'slower' : 'faster'} by ${Math.abs(
            deltaMinutes
          )} min (${baseline.minutes} → ${updated.minutes} min).`;

  return {
    is_simulated: true,
    baseline,
    updated,
    delta_minutes: deltaMinutes,
    degraded,
    summary,
    changes
  };
}

/* ------------------------------------------------------------------ */
/* Feature 3 — Virtual drone reconnaissance                            */
/* ------------------------------------------------------------------ */

/**
 * Prioritise inspection stops by incident severity, proximity and coverage gap.
 *
 * The score is an explicit weighted sum (see `TWIN_DRONE_WEIGHTS`):
 *  - severity   — the worst incident in the building's zone, ranked via the
 *                 shared `severityRank`;
 *  - proximity  — straight-line distance from the drone base, normalised;
 *  - coverageGap— zones with fewer reports than expected score higher, because
 *                 silent areas are exactly what a drone flight should verify.
 *
 * Candidate stops are then ordered as a nearest-neighbour tour from the base,
 * with a lexicographic id tie-break, so the flight path is reproducible.
 */
export function planTwinDroneMission(
  city: TwinCity,
  flood: TwinFloodAssessment,
  options: { base_node?: string; max_stops?: number; incident_id?: string } = {}
): TwinDroneMission {
  const baseNodeId = options.base_node ?? 'centraldepot';
  const maxStops = options.max_stops ?? TWIN_DRONE_MAX_STOPS;
  const nodeById = new Map(city.graph.nodes.map(node => [node.id, node]));
  const base = nodeById.get(baseNodeId) ?? city.graph.nodes[0];

  const reportCountByZone = new Map<string, number>();
  for (const report of city.reports) {
    reportCountByZone.set(report.zone_id, (reportCountByZone.get(report.zone_id) ?? 0) + 1);
  }

  const maxDistance = city.buildings.reduce((max, building) => {
    const distance = Math.hypot(building.x - base.x, building.y - base.y);
    return Math.max(max, distance);
  }, 1);

  const candidates: TwinDronePoint[] = city.buildings.map(building => {
    const zone = city.zones.find(candidate => candidate.id === building.zone_id);
    const zoneIncidents = city.incidents.filter(incident => incident.zone_id === building.zone_id);
    const worst = zoneIncidents
      .slice()
      .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || compareIds(a.id, b.id))[0];
    const severityScore = worst ? severityRank(worst.severity) * 25 : 0;

    const distance = Math.hypot(building.x - base.x, building.y - base.y);
    const proximityScore = 100 * (1 - distance / maxDistance);

    const observed = reportCountByZone.get(building.zone_id) ?? 0;
    const expected = zone?.expected_reports_per_hour ?? 0;
    const gap = Math.max(0, expected - observed);
    const coverageGapScore = expected > 0 ? clamp((gap / expected) * 100, 0, 100) : 60;

    const priority = round2(
      severityScore * TWIN_DRONE_WEIGHTS.severity +
        proximityScore * TWIN_DRONE_WEIGHTS.proximity +
        coverageGapScore * TWIN_DRONE_WEIGHTS.coverageGap
    );

    const reasons: string[] = [];
    if (worst) {
      reasons.push(`${worst.severity} incident in ${zone?.name ?? building.zone_id}: ${worst.title}.`);
    } else {
      reasons.push(`No confirmed incident in ${zone?.name ?? building.zone_id}.`);
    }
    reasons.push(`${Math.round(distance * TWIN_PLAN_UNIT_METRES)} m from the drone base.`);
    if (gap > 0) {
      reasons.push(`${round2(gap)} fewer reports than the ${expected}/h expectation — a coverage gap worth flying over.`);
    } else {
      reasons.push('Reporting volume already meets the modelled expectation.');
    }
    reasons.push(`Building is ${building.floors} floors; modelled exposure is ${round2(building.ground_elevation_m)} m of ground elevation.`);

    return {
      id: `drn-${building.id}`,
      building_id: building.id,
      incident_id: worst?.id ?? null,
      label: building.label,
      x: building.x,
      y: building.y,
      priority,
      severity: worst?.severity ?? null,
      distance_from_base_m: Math.round(distance * TWIN_PLAN_UNIT_METRES),
      reasons
    };
  });

  // Highest priority first; nearer, then id, break ties deterministically.
  candidates.sort(
    (a, b) =>
      b.priority - a.priority ||
      a.distance_from_base_m - b.distance_from_base_m ||
      compareIds(a.id, b.id)
  );

  const selected = candidates.slice(0, Math.max(0, maxStops));

  // Nearest-neighbour ordering from the base for a sensible flight path.
  const ordered: TwinDronePoint[] = [];
  const remaining = [...selected];
  let cursor = { x: base.x, y: base.y };
  while (remaining.length > 0) {
    remaining.sort(
      (a, b) =>
        Math.hypot(a.x - cursor.x, a.y - cursor.y) - Math.hypot(b.x - cursor.x, b.y - cursor.y) ||
        compareIds(a.id, b.id)
    );
    const next = remaining.shift() as TwinDronePoint;
    ordered.push(next);
    cursor = { x: next.x, y: next.y };
  }

  let pathLengthUnits = 0;
  let previous = { x: base.x, y: base.y };
  for (const point of ordered) {
    pathLengthUnits += Math.hypot(point.x - previous.x, point.y - previous.y);
    previous = { x: point.x, y: point.y };
  }
  const pathLengthM = Math.round(pathLengthUnits * TWIN_PLAN_UNIT_METRES);

  const inspectedBuildingIds = new Set(ordered.map(point => point.building_id).filter((id): id is string => Boolean(id)));
  const coveredIncidentIds = new Set(ordered.map(point => point.incident_id).filter((id): id is string => Boolean(id)));

  // Exposed buildings are prioritised implicitly by the score, so report both
  // the raw coverage and how much of the current flood exposure was seen.
  const exposedIds = new Set(flood.buildings.filter(building => building.flooded_floors > 0).map(b => b.building_id));
  const exposedCovered = ordered.filter(point => point.building_id && exposedIds.has(point.building_id)).length;

  return {
    is_simulated: true,
    base_node: base.id,
    points: ordered,
    total_points: ordered.length,
    path_length_m: pathLengthM,
    estimated_minutes: Math.round((pathLengthM / TWIN_DRONE_SPEED_M_PER_MIN) * 10) / 10,
    coverage: {
      buildings_total: city.buildings.length,
      buildings_inspected: inspectedBuildingIds.size,
      coverage_pct: city.buildings.length === 0 ? 0 : round2((inspectedBuildingIds.size / city.buildings.length) * 100),
      incidents_total: city.incidents.length,
      incidents_covered: coveredIncidentIds.size
    },
    parameters: {
      max_stops: maxStops,
      severity_weight: TWIN_DRONE_WEIGHTS.severity,
      proximity_weight: TWIN_DRONE_WEIGHTS.proximity,
      coverage_gap_weight: TWIN_DRONE_WEIGHTS.coverageGap,
      speed_m_per_min: TWIN_DRONE_SPEED_M_PER_MIN,
      exposed_buildings_covered: exposedCovered
    }
  };
}

/* ------------------------------------------------------------------ */
/* Feature 4 — Interactive building intelligence                        */
/* ------------------------------------------------------------------ */

function floorRiskBand(depth: number): TwinRiskBand {
  if (depth <= 0) return 'SAFE';
  if (depth < 0.3) return 'LOW';
  if (depth < 1.0) return 'MODERATE';
  if (depth < 2.0) return 'HIGH';
  return 'SEVERE';
}

function distanceUnits(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Full detail for one building: floor risk, reports, rescue status, neighbours. */
export function getTwinBuildingIntelligence(
  city: TwinCity,
  flood: TwinFloodAssessment,
  buildingId: string,
  options: { plan?: AllocationPlan | null; unit_id?: string } = {}
): TwinBuildingIntelligence | null {
  const building = city.buildings.find(candidate => candidate.id === buildingId);
  if (!building) return null;

  const floodState = flood.buildings.find(candidate => candidate.building_id === buildingId);
  if (!floodState) return null;

  const zone = city.zones.find(candidate => candidate.id === building.zone_id);

  const floors: TwinFloorRisk[] = Array.from({ length: building.floors }, (_, index) => {
    const floor = index + 1;
    const floorLevel = building.ground_elevation_m + index * building.floor_height_m;
    const depth = round2(Math.max(0, flood.water_level_m - floorLevel));
    const risk = floorRiskBand(depth);
    return {
      floor,
      risk,
      water_depth_m: depth,
      reason:
        depth <= 0
          ? `Floor ${floor} is ${round2(floorLevel - flood.water_level_m)} m above the modelled water level.`
          : `${depth} m of modelled water on floor ${floor}.`
    };
  });

  const incidents = city.incidents.filter(incident => incident.zone_id === building.zone_id);
  const incidentIds = new Set(incidents.map(incident => incident.id));
  // Reports are surfaced at node granularity: the building's own node first, then
  // the rest of its zone, so a clicked block shows the nearest evidence available.
  const zoneReports = city.reports.filter(report => report.zone_id === building.zone_id);
  const reports = [
    ...zoneReports.filter(report => report.node_id === building.node_id),
    ...zoneReports.filter(report => report.node_id !== building.node_id)
  ];

  const assignment = options.plan?.assignments.find(item => incidentIds.has(item.incident_id)) ?? null;

  let rescueStatus: TwinBuildingIntelligence['rescue_status'];
  if (incidentIds.size === 0) {
    rescueStatus = {
      assigned_unit_id: null,
      assigned_unit_label: null,
      status: 'No confirmed incident',
      detail: 'No confirmed incident is recorded in this building\'s neighbourhood, so no unit is tasked here.'
    };
  } else if (!assignment) {
    rescueStatus = {
      assigned_unit_id: null,
      assigned_unit_label: null,
      status: 'Unassigned',
      detail: `${incidentIds.size} incident(s) in this neighbourhood currently have no unit under the active plan.`
    };
  } else {
    rescueStatus = {
      assigned_unit_id: assignment.unit_id,
      assigned_unit_label: assignment.unit_label,
      status: assignment.within_sla ? 'Assigned within target' : 'Assigned beyond target',
      detail: `${assignment.unit_label} is modelled at ${assignment.travel_minutes ?? '—'} min for ${assignment.incident_title}.`
    };
  }

  const nearbyResources: TwinNearbyResource[] = [];

  for (const other of city.buildings) {
    if (other.id === building.id) continue;
    if (other.category !== 'HOSPITAL' && other.category !== 'SHELTER' && other.category !== 'FIRE_STATION') continue;
    const units = distanceUnits(building, other);
    nearbyResources.push({
      kind: other.category,
      label: other.label,
      distance_units: round2(units),
      distance_m: Math.round(units * TWIN_PLAN_UNIT_METRES),
      detail:
        other.category === 'HOSPITAL'
          ? 'Modelled receiving facility.'
          : other.category === 'SHELTER'
            ? 'Modelled evacuation point.'
            : 'Modelled fire and rescue base.'
    });
  }

  for (const unit of city.units) {
    const node = city.graph.nodes.find(candidate => candidate.id === unit.home_node);
    if (!node) continue;
    const units = distanceUnits(building, node);
    nearbyResources.push({
      kind: 'UNIT',
      label: unit.label,
      distance_units: round2(units),
      distance_m: Math.round(units * TWIN_PLAN_UNIT_METRES),
      detail: `${unit.type === 'AMBULANCE' ? 'Ambulance' : 'Rescue team'} based at ${node.label}.`
    });
  }

  nearbyResources.sort((a, b) => a.distance_units - b.distance_units || compareIds(a.label, b.label));

  return {
    is_simulated: true,
    building,
    zone_name: zone?.name ?? building.zone_id,
    floods: floodState,
    floors,
    reports,
    incidents,
    rescue_status: rescueStatus,
    nearby_resources: nearbyResources.slice(0, 6)
  };
}

/* ------------------------------------------------------------------ */
/* Feature 5 — Disaster time machine                                   */
/* ------------------------------------------------------------------ */

/** The scripted water levels the timeline replays, with their time offsets. */
const TIMELINE_SCRIPT: Array<{ offset: number; water: number }> = [
  { offset: 0, water: 0.6 },
  { offset: 5, water: 1.4 },
  { offset: 10, water: 2.4 },
  { offset: 15, water: 3.0 },
  { offset: 20, water: 3.6 },
  { offset: 25, water: 4.3 },
  { offset: 30, water: 5.0 }
];

/**
 * Replay the simulated disaster as an ordered set of frames. Each frame is
 * computed by the same engines the live view uses, so the replay can never drift
 * from the interactive result.
 */
export function buildTwinTimeline(city: TwinCity): TwinTimeline {
  const dataset = getSimulatedDataset();
  const frames: TwinTimelineFrame[] = [];
  let previousBlocked: string[] = [];
  let previousPlan: AllocationPlan | null = null;

  TIMELINE_SCRIPT.forEach((step, index) => {
    const flood = assessTwinFlood(city, step.water);
    const scenario: PlanScenario = { blocked_edge_keys: flood.blocked_edge_keys };
    const plan = computePlan(dataset, 'SEVERITY_FIRST', scenario);

    const events: TwinTimelineEvent[] = [];

    if (index === 0) {
      for (const incident of city.incidents
        .slice()
        .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || compareIds(a.id, b.id))) {
        events.push({
          id: `ev-inc-${incident.id}`,
          kind: 'INCIDENT',
          offset_minutes: step.offset,
          title: `${incident.severity} — ${incident.title}`,
          detail: `${incident.people_at_risk ?? 'Unknown'} people reported at risk in ${
            city.zones.find(zone => zone.id === incident.zone_id)?.name ?? incident.zone_id
          }.`,
          tone: incident.severity === 'Critical' ? 'critical' : incident.severity === 'High' ? 'warning' : 'neutral'
        });
      }
    }

    events.push({
      id: `ev-flood-${index}`,
      kind: 'FLOOD',
      offset_minutes: step.offset,
      title: `Water level ${step.water} m`,
      detail: `${flood.stats.buildings_exposed} of ${flood.stats.buildings_total} buildings are exposed; ${flood.stats.exposed_occupants} modelled occupants are on flooded floors.`,
      tone: flood.stats.buildings_severely_exposed > 0 ? 'warning' : flood.stats.buildings_exposed > 0 ? 'uncertain' : 'success'
    });

    const newlyBlocked = flood.blocked_edge_keys.filter(key => !previousBlocked.includes(key));
    for (const key of newlyBlocked) {
      const road = flood.roads.find(candidate => candidate.edge_key === key);
      events.push({
        id: `ev-close-${index}-${key}`,
        kind: 'ROAD_CLOSURE',
        offset_minutes: step.offset,
        title: `${road?.label ?? key} impassable`,
        detail: road?.reason ?? 'Segment became impassable under the modelled flood.',
        tone: 'critical'
      });
    }

    for (const assignment of plan.assignments) {
      const previous = previousPlan?.assignments.find(item => item.incident_id === assignment.incident_id);
      const changed = !previous || previous.unit_id !== assignment.unit_id;
      events.push({
        id: `ev-assign-${index}-${assignment.incident_id}`,
        kind: changed && previous ? 'ROUTE_CHANGE' : 'ASSIGNMENT',
        offset_minutes: step.offset,
        title: changed && previous
          ? `Re-assigned: ${assignment.incident_title}`
          : `Assigned: ${assignment.unit_label} → ${assignment.incident_title}`,
        detail:
          changed && previous
            ? `Was ${previous.unit_label} (${previous.travel_minutes ?? '—'} min), now ${assignment.unit_label} (${assignment.travel_minutes ?? '—'} min).`
            : `${assignment.travel_minutes ?? '—'} min modelled, ${assignment.within_sla ? 'within' : 'beyond'} the ${city.sla_minutes} min target.`,
        tone: assignment.within_sla ? 'accent' : 'warning'
      });
    }

    if (plan.metrics.unattended_incidents > 0) {
      events.push({
        id: `ev-reco-${index}`,
        kind: 'RECOMMENDATION',
        offset_minutes: step.offset,
        title: `${plan.metrics.unattended_incidents} incident(s) with no unit`,
        detail: plan.disadvantaged_summary,
        tone: 'critical'
      });
    }

    const unreachable = plan.unassigned.filter(item =>
      item.reason.toLowerCase().includes('no available unit has a modelled route')
    ).length;

    frames.push({
      id: `frame-${index}`,
      index,
      offset_minutes: step.offset,
      label: `T+${String(step.offset).padStart(2, '0')} min — ${step.water} m`,
      water_level_m: step.water,
      blocked_edge_keys: flood.blocked_edge_keys,
      events,
      snapshot: {
        buildings_exposed: flood.stats.buildings_exposed,
        exposed_occupants: flood.stats.exposed_occupants,
        roads_impassable: flood.stats.roads_impassable,
        assigned: plan.assignments.length,
        unreachable_incidents: unreachable,
        avg_response_minutes: plan.metrics.avg_response_minutes
      }
    });

    previousBlocked = flood.blocked_edge_keys;
    previousPlan = plan;
  });

  return {
    is_simulated: true,
    duration_minutes: TIMELINE_SCRIPT[TIMELINE_SCRIPT.length - 1].offset,
    frames
  };
}

/* ------------------------------------------------------------------ */
/* Feature 6 — AI disaster copilot (deterministic, state-grounded)     */
/* ------------------------------------------------------------------ */

/** Resolve a question like "incident A" or a title fragment to an incident. */
export function resolveTwinIncident(question: string, city: TwinCity): SimIncident | null {
  const ordered = city.incidents
    .slice()
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || compareIds(a.id, b.id));

  const letter = question.match(/incident\s+([a-z])\b/i);
  if (letter) {
    const index = letter[1].toLowerCase().charCodeAt(0) - 'a'.charCodeAt(0);
    if (index >= 0 && index < ordered.length) return ordered[index];
  }

  const byTitle = city.incidents.find(
    incident =>
      question.toLowerCase().includes(incident.zone_id.toLowerCase()) ||
      incident.title
        .toLowerCase()
        .split(/\W+/)
        .filter(word => word.length > 4)
        .some(word => question.toLowerCase().includes(word))
  );
  if (byTitle) return byTitle;

  return null;
}

function formatMinutes(value: number | null): string {
  return value === null ? 'unreachable' : `${value} min`;
}

/**
 * Answer a question strictly from the simulation state.
 *
 * This is deliberately NOT a language model: every figure is read from the
 * deterministic engines (flood assessment, Dijkstra routing, the allocation
 * engine, the drone planner). If the state cannot answer the question, the
 * copilot says so instead of inventing a number.
 */
export function answerTwinCopilot(question: string, context: TwinCopilotContext): TwinCopilotAnswer {
  const { city, flood, mission, routes } = context;
  const text = question.toLowerCase();

  const suggestions = [
    'Which buildings are most exposed?',
    'Which ambulance can reach Incident A fastest?',
    'What happens if the bridge closes?',
    'Which areas have limited rescue coverage?'
  ];

  /* --- Most exposed buildings ------------------------------------- */
  if (/(expos|at risk|worst|most affected|flood)/.test(text)) {
    const ranked = flood.buildings
      .slice()
      .sort((a, b) => b.exposed_occupants - a.exposed_occupants || compareIds(a.building_id, b.building_id))
      .slice(0, 5)
      .map(state => {
        const building = city.buildings.find(candidate => candidate.id === state.building_id);
        return {
          label: building?.label ?? state.building_id,
          value: `${state.exposed_occupants} occupants · ${state.flooded_floors} floor(s) · ${state.exposure}`
        };
      });

    return {
      is_simulated: true,
      question,
      intent: 'MOST_EXPOSED',
      answer:
        flood.stats.buildings_exposed === 0
          ? `At the current ${flood.water_level_m} m water level no modelled building has water over its ground floor.`
          : `At the current ${flood.water_level_m} m water level, ${flood.stats.buildings_exposed} of ${flood.stats.buildings_total} buildings are exposed and ${flood.stats.exposed_occupants} modelled occupants are on flooded floors. The most exposed are listed below. These are modelled occupants on flooded floors, not confirmed casualties.`,
      facts: ranked,
      citations: ['assessTwinFlood'],
      suggestions
    };
  }

  /* --- Fastest response ------------------------------------------- */
  if (/(fastest|quickest|reach|how long|which ambulance|eta|response time)/.test(text)) {
    const incident = resolveTwinIncident(question, city) ?? city.incidents[0];
    const candidates = city.units
      .map(unit => planTwinRoute(city, flood, unit.id, incident.id))
      .filter((route): route is TwinRoute => route !== null)
      .sort(
        (a, b) =>
          (a.minutes ?? Number.POSITIVE_INFINITY) - (b.minutes ?? Number.POSITIVE_INFINITY) ||
          compareIds(a.unit_id, b.unit_id)
      );

    const best = candidates[0];
    const facts = candidates.slice(0, 5).map(route => ({
      label: route.unit_label,
      value: formatMinutes(route.minutes)
    }));

    return {
      is_simulated: true,
      question,
      intent: 'FASTEST_UNIT',
      answer: best
        ? best.minutes === null
          ? `No modelled ambulance has a road route to "${incident.title}" under the current closures. The incident is unreachable by road and needs a human routing decision.`
          : `${best.unit_label} reaches "${incident.title}" fastest at ${best.minutes} min, which is ${
              best.within_sla ? 'within' : 'beyond'
            } the ${city.sla_minutes} min target. Computed with Dijkstra over the road network as the current flood leaves it.`
        : `No unit could be evaluated for "${incident.title}".`,
      facts,
      citations: ['planTwinRoute', 'geo.shortestPaths'],
      suggestions
    };
  }

  /* --- Bridge / closure what-if ----------------------------------- */
  if (/(bridge|clos|blocked|shut|what if|if the)/.test(text)) {
    const openFlood = assessTwinFlood(city, flood.water_level_m, []);
    const closedFlood = assessTwinFlood(city, flood.water_level_m, [MILL_BRIDGE_EDGE_KEY]);
    const openPlan = computePlan(getSimulatedDataset(), 'SEVERITY_FIRST', {
      blocked_edge_keys: openFlood.blocked_edge_keys
    });
    const closedPlan = computePlan(getSimulatedDataset(), 'SEVERITY_FIRST', {
      blocked_edge_keys: closedFlood.blocked_edge_keys
    });

    const openRoad = openFlood.roads.find(road => road.edge_key === MILL_BRIDGE_EDGE_KEY);
    const nowClosed = closedFlood.blocked_edge_keys.includes(MILL_BRIDGE_EDGE_KEY);

    return {
      is_simulated: true,
      question,
      intent: 'BRIDGE_WHAT_IF',
      answer: `Mill Bridge is the only modelled crossing to the west bank. ${
        nowClosed
          ? `It is already impassable at ${flood.water_level_m} m.`
          : openRoad && !openRoad.accessible
            ? `It is already impassable.`
            : `It is currently passable at ${flood.water_level_m} m.`
      } Closing it changes the ${city.sla_minutes} min target from ${openPlan.metrics.avg_response_minutes ?? '—'} min average to ${
        closedPlan.metrics.avg_response_minutes ?? '—'
      } min, and leaves ${closedPlan.metrics.unattended_incidents} incident(s) unattended versus ${openPlan.metrics.unattended_incidents} with it open.`,
      facts: [
        { label: 'Avg response, bridge open', value: formatMinutes(openPlan.metrics.avg_response_minutes) },
        { label: 'Avg response, bridge closed', value: formatMinutes(closedPlan.metrics.avg_response_minutes) },
        { label: 'Unattended, open', value: String(openPlan.metrics.unattended_incidents) },
        { label: 'Unattended, closed', value: String(closedPlan.metrics.unattended_incidents) }
      ],
      citations: ['assessTwinFlood', 'computePlan'],
      suggestions
    };
  }

  /* --- Coverage gaps ---------------------------------------------- */
  if (/(cover|limited|underserved|no unit|isolat|gap|unattended)/.test(text)) {
    const plan = computePlan(getSimulatedDataset(), 'COVERAGE_BALANCED', {
      blocked_edge_keys: flood.blocked_edge_keys
    });

    const zoneNames = new Map(city.zones.map(zone => [zone.id, zone.name]));
    const unattendedZones = Array.from(new Set(plan.unassigned.map(item => zoneNames.get(item.zone_id) ?? item.zone_id)));

    const hardToReach = city.zones
      .filter(zone => zone.connectivity < 0.5 || zone.road_access < 0.5)
      .map(zone => ({ label: zone.name, value: `connectivity ${zone.connectivity}, road access ${zone.road_access}` }));

    return {
      is_simulated: true,
      question,
      intent: 'COVERAGE_GAP',
      answer: `Under the coverage-balanced rule at ${flood.water_level_m} m, ${plan.metrics.unattended_incidents} incident(s) receive no unit${
        unattendedZones.length > 0 ? `, affecting ${unattendedZones.join(', ')}` : ''
      }. ${plan.metrics.unattended_high_severity} of them are Critical or High severity. The most isolated zones by modelled connectivity are listed below.`,
      facts: [
        { label: 'Unattended incidents', value: String(plan.metrics.unattended_incidents) },
        { label: 'Unattended (Critical/High)', value: String(plan.metrics.unattended_high_severity) },
        { label: 'Coverage within target', value: `${plan.metrics.coverage_pct}%` },
        ...hardToReach
      ],
      citations: ['computePlan', 'simulation.zones'],
      suggestions
    };
  }

  /* --- Drone mission ---------------------------------------------- */
  if (/(drone|recon|inspect|aerial|fly)/.test(text)) {
    return {
      is_simulated: true,
      question,
      intent: 'DRONE_MISSION',
      answer: `The virtual drone has planned ${mission.total_points} inspection stop(s) over a ${mission.path_length_m} m flight path (about ${mission.estimated_minutes} min at the modelled speed). It covers ${mission.coverage.buildings_inspected} of ${mission.coverage.buildings_total} buildings and ${mission.coverage.incidents_covered} of ${mission.coverage.incidents_total} incidents. This is a simulated flight plan; it does not control a real aircraft.`,
      facts: mission.points.slice(0, 5).map(point => ({
        label: point.label,
        value: `priority ${point.priority}`
      })),
      citations: ['planTwinDroneMission'],
      suggestions
    };
  }

  /* --- Fallback: overall situation -------------------------------- */
  const activeRouteCount = routes.length;
  return {
    is_simulated: true,
    question,
    intent: 'SITUATION',
    answer: `At ${flood.water_level_m} m: ${flood.stats.buildings_exposed} building(s) exposed, ${flood.stats.exposed_occupants} modelled occupants on flooded floors and ${flood.stats.roads_impassable} of ${flood.stats.roads_total} road segments impassable. ${activeRouteCount} route(s) are currently planned. Ask about exposed buildings, the fastest ambulance, the bridge, coverage gaps or the drone flight.`,
    facts: [
      { label: 'Water level', value: `${flood.water_level_m} m` },
      { label: 'Buildings exposed', value: String(flood.stats.buildings_exposed) },
      { label: 'Exposed occupants (modelled)', value: String(flood.stats.exposed_occupants) },
      { label: 'Roads impassable', value: `${flood.stats.roads_impassable} / ${flood.stats.roads_total}` }
    ],
    citations: ['assessTwinFlood'],
    suggestions
  };
}

/* ------------------------------------------------------------------ */
/* Convenience: the one-click demo scenario                            */
/* ------------------------------------------------------------------ */

export const TWIN_DEMO_TITLE = 'Urban Flood Emergency — 3D Simulation';

export interface TwinDemoStep {
  id: string;
  title: string;
  detail: string;
  /** Water level this step settles on. */
  water_level_m: number;
  /** Scenario toggles this step forces on top of the flood. */
  extra_blocked: string[];
  /** Camera/preset hint the 3D view may follow. */
  focus: 'OVERVIEW' | 'FLOOD' | 'BRIDGE' | 'ROUTES' | 'BUILDING' | 'DRONE' | 'SUMMARY';
}

/**
 * The scripted 90-second demonstration. Every step is a state the interactive
 * engines can reproduce, so a viewer can stop the demo at any point and keep
 * exploring from exactly that state.
 */
export const TWIN_DEMO_STEPS: TwinDemoStep[] = [
  {
    id: 'load-city',
    title: 'Load the synthetic 3D city',
    detail: 'Riverbend is generated from a fixed seed: 60+ blocks, 11 nodes, 14 modelled road segments.',
    water_level_m: 0,
    extra_blocked: [],
    focus: 'OVERVIEW'
  },
  {
    id: 'incidents',
    title: 'Emergency incidents arrive',
    detail: 'Five simulated incidents, two of them Critical, are placed across the district.',
    water_level_m: 0.6,
    extra_blocked: [],
    focus: 'OVERVIEW'
  },
  {
    id: 'rising-water',
    title: 'Flood level rises',
    detail: 'Water climbs to 2.4 m; low-lying riverside blocks start taking water on the ground floor.',
    water_level_m: 2.4,
    extra_blocked: [],
    focus: 'FLOOD'
  },
  {
    id: 'bridge',
    title: 'Mill Bridge becomes impassable',
    detail: 'Water overtops the bridge deck. The only modelled crossing to the west bank closes.',
    water_level_m: 3.6,
    extra_blocked: [],
    focus: 'BRIDGE'
  },
  {
    id: 'reroute',
    title: 'Ambulance routes recalculate',
    detail: 'Dijkstra re-routes around the closure and the previous route is kept for comparison.',
    water_level_m: 4.3,
    extra_blocked: [],
    focus: 'ROUTES'
  },
  {
    id: 'drone',
    title: 'Virtual drone inspection',
    detail: 'The drone flies a prioritised inspection route over the most exposed and least-reported blocks.',
    water_level_m: 4.3,
    extra_blocked: [],
    focus: 'DRONE'
  },
  {
    id: 'summary',
    title: 'AI response summary',
    detail: 'A deterministic summary of the exercise is assembled from the simulation state, for human review.',
    water_level_m: 5,
    extra_blocked: [],
    focus: 'SUMMARY'
  }
];
