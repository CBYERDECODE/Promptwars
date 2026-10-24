/**
 * SIMULATED demonstration dataset — "Riverbend" flood exercise.
 *
 * ⚠️  EVERY VALUE IN THIS FILE IS FICTIONAL.
 * The city, neighbourhoods, road times, populations, units, reports and
 * incidents are synthetic and exist only to demonstrate the deterministic
 * engines. Nothing here describes a real place, and nothing here may be
 * presented to a user as a real-world prediction.
 *
 * Scenario (as used by the guided demo):
 *   A severe flood affects five neighbourhoods. Reports concentrate in three of
 *   them; two neighbourhoods look quiet. Quiet is NOT safe: one of them has a
 *   critical incident but almost no reports reaching the coordinator, and the
 *   other has no reports at all.
 */

import {
  GraphEdge,
  GraphNode,
  SimIncident,
  SimReport,
  SimUnit,
  SimZone,
  SimulationDataset
} from './rescue.js';

export const SIMULATION_LABEL = 'SIMULATED — Riverbend flood exercise';
export const SIMULATION_CITY = 'Riverbend (fictional)';

/* ------------------------------------------------------------------ */
/* Road graph (normalised 0..100 coordinates for the SVG map)          */
/* ------------------------------------------------------------------ */

const NODES: GraphNode[] = [
  { id: 'riverside', label: 'Riverside Flats', x: 15, y: 78 },
  { id: 'oldmill', label: 'Old Mill District', x: 46, y: 82 },
  { id: 'hospital', label: 'South General Hospital', x: 62, y: 88 },
  { id: 'centraldepot', label: 'Central Depot', x: 52, y: 58 },
  { id: 'marketrow', label: 'Market Row', x: 54, y: 50 },
  { id: 'northgate', label: 'Northgate', x: 74, y: 20 },
  { id: 'hilltopdepot', label: 'Hilltop Depot', x: 80, y: 64 },
  { id: 'junction', label: 'Midtown Junction', x: 40, y: 40 },
  { id: 'cedarridge', label: 'Cedar Ridge Road', x: 10, y: 42 },
  { id: 'cedarhollow', label: 'Cedar Hollow', x: 16, y: 22 },
  { id: 'westdepot', label: 'West Depot', x: 24, y: 46 }
];

/**
 * Modelled travel times in minutes. Undirected unless `one_way` is set.
 *
 * TOPOLOGY NOTE: West Depot, Riverside Flats, Cedar Ridge Road and Cedar Hollow
 * sit on the west bank. "Mill Bridge" (West Depot ↔ Midtown Junction) is the
 * ONLY link to the rest of the city — this is the segment the demo's
 * road-closure toggle removes, and removing it strands the west bank.
 */
const EDGES: GraphEdge[] = [
  { from: 'westdepot', to: 'junction', minutes: 7, label: 'Mill Bridge' },
  { from: 'westdepot', to: 'riverside', minutes: 9, label: 'Riverside Approach' },
  { from: 'westdepot', to: 'cedarridge', minutes: 6, label: 'Cedar Ridge Link' },
  { from: 'cedarridge', to: 'cedarhollow', minutes: 5, label: 'Hollow Lane' },
  { from: 'cedarridge', to: 'riverside', minutes: 12, label: 'Flooded River Lane' },
  { from: 'junction', to: 'marketrow', minutes: 6, label: 'Market Approach' },
  { from: 'junction', to: 'centraldepot', minutes: 5, label: 'Depot Spur' },
  { from: 'marketrow', to: 'centraldepot', minutes: 7, label: 'Row Service Road' },
  { from: 'marketrow', to: 'northgate', minutes: 9, label: 'Northgate Road' },
  { from: 'marketrow', to: 'hilltopdepot', minutes: 5, label: 'Hilltop Cut' },
  { from: 'hilltopdepot', to: 'northgate', minutes: 8, label: 'Hilltop Bypass' },
  { from: 'centraldepot', to: 'hospital', minutes: 6, label: 'Depot Hospital Link' },
  { from: 'hospital', to: 'oldmill', minutes: 8, label: 'Hospital Street' },
  { from: 'hilltopdepot', to: 'hospital', minutes: 9, label: 'Hilltop Road' }
];

/**
 * Scenario toggle key for the Mill Bridge. Edge keys are direction-independent
 * and alphabetical, so `westdepot ↔ junction` normalises to this value.
 */
export const MILL_BRIDGE_EDGE_KEY = 'junction|westdepot';

/* ------------------------------------------------------------------ */
/* Neighbourhoods                                                      */
/* ------------------------------------------------------------------ */

