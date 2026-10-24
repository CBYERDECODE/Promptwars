import { createRng, randInt } from './random';
import type {
  Ambulance,
  Building,
  BuildingUse,
  City,
  Facility,
  IncidentKind,
  RescueTeam,
  RoadEdge,
  RoadNode,
  TwinIncident,
  Vec2
} from './types';

/**
 * Synthetic city generator for the 3D Disaster Twin.
 *
 * "Riverbend" is fictional. A meandering river splits the city into a north and
 * a south bank that are joined by exactly three bridges, which is what makes
 * bridge closures and flood-driven detours meaningful for routing. Terrain is
 * an analytic function (rises away from the river, a low-lying "Lowtown" basin
 * in the south-west, a hill in the north-east), so elevation is reproducible
 * and identical everywhere it is sampled.
 */

export const CITY_SEED = 20261024;
export const FLOOR_HEIGHT_M = 3.2;
export const CELL_SIZE_M = 20;
export const RIVER_HALF_WIDTH_M = 35;

const COLUMN_XS = [-800, -640, -480, -320, -160, 0, 160, 320, 480, 640, 800];
const NORTH_ROWS = [600, 450, 300, 150];
const SOUTH_ROWS = [-150, -300, -450, -600];
const ROW_YS = [...NORTH_ROWS, ...SOUTH_ROWS];

const COLUMN_NAMES = [
  'Alder St', 'Birch St', 'Weir Rd', 'Dogwood St', 'Elm St', 'Mill Rd',
  'Grove St', 'Hazel St', 'Harbor Rd', 'Juniper St', 'Kestrel St'
];
const ROW_NAMES: Record<number, string> = {
  600: 'Summit Ave',
  450: 'Hillcrest Ave',
  300: 'Market Ave',
  150: 'Riverside Dr N',
  [-150]: 'Riverside Dr S',
  [-300]: 'Canal Ave',
  [-450]: 'Foundry Ave',
  [-600]: 'Lowtown Ave'
};

/** Columns (by index) that carry a bridge across the river. */
export const BRIDGES = [
  { col: 2, id: 'bridge-west-weir', name: 'West Weir Bridge', closureLevelM: 3.1 },
  { col: 5, id: 'bridge-mill', name: 'Mill Bridge', closureLevelM: 2.4 },
  { col: 8, id: 'bridge-harbor', name: 'Harbor Bridge', closureLevelM: 4.3 }
] as const;

export const MILL_BRIDGE_ID = 'bridge-mill';

export function riverCenterY(x: number): number {
  return 40 * Math.sin(x / 260) - 20;
}

const gauss = (dx: number, dy: number, sigma: number) => Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));

/** Synthetic ground elevation (m above river datum) at a local point. */
export function terrainElevation(x: number, y: number): number {
  const d = Math.abs(y - riverCenterY(x));
  if (d < RIVER_HALF_WIDTH_M) return -1;
  const base = 0.6 + 6.4 * Math.pow(Math.min(1, d / 600), 0.85);
  const lowtownBasin = -1.6 * gauss(x + 420, y + 380, 170);
  const northEastHill = 2.5 * gauss(x - 480, y - 420, 200);
  const undulation = 0.25 * Math.sin(x / 90) * Math.cos(y / 110);
  // Raised approach embankments at each bridge end.
  let embankment = 0;
  for (const bridge of BRIDGES) {
    const bx = COLUMN_XS[bridge.col];
    embankment = Math.max(embankment, 1.4 * gauss(x - bx, y - 150, 45), 1.4 * gauss(x - bx, y + 150, 45));
  }
  return Math.max(0.2, base + lowtownBasin + northEastHill + undulation + embankment);
}

const nodeId = (col: number, y: number) => `n${col}_${y < 0 ? 's' : 'n'}${Math.abs(y)}`;

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function edgeMinElevation(a: Vec2, b: Vec2): number {
  let min = Infinity;
  const steps = Math.max(2, Math.ceil(distance(a, b) / CELL_SIZE_M));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    min = Math.min(min, terrainElevation(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t));
  }
  return min;
}

