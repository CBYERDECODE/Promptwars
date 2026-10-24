import type { FeatureCollection, Feature, LineString, Polygon, Point } from 'geojson';
import { floodRuns } from './sim/flood';
import type { DronePlan } from './sim/drone';
import type { Route } from './sim/routing';
import type { SimState } from './sim/scenario';
import type { Building, City } from './sim/types';
import { ring, toLngLat } from './geo';

/** Pure builders that turn simulation state into GeoJSON for MapLibre. */

export const EXPOSURE_COLORS = {
  none: '#E5E9F0',
  at_risk: '#FCD34D',
  low: '#FDBA74',
  moderate: '#F87171',
  high: '#DC2626'
} as const;

const USE_COLORS: Partial<Record<Building['use'], string>> = {
  hospital: '#FEE2E2',
  shelter: '#DCFCE7',
  school: '#DCFCE7',
  fire_station: '#FFEDD5'
};

export const ROAD_COLORS = { open: '#94A3B8', caution: '#F59E0B', closed: '#DC2626' } as const;

export function staticFeatures(city: City) {
  const ground: FeatureCollection<Polygon> = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [ring([
            { x: city.extent.minX, y: city.extent.minY },
            { x: city.extent.maxX, y: city.extent.minY },
            { x: city.extent.maxX, y: city.extent.maxY },
            { x: city.extent.minX, y: city.extent.maxY }
          ])]
        }
      }
    ]
  };
  const parks: FeatureCollection<Polygon> = {
    type: 'FeatureCollection',
    features: city.parks.map(p => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring(p)] } }))
  };
  const river: FeatureCollection<Polygon> = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring(city.river)] } }]
  };
  return { ground, parks, river };
}

export function floodFeatures(state: SimState): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: floodRuns(state.flood).map(run => ({
      type: 'Feature',
      properties: { depth: Math.round(run.depthM * 100) / 100 },
      geometry: {
        type: 'Polygon',
        coordinates: [ring([
          { x: run.x0, y: run.y0 },
          { x: run.x1, y: run.y0 },
          { x: run.x1, y: run.y1 },
          { x: run.x0, y: run.y1 }
        ])]
      }
    }))
  };
}

export function roadFeatures(state: SimState): FeatureCollection<LineString> {
  const nodes = new Map(state.city.nodes.map(n => [n.id, n]));
  return {
    type: 'FeatureCollection',
    features: state.city.edges.map(edge => {
      const road = state.roads.get(edge.id)!;
      return {
        type: 'Feature',
        id: edge.id,
        properties: { id: edge.id, name: edge.name, status: road.status, bridge: Boolean(edge.bridge), color: ROAD_COLORS[road.status] },
        geometry: { type: 'LineString', coordinates: [toLngLat(nodes.get(edge.from)!), toLngLat(nodes.get(edge.to)!)] }
      };
    })
  };
}

export function buildingFeatures(state: SimState, selectedId: string | null, incidentBuildingIds: Set<string>): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: state.city.buildings
      .filter(b => b.id !== selectedId)
      .map(b => {
        const e = state.flood.exposure.get(b.id)!;
        const color = e.level === 'none' ? USE_COLORS[b.use] ?? EXPOSURE_COLORS.none : EXPOSURE_COLORS[e.level];
        return {
          type: 'Feature',
          properties: { id: b.id, height: b.heightM, color, incident: incidentBuildingIds.has(b.id) },
          geometry: { type: 'Polygon', coordinates: [ring(b.footprint)] }
        };
      })
  };
}

export type FloorRisk = 'flooded' | 'at_risk' | 'safe';

/** Per-floor risk for the floor-level view of a selected building. */
export function floorRisks(state: SimState, building: Building): FloorRisk[] {
  const depth = state.flood.exposure.get(building.id)?.depthM ?? 0;
  const freeboard = building.elevation - state.inputs.waterLevelM;
  return Array.from({ length: building.floors }, (_, i) => {
    const floorBase = i * building.floorHeightM;
    if (depth > floorBase) return 'flooded';
    // The first dry floor above water (or a dry ground floor within 0.5 m of water) is at risk.
    if (depth > 0 ? depth > floorBase - building.floorHeightM : i === 0 && freeboard <= 0.5) return 'at_risk';
    return 'safe';
  });
}

export const FLOOR_COLORS: Record<FloorRisk, string> = { flooded: '#DC2626', at_risk: '#F59E0B', safe: '#86EFAC' };

export function floorFeatures(state: SimState, building: Building | null): FeatureCollection<Polygon> {
  if (!building) return { type: 'FeatureCollection', features: [] };
  const risks = floorRisks(state, building);
  return {
    type: 'FeatureCollection',
    features: risks.map((risk, i) => ({
      type: 'Feature',
      properties: {
        id: building.id,
        base: i * building.floorHeightM,
        top: (i + 1) * building.floorHeightM - 0.5,
        color: FLOOR_COLORS[risk]
      },
      geometry: { type: 'Polygon', coordinates: [ring(building.footprint)] }
    }))
  };
}

export function routeFeature(city: City, route: Route | null | undefined, kind: string): Feature<LineString>[] {
  if (!route || !route.found || route.nodeIds.length < 2) return [];
  const nodes = new Map(city.nodes.map(n => [n.id, n]));
  return [
    {
      type: 'Feature',
      properties: { kind },
      geometry: { type: 'LineString', coordinates: route.nodeIds.map(id => toLngLat(nodes.get(id)!)) }
    }
  ];
}

export function dronePathFeatures(plan: DronePlan | null, flownM: number): { path: FeatureCollection<LineString>; points: FeatureCollection<Point> } {
  if (!plan) return { path: { type: 'FeatureCollection', features: [] }, points: { type: 'FeatureCollection', features: [] } };
  return {
    path: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: plan.path.map(toLngLat) } }] },
    points: {
      type: 'FeatureCollection',
      features: plan.points.map(p => ({
        type: 'Feature',
        properties: { id: p.id, visited: p.atDistanceM <= flownM, order: p.order },
        geometry: { type: 'Point', coordinates: toLngLat(p.position) }
      }))
    }
  };
}