const ZONES: SimZone[] = [
  {
    id: 'z-riverside',
    name: 'Riverside Flats',
    population: 4200,
    expected_reports_per_hour: 1.6,
    centroid_node: 'riverside',
    polygon: [
      { x: 8, y: 70 },
      { x: 24, y: 70 },
      { x: 24, y: 86 },
      { x: 8, y: 86 }
    ],
    connectivity: 0.45,
    road_access: 0.4
  },
  {
    id: 'z-oldmill',
    name: 'Old Mill District',
    population: 3100,
    expected_reports_per_hour: 2.4,
    centroid_node: 'oldmill',
    polygon: [
      { x: 38, y: 74 },
      { x: 54, y: 74 },
      { x: 54, y: 90 },
      { x: 38, y: 90 }
    ],
    connectivity: 0.6,
    road_access: 0.55
  },
  {
    id: 'z-northgate',
    name: 'Northgate',
    population: 5200,
    expected_reports_per_hour: 3,
    centroid_node: 'northgate',
    polygon: [
      { x: 66, y: 12 },
      { x: 82, y: 12 },
      { x: 82, y: 28 },
      { x: 66, y: 28 }
    ],
    connectivity: 0.9,
    road_access: 0.9
  },
  {
    id: 'z-marketrow',
    name: 'Market Row',
    population: 6100,
    expected_reports_per_hour: 3.2,
    centroid_node: 'marketrow',
    polygon: [
      { x: 46, y: 42 },
      { x: 62, y: 42 },
      { x: 62, y: 58 },
      { x: 46, y: 58 }
    ],
    connectivity: 0.85,
    road_access: 0.8
  },
  {
    id: 'z-cedarhollow',
    name: 'Cedar Hollow',
    population: 2600,
    expected_reports_per_hour: 1.2,
    centroid_node: 'cedarhollow',
    polygon: [
      { x: 8, y: 14 },
      { x: 24, y: 14 },
      { x: 24, y: 30 },
      { x: 8, y: 30 }
    ],
    connectivity: 0.35,
    road_access: 0.35
  }
];

/* ------------------------------------------------------------------ */
/* Responding units (3 ambulances + 2 rescue teams)                    */
/* ------------------------------------------------------------------ */

const UNITS: SimUnit[] = [
  { id: 'amb-1', label: 'Ambulance A1', type: 'AMBULANCE', home_node: 'westdepot', status: 'AVAILABLE' },
  { id: 'amb-2', label: 'Ambulance A2', type: 'AMBULANCE', home_node: 'centraldepot', status: 'AVAILABLE' },
  { id: 'amb-3', label: 'Ambulance A3', type: 'AMBULANCE', home_node: 'hilltopdepot', status: 'AVAILABLE' },
  { id: 'rt-1', label: 'Rescue Team R1', type: 'RESCUE_TEAM', home_node: 'westdepot', status: 'AVAILABLE' },
  { id: 'rt-2', label: 'Rescue Team R2', type: 'RESCUE_TEAM', home_node: 'centraldepot', status: 'AVAILABLE' }
];

/* ------------------------------------------------------------------ */
/* Emergencies — five flooded neighbourhoods                           */
/* ------------------------------------------------------------------ */

/**
 * Stored in ascending id order so snapshots, diffs and replays compare
 * cleanly; nothing downstream depends on this order (every engine sorts
 * explicitly), but keeping it sorted makes the fixture reviewable.
 */
const INCIDENTS: SimIncident[] = [
  {
    id: 'inc-marketrow-square',
    zone_id: 'z-marketrow',
    node_id: 'marketrow',
    severity: 'High',
    title: 'Market square flooded, stallholders stranded',
    people_at_risk: 6,
    reported_at: '2026-09-12T06:08:00.000Z'
  },
  {
    id: 'inc-marketrow-subway',
    zone_id: 'z-marketrow',
    node_id: 'marketrow',
    severity: 'High',
    title: 'Pedestrian subway flooded with people sheltering below ground',
    people_at_risk: 4,
    reported_at: '2026-09-12T06:24:00.000Z'
  },
  {
    id: 'inc-northgate',
    zone_id: 'z-northgate',
    node_id: 'northgate',
    severity: 'Critical',
    title: 'Apartment block flooding, residents sheltering on upper floors',
    people_at_risk: 24,
    reported_at: '2026-09-12T06:15:00.000Z'
  },
  {
    id: 'inc-oldmill',
    zone_id: 'z-oldmill',
    node_id: 'oldmill',
    severity: 'High',
    title: 'Mill levee breached, water entering riverside cottages',
    people_at_risk: 12,
    reported_at: '2026-09-12T06:43:00.000Z'
  },
  {
    id: 'inc-riverside',
    zone_id: 'z-riverside',
    node_id: 'riverside',
    severity: 'Critical',
    title: 'Care home cut off by floodwater, staff request urgent evacuation',
    people_at_risk: 30,
    reported_at: '2026-09-12T06:31:00.000Z'
  }
];