function buildRoadNetwork(): { nodes: RoadNode[]; edges: RoadEdge[] } {
  const nodes: RoadNode[] = [];
  const byId = new Map<string, RoadNode>();
  COLUMN_XS.forEach((x, col) => {
    ROW_YS.forEach(y => {
      const node: RoadNode = { id: nodeId(col, y), x, y, elevation: terrainElevation(x, y) };
      nodes.push(node);
      byId.set(node.id, node);
    });
  });

  const edges: RoadEdge[] = [];
  const addEdge = (fromId: string, toId: string, name: string, speedKmh: number, bridge?: RoadEdge['bridge']) => {
    const a = byId.get(fromId)!;
    const b = byId.get(toId)!;
    edges.push({
      id: `e_${fromId}_${toId}`,
      from: fromId,
      to: toId,
      name,
      lengthM: Math.round(distance(a, b)),
      speedKmh,
      elevation: bridge ? 99 : edgeMinElevation(a, b),
      bridge
    });
  };

  // East-west avenues.
  ROW_YS.forEach(y => {
    const arterial = y === 300 || y === -300;
    const riverside = Math.abs(y) === 150;
    for (let col = 0; col < COLUMN_XS.length - 1; col++) {
      addEdge(nodeId(col, y), nodeId(col + 1, y), ROW_NAMES[y], arterial ? 45 : riverside ? 35 : 30);
    }
  });

  // North-south streets, within each bank; across the river only at bridges.
  COLUMN_XS.forEach((_, col) => {
    const arterial = col === 5;
    const speed = arterial ? 45 : 30;
    for (let i = 0; i < NORTH_ROWS.length - 1; i++) {
      addEdge(nodeId(col, NORTH_ROWS[i]), nodeId(col, NORTH_ROWS[i + 1]), COLUMN_NAMES[col], speed);
    }
    for (let i = 0; i < SOUTH_ROWS.length - 1; i++) {
      addEdge(nodeId(col, SOUTH_ROWS[i]), nodeId(col, SOUTH_ROWS[i + 1]), COLUMN_NAMES[col], speed);
    }
    const bridge = BRIDGES.find(b => b.col === col);
    if (bridge) {
      addEdge(nodeId(col, 150), nodeId(col, -150), bridge.name, 35, {
        id: bridge.id,
        name: bridge.name,
        closureLevelM: bridge.closureLevelM
      });
    }
  });

  return { nodes, edges };
}

function nearestNode(nodes: RoadNode[], p: Vec2): RoadNode {
  let best = nodes[0];
  let bestD = Infinity;
  for (const node of nodes) {
    const d = distance(node, p);
    if (d < bestD) {
      bestD = d;
      best = node;
    }
  }
  return best;
}

interface FacilitySpec {
  id: string;
  kind: Facility['kind'];
  name: string;
  /** Block anchor: column index of the west edge and the north row of the block. */
  col: number;
  northY: number;
  capacity: number;
  floors: number;
  use: BuildingUse;
}

const FACILITY_SPECS: FacilitySpec[] = [
  { id: 'fac-hosp-stanne', kind: 'hospital', name: 'St. Anne General Hospital', col: 6, northY: 450, capacity: 220, floors: 7, use: 'hospital' },
  { id: 'fac-hosp-lowtown', kind: 'hospital', name: 'Foundry Community Hospital', col: 3, northY: -450, capacity: 90, floors: 4, use: 'hospital' },
  { id: 'fac-shel-hillcrest', kind: 'shelter', name: 'Hillcrest School Shelter', col: 7, northY: 600, capacity: 350, floors: 3, use: 'school' },
  { id: 'fac-shel-civic', kind: 'shelter', name: 'Riverbend Civic Centre Shelter', col: 2, northY: 450, capacity: 500, floors: 4, use: 'shelter' },
  { id: 'fac-shel-foundry', kind: 'shelter', name: 'Foundry Hall Shelter', col: 7, northY: -450, capacity: 260, floors: 2, use: 'shelter' },
  { id: 'fac-fire-1', kind: 'fire_station', name: 'Fire Station 1 — Market Ave', col: 4, northY: 300, capacity: 3, floors: 2, use: 'fire_station' },
  { id: 'fac-fire-2', kind: 'fire_station', name: 'Fire Station 2 — Canal Ave', col: 5, northY: -300, capacity: 2, floors: 2, use: 'fire_station' }
];

