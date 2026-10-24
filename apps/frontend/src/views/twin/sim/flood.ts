import { RIVER_HALF_WIDTH_M, terrainElevation } from './city';
import type { Building, City, RoadEdge, Vec2 } from './types';

/**
 * Flood model for the twin — a hydrologically-connected "bathtub" model.
 *
 * The water level is measured above the river datum. A grid cell floods when
 * its synthetic ground elevation is below the water level AND it is connected
 * to the river through other flooded cells (4-neighbour flood fill). Depth is
 * water level minus ground elevation. It ignores flow velocity, drainage,
 * rainfall and time-to-peak: it is a teaching/simulation model, not a forecast.
 */

/** Explicit road-accessibility rules applied by the simulation. */
export const ROAD_RULES = {
  /** Above this depth (m) a road segment is closed to emergency vehicles. */
  closedDepthM: 0.3,
  /** Any standing water up to `closedDepthM` slows vehicles by this factor. */
  cautionSpeedFactor: 0.5
} as const;

/** Building exposure bands, by flood depth at the building (m). */
export const EXPOSURE_BANDS = {
  low: 0,
  moderate: 0.5,
  high: 1.5,
  /** Dry buildings whose ground is within this height of the water are "at risk". */
  atRiskFreeboardM: 0.5
} as const;

export type ExposureLevel = 'none' | 'at_risk' | 'low' | 'moderate' | 'high';

export interface BuildingExposure {
  depthM: number;
  level: ExposureLevel;
  floorsAffected: number;
  occupantsExposed: number;
}

export interface FloodGrid {
  cols: number;
  rows: number;
  minX: number;
  minY: number;
  cellSizeM: number;
  /** Terrain elevation at each cell centre; -1 marks the river channel. */
  terrain: Float32Array;
}

export interface FloodResult {
  waterLevelM: number;
  grid: FloodGrid;
  /** Flood depth per cell (0 where dry or river channel). */
  depth: Float32Array;
  floodedCells: number;
  floodedAreaKm2: number;
  exposure: Map<string, BuildingExposure>;
  exposedBuildings: number;
  atRiskBuildings: number;
  occupantsExposed: number;
}

export type RoadStatus = 'open' | 'caution' | 'closed';

export type ClosureCause = 'flood_depth' | 'bridge_rule' | 'manual' | 'bridge_manual';

export interface RoadState {
  status: RoadStatus;
  depthM: number;
  speedFactor: number;
  cause?: ClosureCause;
  reason: string;
}

const gridCache = new WeakMap<City, FloodGrid>();

export function getFloodGrid(city: City): FloodGrid {
  const cached = gridCache.get(city);
  if (cached) return cached;
  const { minX, maxX, minY, maxY } = city.extent;
  const size = city.cellSizeM;
  const cols = Math.round((maxX - minX) / size);
  const rows = Math.round((maxY - minY) / size);
  const terrain = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      terrain[r * cols + c] = terrainElevation(minX + (c + 0.5) * size, minY + (r + 0.5) * size);
    }
  }
  const grid = { cols, rows, minX, minY, cellSizeM: size, terrain };
  gridCache.set(city, grid);
  return grid;
}

export function cellIndex(grid: FloodGrid, p: Vec2): number {
  const c = Math.floor((p.x - grid.minX) / grid.cellSizeM);
  const r = Math.floor((p.y - grid.minY) / grid.cellSizeM);
  if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return -1;
  return r * grid.cols + c;
}

/** Flood depth (m) at a point: 0 when the point's cell is not hydraulically connected water. */
export function depthAt(flood: FloodResult, p: Vec2): number {
  const idx = cellIndex(flood.grid, p);
  if (idx < 0 || flood.depth[idx] <= 0) return 0;
  return Math.max(0, flood.waterLevelM - terrainElevation(p.x, p.y));
}

function classifyExposure(depthM: number, freeboardM: number): ExposureLevel {
  if (depthM > EXPOSURE_BANDS.high) return 'high';
  if (depthM > EXPOSURE_BANDS.moderate) return 'moderate';
  if (depthM > EXPOSURE_BANDS.low) return 'low';
  if (freeboardM <= EXPOSURE_BANDS.atRiskFreeboardM) return 'at_risk';
  return 'none';
}

function buildingDepth(flood: FloodResult, building: Building): number {
  const points = [building.centroid, ...building.footprint];
  const wet = points.some(p => {
    const idx = cellIndex(flood.grid, p);
    return idx >= 0 && flood.depth[idx] > 0;
  });
  return wet ? Math.max(0, flood.waterLevelM - building.elevation) : 0;
}

