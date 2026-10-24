/**
 * Types for the ResQ AI 3D Disaster Digital Twin.
 *
 * Everything in this module is SYNTHETIC. The city, its terrain, its buildings,
 * its residents and its incidents are generated from a fixed seed so every run
 * of the twin is reproducible. Nothing here describes a real place, and nothing
 * here can dispatch a real resource.
 */

/** Local planar coordinates in metres, origin at the city centre, +y = north. */
export interface Vec2 {
  x: number;
  y: number;
}

export interface RoadNode extends Vec2 {
  id: string;
  /** Ground elevation in metres above the river datum (synthetic). */
  elevation: number;
}

export interface RoadEdge {
  id: string;
  from: string;
  to: string;
  name: string;
  lengthM: number;
  /** Free-flow emergency-vehicle speed in km/h. */
  speedKmh: number;
  /** Lowest synthetic ground elevation sampled along the segment. */
  elevation: number;
  bridge?: BridgeInfo;
}

export interface BridgeInfo {
  id: string;
  name: string;
  /** Water level (m) at which the simulation rules close the bridge deck. */
  closureLevelM: number;
}

export type BuildingUse = 'residential' | 'commercial' | 'hospital' | 'shelter' | 'fire_station' | 'school' | 'industrial';

export interface Building {
  id: string;
  /** Footprint ring in local metres (closed implicitly). */
  footprint: Vec2[];
  centroid: Vec2;
  floors: number;
  floorHeightM: number;
  heightM: number;
  use: BuildingUse;
  /** Synthetic occupant estimate (daytime). */
  occupants: number;
  /** Ground elevation at the footprint (m above river datum). */
  elevation: number;
  /** Nearest routable road node. */
  nodeId: string;
  /** Display name, set for facilities. */
  name?: string;
}

export type FacilityKind = 'hospital' | 'shelter' | 'fire_station';

export interface Facility {
  id: string;
  kind: FacilityKind;
  name: string;
  buildingId: string;
  nodeId: string;
  position: Vec2;
  /** Beds for hospitals, people for shelters, appliances for fire stations. */
  capacity: number;
}

export type AmbulanceStatus = 'available' | 'unavailable';

export interface Ambulance {
  id: string;
  callSign: string;
  nodeId: string;
  position: Vec2;
  status: AmbulanceStatus;
  base: string;
}

export interface RescueTeam {
  id: string;
  name: string;
  capability: string;
  nodeId: string;
  position: Vec2;
}

export type IncidentKind = 'trapped_occupants' | 'medical' | 'fire' | 'structural' | 'evacuation';

export interface TwinIncident {
  id: string;
  /** Short letter label used in the UI and by the copilot: "A", "B", ... */
  label: string;
  kind: IncidentKind;
  title: string;
  description: string;
  severity: 1 | 2 | 3 | 4 | 5;
  peopleAffected: number;
  buildingId: string;
  nodeId: string;
  position: Vec2;
  /** Minute of the replay timeline at which this incident is created. */
  createdAtMin: number;
}

export interface City {
  name: string;
  seed: number;
  extent: { minX: number; maxX: number; minY: number; maxY: number };
  nodes: RoadNode[];
  edges: RoadEdge[];
  buildings: Building[];
  facilities: Facility[];
  ambulances: Ambulance[];
  rescueTeams: RescueTeam[];
  incidents: TwinIncident[];
  parks: Vec2[][];
  /** River polygon (normal flow) in local metres. */
  river: Vec2[];
  /** Flood grid resolution in metres. */
  cellSizeM: number;
}