const PARK_BLOCKS: Array<{ col: number; northY: number }> = [
  { col: 4, northY: 600 },
  { col: 8, northY: -300 }
];

function blockRows(): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < NORTH_ROWS.length - 1; i++) pairs.push([NORTH_ROWS[i], NORTH_ROWS[i + 1]]);
  for (let i = 0; i < SOUTH_ROWS.length - 1; i++) pairs.push([SOUTH_ROWS[i], SOUTH_ROWS[i + 1]]);
  return pairs;
}

function rect(x0: number, y0: number, x1: number, y1: number): Vec2[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 }
  ];
}

function footprintArea(fp: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < fp.length; i++) {
    const p = fp[i];
    const q = fp[(i + 1) % fp.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

function estimateOccupants(use: BuildingUse, floors: number, area: number): number {
  switch (use) {
    case 'residential':
      return Math.round(((floors * area) / 95) * 2.3 * 0.85);
    case 'commercial':
      return Math.round(((floors * area) / 25) * 0.45);
    case 'industrial':
      return Math.round(area / 150);
    case 'hospital':
      return Math.round((floors * area) / 40);
    case 'school':
      return Math.round((floors * area) / 30);
    case 'fire_station':
      return 12;
    case 'shelter':
      return Math.round((floors * area) / 60);
  }
}

function buildBuildings(nodes: RoadNode[]): { buildings: Building[]; facilities: Facility[]; parks: Vec2[][] } {
  const rng = createRng(CITY_SEED);
  const buildings: Building[] = [];
  const facilities: Facility[] = [];
  const parks: Vec2[][] = [];
  let counter = 1;

  for (const [northY, southY] of blockRows()) {
    for (let col = 0; col < COLUMN_XS.length - 1; col++) {
      const x0 = COLUMN_XS[col] + 14;
      const x1 = COLUMN_XS[col + 1] - 14;
      const yTop = northY - 14;
      const yBottom = southY + 14;

      if (PARK_BLOCKS.some(p => p.col === col && p.northY === northY)) {
        parks.push(rect(x0, yBottom, x1, yTop));
        continue;
      }

      const facility = FACILITY_SPECS.find(f => f.col === col && f.northY === northY);
      const midX = (x0 + x1) / 2;
      const midY = (yTop + yBottom) / 2;
      const lots: Array<[number, number, number, number]> = [
        [x0, midY, midX, yTop],
        [midX, midY, x1, yTop],
        [x0, yBottom, midX, midY],
        [midX, yBottom, x1, midY]
      ];

      lots.forEach((lot, lotIndex) => {
        const isFacility = facility && lotIndex === 0;
        if (!isFacility && rng() < 0.12) return; // vacant lot
        const inset = isFacility ? 3 : 4 + rng() * 7;
        const [lx0, ly0, lx1, ly1] = lot;
        const footprint = isFacility
          ? rect(lx0 + inset, ly0 + inset, lx1 + (x1 - lx1) * 0.6, ly1 - inset)
          : rect(lx0 + inset, ly0 + inset, lx1 - inset - rng() * 6, ly1 - inset - rng() * 6);
        const centroid = {
          x: footprint.reduce((s, p) => s + p.x, 0) / footprint.length,
          y: footprint.reduce((s, p) => s + p.y, 0) / footprint.length
        };

        let use: BuildingUse;
        let floors: number;
        if (isFacility) {
          use = facility.use;
          floors = facility.floors;
        } else {
          const downtown = Math.exp(-((centroid.x) ** 2 + (centroid.y - 300) ** 2) / (2 * 280 ** 2));
          const industrialZone = centroid.x > 300 && centroid.y < -300;
          if (industrialZone) {
            use = 'industrial';
            floors = randInt(rng, 1, 2);
          } else if (downtown > 0.45 && rng() < 0.7) {
            use = 'commercial';
            floors = Math.max(3, Math.round(4 + 16 * downtown * (0.5 + rng())));
          } else {
            use = 'residential';
            floors = Math.max(1, Math.round(2 + 6 * downtown + rng() * 4));
          }
        }

        const elevation = Math.min(...[...footprint, centroid].map(p => terrainElevation(p.x, p.y)));
        const node = nearestNode(nodes, centroid);
        const id = `BLD-${String(counter++).padStart(3, '0')}`;
        const area = footprintArea(footprint);
        const building: Building = {
          id,
          footprint,
          centroid,
          floors,
          floorHeightM: FLOOR_HEIGHT_M,
          heightM: floors * FLOOR_HEIGHT_M,
          use,
          occupants: estimateOccupants(use, floors, area),
          elevation: Math.round(elevation * 100) / 100,
          nodeId: node.id,
          name: isFacility ? facility.name : undefined
        };
        buildings.push(building);
        if (isFacility) {
          facilities.push({
            id: facility.id,
            kind: facility.kind,
            name: facility.name,
            buildingId: id,
            nodeId: node.id,
            position: centroid,
            capacity: facility.capacity
          });
        }
      });
    }
  }

  return { buildings, facilities, parks };
}

function buildRiver(): Vec2[] {
  const north: Vec2[] = [];
  const south: Vec2[] = [];
  for (let x = -900; x <= 900; x += 30) {
    const cy = riverCenterY(x);
    north.push({ x, y: cy + RIVER_HALF_WIDTH_M });
    south.push({ x, y: cy - RIVER_HALF_WIDTH_M });
  }
  return [...north, ...south.reverse()];
}

const INCIDENT_SPECS: Array<{
  label: string;
  kind: IncidentKind;
  title: string;
  description: string;
  severity: TwinIncident['severity'];
  people: number;
  target: Vec2;
  createdAtMin: number;
}> = [
  {
    label: 'A',
    kind: 'trapped_occupants',
    title: 'Residents trapped above flooded ground floor',
    description: 'Synthetic report: 14 residents sheltering on upper floors; ground-floor entrance under water.',
    severity: 5,
    people: 14,
    target: { x: -113, y: -197 },
    createdAtMin: 5
  },
  {
    label: 'B',
    kind: 'medical',
    title: 'Elderly resident with chest pain',
    description: 'Synthetic report: one patient, conscious; caller says the street outside is starting to flood.',
    severity: 4,
    people: 1,
    target: { x: -420, y: -340 },
    createdAtMin: 10
  },
  {
    label: 'C',
    kind: 'structural',
    title: 'Basement wall cracking after water ingress',
    description: 'Synthetic report: warehouse staff report cracking in a basement wall; building partially evacuated.',
    severity: 3,
    people: 6,
    target: { x: 240, y: -220 },
    createdAtMin: 15
  },
  {
    label: 'D',
    kind: 'evacuation',
    title: 'Care home requests assisted evacuation',
    description: 'Synthetic report: 28 residents with limited mobility; staff request transport before access is lost.',
    severity: 4,
    people: 28,
    target: { x: -560, y: -420 },
    createdAtMin: 35
  },
  {
    label: 'E',
    kind: 'fire',
    title: 'Electrical fire near flooded substation',
    description: 'Synthetic report: smoke from a ground-floor plant room; power to the block is intermittent.',
    severity: 3,
    people: 9,
    target: { x: 160, y: 230 },
    createdAtMin: 35
  },
  {
    label: 'F',
    kind: 'trapped_occupants',
    title: 'Family trapped in single-storey unit',
    description: 'Synthetic report: six people including two children; water reported at window height.',
    severity: 5,
    people: 6,
    target: { x: 685, y: -197 },
    createdAtMin: 60
  }
];

function buildIncidents(buildings: Building[], nodes: RoadNode[]): TwinIncident[] {
  const used = new Set<string>();
  return INCIDENT_SPECS.map(spec => {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of buildings) {
      if (used.has(b.id) || b.use === 'hospital' || b.use === 'shelter' || b.use === 'fire_station') continue;
      const d = distance(b.centroid, spec.target);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    const building = best!;
    used.add(building.id);
    // Crews approach from the highest nearby intersection (the "dry side").
    const access = nodes
      .filter(n => distance(n, building.centroid) < 200 && Math.sign(n.y) === Math.sign(building.centroid.y))
      .sort((a, b) => b.elevation - a.elevation)[0] ?? nodes.find(n => n.id === building.nodeId)!;
    return {
      id: `INC-${spec.label}`,
      label: spec.label,
      kind: spec.kind,
      title: spec.title,
      description: spec.description,
      severity: spec.severity,
      peopleAffected: spec.people,
      buildingId: building.id,
      nodeId: access.id,
      position: building.centroid,
      createdAtMin: spec.createdAtMin
    };
  });
}

function buildAmbulances(nodes: RoadNode[], facilities: Facility[]): Ambulance[] {
  const at = (id: string) => {
    const n = nodes.find(node => node.id === id)!;
    return { nodeId: n.id, position: { x: n.x, y: n.y } };
  };
  const facilityNode = (id: string) => {
    const f = facilities.find(fac => fac.id === id)!;
    return at(f.nodeId);
  };
  return [
    { id: 'AMB-1', callSign: 'AMB-1', status: 'available', base: 'St. Anne General Hospital', ...facilityNode('fac-hosp-stanne') },
    { id: 'AMB-2', callSign: 'AMB-2', status: 'available', base: 'Fire Station 1 — Market Ave', ...facilityNode('fac-fire-1') },
    { id: 'AMB-3', callSign: 'AMB-3', status: 'available', base: 'Civic Centre standby post', ...at(nodeId(1, 450)) },
    { id: 'AMB-4', callSign: 'AMB-4', status: 'unavailable', base: 'Foundry Community Hospital (committed to a patient transfer)', ...facilityNode('fac-hosp-lowtown') },
    { id: 'AMB-5', callSign: 'AMB-5', status: 'available', base: 'Summit Ave standby post', ...at(nodeId(9, 600)) }
  ];
}

function buildRescueTeams(nodes: RoadNode[]): RescueTeam[] {
  const at = (id: string) => {
    const n = nodes.find(node => node.id === id)!;
    return { nodeId: n.id, position: { x: n.x, y: n.y } };
  };
  return [
    { id: 'TEAM-BOAT-1', name: 'Swift-water Boat Team 1', capability: 'Shallow-water boat rescue', ...at(nodeId(3, 300)) },
    { id: 'TEAM-USAR-B', name: 'USAR Team Bravo', capability: 'Structural search and rescue', ...at(nodeId(7, 300)) },
    { id: 'TEAM-RECON', name: 'Drone & Recon Cell', capability: 'Virtual drone launch site', ...at(nodeId(5, 450)) }
  ];
}

let cachedCity: City | null = null;

/** Build (once) and return the reproducible synthetic city. */
export function getCity(): City {
  if (cachedCity) return cachedCity;
  const { nodes, edges } = buildRoadNetwork();
  const { buildings, facilities, parks } = buildBuildings(nodes);
  const incidents = buildIncidents(buildings, nodes);
  // Riverside parks between the river and the riverside drives.
  for (let col = 0; col < COLUMN_XS.length - 1; col++) {
    const x0 = COLUMN_XS[col] + 14;
    const x1 = COLUMN_XS[col + 1] - 14;
    const northEdge = Math.max(riverCenterY(x0), riverCenterY(x1)) + RIVER_HALF_WIDTH_M + 12;
    const southEdge = Math.min(riverCenterY(x0), riverCenterY(x1)) - RIVER_HALF_WIDTH_M - 12;
    if (northEdge < 136) parks.push(rect(x0, northEdge, x1, 136));
    if (southEdge > -136) parks.push(rect(x0, -136, x1, southEdge));
  }
  cachedCity = {
    name: 'Riverbend (fictional)',
    seed: CITY_SEED,
    extent: { minX: -840, maxX: 840, minY: -640, maxY: 640 },
    nodes,
    edges,
    buildings,
    facilities,
    ambulances: buildAmbulances(nodes, facilities),
    rescueTeams: buildRescueTeams(nodes),
    incidents,
    parks,
    river: buildRiver(),
    cellSizeM: CELL_SIZE_M
  };
  return cachedCity;
}