export function computeFlood(city: City, waterLevelM: number): FloodResult {
  const grid = getFloodGrid(city);
  const { cols, rows, terrain } = grid;
  const depth = new Float32Array(cols * rows);
  const visited = new Uint8Array(cols * rows);
  const queue: number[] = [];

  for (let i = 0; i < terrain.length; i++) {
    if (terrain[i] < 0) {
      visited[i] = 1;
      queue.push(i);
    }
  }

  let floodedCells = 0;
  for (let head = 0; head < queue.length; head++) {
    const idx = queue[head];
    const r = Math.floor(idx / cols);
    const c = idx - r * cols;
    const neighbours = [
      c > 0 ? idx - 1 : -1,
      c < cols - 1 ? idx + 1 : -1,
      r > 0 ? idx - cols : -1,
      r < rows - 1 ? idx + cols : -1
    ];
    for (const n of neighbours) {
      if (n < 0 || visited[n]) continue;
      visited[n] = 1;
      if (terrain[n] < waterLevelM) {
        depth[n] = waterLevelM - terrain[n];
        floodedCells++;
        queue.push(n);
      }
    }
  }

  const result: FloodResult = {
    waterLevelM,
    grid,
    depth,
    floodedCells,
    floodedAreaKm2: (floodedCells * grid.cellSizeM * grid.cellSizeM) / 1e6,
    exposure: new Map(),
    exposedBuildings: 0,
    atRiskBuildings: 0,
    occupantsExposed: 0
  };

  for (const building of city.buildings) {
    const d = buildingDepth(result, building);
    const level = classifyExposure(d, building.elevation - waterLevelM);
    const floorsAffected = d > 0 ? Math.min(building.floors, Math.ceil(d / building.floorHeightM)) : 0;
    const occupantsExposed = Math.round((building.occupants * floorsAffected) / building.floors);
    result.exposure.set(building.id, { depthM: d, level, floorsAffected, occupantsExposed });
    if (d > 0) {
      result.exposedBuildings++;
      result.occupantsExposed += occupantsExposed;
    } else if (level === 'at_risk') {
      result.atRiskBuildings++;
    }
  }

  return result;
}

const sampleCache = new WeakMap<RoadEdge, Vec2[]>();

function edgeSamples(city: City, edge: RoadEdge): Vec2[] {
  const cached = sampleCache.get(edge);
  if (cached) return cached;
  const a = city.nodes.find(n => n.id === edge.from)!;
  const b = city.nodes.find(n => n.id === edge.to)!;
  const steps = Math.max(2, Math.ceil(edge.lengthM / city.cellSizeM));
  const samples: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    samples.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  sampleCache.set(edge, samples);
  return samples;
}

export interface ClosureInputs {
  /** Edge ids closed by the operator (e.g. simulated debris). */
  manualEdgeIds?: Iterable<string>;
  /** Bridge ids explicitly marked inaccessible, regardless of water level. */
  manualBridgeIds?: Iterable<string>;
}

/** Apply the explicit road rules to every segment for the current flood. */
export function evaluateRoads(city: City, flood: FloodResult, closures: ClosureInputs = {}): Map<string, RoadState> {
  const manualEdges = new Set(closures.manualEdgeIds ?? []);
  const manualBridges = new Set(closures.manualBridgeIds ?? []);
  const states = new Map<string, RoadState>();

  for (const edge of city.edges) {
    if (edge.bridge) {
      if (manualBridges.has(edge.bridge.id)) {
        states.set(edge.id, { status: 'closed', depthM: 0, speedFactor: 0, cause: 'bridge_manual', reason: `${edge.bridge.name} marked inaccessible` });
        continue;
      }
      if (flood.waterLevelM >= edge.bridge.closureLevelM) {
        states.set(edge.id, {
          status: 'closed',
          depthM: 0,
          speedFactor: 0,
          cause: 'bridge_rule',
          reason: `Water level ${flood.waterLevelM.toFixed(1)} m ≥ deck closure level ${edge.bridge.closureLevelM.toFixed(1)} m`
        });
        continue;
      }
    }
    if (manualEdges.has(edge.id)) {
      states.set(edge.id, { status: 'closed', depthM: 0, speedFactor: 0, cause: 'manual', reason: 'Closed by operator (simulated road closure)' });
      continue;
    }
    let maxDepth = 0;
    if (!edge.bridge) {
      for (const p of edgeSamples(city, edge)) {
        const idx = cellIndex(flood.grid, p);
        if (idx >= 0 && flood.depth[idx] > 0) {
          maxDepth = Math.max(maxDepth, flood.waterLevelM - Math.max(0, terrainElevation(p.x, p.y)));
        }
      }
    }
    if (maxDepth > ROAD_RULES.closedDepthM) {
      states.set(edge.id, {
        status: 'closed',
        depthM: maxDepth,
        speedFactor: 0,
        cause: 'flood_depth',
        reason: `Flood depth ${maxDepth.toFixed(2)} m > ${ROAD_RULES.closedDepthM} m limit`
      });
    } else if (maxDepth > 0) {
      states.set(edge.id, {
        status: 'caution',
        depthM: maxDepth,
        speedFactor: ROAD_RULES.cautionSpeedFactor,
        reason: `Standing water ${maxDepth.toFixed(2)} m — speed ×${ROAD_RULES.cautionSpeedFactor}`
      });
    } else {
      states.set(edge.id, { status: 'open', depthM: 0, speedFactor: 1, reason: 'Dry' });
    }
  }
  return states;
}

export interface FloodRun {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  depthM: number;
}

/** Merge flooded cells into row runs of similar depth, for efficient rendering. */
export function floodRuns(flood: FloodResult): FloodRun[] {
  const { cols, rows, minX, minY, cellSizeM, terrain } = flood.grid;
  const band = (d: number) => (d <= 0 ? -1 : d < 0.5 ? 0 : d < 1 ? 1 : d < 2 ? 2 : 3);
  const runs: FloodRun[] = [];
  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      const idx = r * cols + c;
      const b = band(flood.depth[idx]);
      if (b < 0 || terrain[idx] < 0) {
        c++;
        continue;
      }
      let end = c;
      let sum = 0;
      while (end < cols && band(flood.depth[r * cols + end]) === b && terrain[r * cols + end] >= 0) {
        sum += flood.depth[r * cols + end];
        end++;
      }
      runs.push({
        x0: minX + c * cellSizeM,
        x1: minX + end * cellSizeM,
        y0: minY + r * cellSizeM,
        y1: minY + (r + 1) * cellSizeM,
        depthM: sum / (end - c)
      });
      c = end;
    }
  }
  return runs;
}

export { RIVER_HALF_WIDTH_M };