/* ------------------------------------------------------------------ */
/* Incoming reports                                                    */
/* ------------------------------------------------------------------ */

interface ReportSeed {
  zone_id: string;
  node_id: string;
  summaries: string[];
}

/**
 * Report volume is deliberately uneven: three neighbourhoods generate almost
 * all traffic, Riverside Flats barely gets a message through, and Cedar Hollow
 * is completely silent. Silence is modelled as a DATA GAP, never as safety.
 */
const REPORT_SEEDS: ReportSeed[] = [
  {
    zone_id: 'z-riverside',
    node_id: 'riverside',
    summaries: ['Water is reaching the ground floor on Mill Lane and still rising.']
  },
  {
    zone_id: 'z-oldmill',
    node_id: 'oldmill',
    summaries: [
      'Mill race is overflowing into the yard.',
      'Basement of the old mill house is flooded.',
      'Water is up to the kerb on Foundry Street.',
      'Drain covers are lifting on Kiln Road.',
      'The garage on Weir Street is under water.',
      'Levee path is submerged near the mill.',
      'Cellar flooding reported on Cooper\u2019s Row.',
      'Standing water across the mill car park.',
      'River gauge behind the mill is rising fast.'
    ]
  },
  {
    zone_id: 'z-northgate',
    node_id: 'northgate',
    summaries: [
      'Surface flooding on Northgate Hill Road.',
      'The ring road underpass is holding water.',
      'Basement car park is taking on water.',
      'Water is pooling around the shopping parade.',
      'Storm drain is backing up near the clinic.',
      'Floodwater across the northbound carriageway.',
      'Garden flooding on Elm Rise.',
      'The dip by the school needs closing to traffic.',
      'Water is entering the community hall.',
      'Puddles are spreading across the school crossing.',
      'A gully is blocked and water is rising on the corner.'
    ]
  },
  {
    zone_id: 'z-marketrow',
    node_id: 'marketrow',
    summaries: [
      'Water is knee-deep in the market subway.',
      'A stranded car has its hazard lights on in the subway.',
      'The cellar bar on Market Row is flooding.',
      'Water is flowing down the steps to the row.',
      'Shop doorway sandbags are being overtopped.',
      'The bus stop is flooded and passengers are on the kerb.',
      'Storm drain is overflowing outside the arcade.',
      'Floodwater is reaching the market square.',
      'A van has stalled in standing water on the row.',
      'Water is lapping over the loading bay.',
      'A grit bin is floating on the corner.',
      'Water is rising in the pedestrian subway.'
    ]
  }
  // z-cedarhollow intentionally has no reports at all.
];

const REPORT_WINDOW_START_MS = Date.parse('2026-09-12T05:40:00.000Z');
const REPORT_INTERVAL_MS = 4 * 60 * 1000;

function buildReports(): SimReport[] {
  const reports: SimReport[] = [];
  let index = 0;
  for (const seed of REPORT_SEEDS) {
    for (const summary of seed.summaries) {
      reports.push({
        id: `rep-${String(index + 1).padStart(3, '0')}`,
        zone_id: seed.zone_id,
        node_id: seed.node_id,
        reported_at: new Date(REPORT_WINDOW_START_MS + index * REPORT_INTERVAL_MS).toISOString(),
        summary
      });
      index += 1;
    }
  }
  return reports;
}

const REPORTS = buildReports();

export const SIMULATED_FLOOD_DATASET: SimulationDataset = {
  is_simulated: true,
  label: SIMULATION_LABEL,
  city: SIMULATION_CITY,
  sla_minutes: 12,
  graph: { nodes: NODES, edges: EDGES },
  zones: ZONES,
  units: UNITS,
  incidents: INCIDENTS,
  reports: REPORTS
};

/**
 * Return an independent copy so callers (API handlers, scenarios, tests) can
 * never mutate the shared constant. The dataset is plain JSON by construction.
 */
export function getSimulatedDataset(): SimulationDataset {
  return JSON.parse(JSON.stringify(SIMULATED_FLOOD_DATASET)) as SimulationDataset;
}

/** Convenience lookup used by the API and the UI. */
export function findZoneName(dataset: SimulationDataset, zoneId: string): string {
  return dataset.zones.find((zone) => zone.id === zoneId)?.name ?? zoneId;
}
