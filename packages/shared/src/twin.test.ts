import { describe, it, expect } from 'vitest';
import {
  TWIN_DEMO_STEPS,
  TWIN_DEMO_TITLE,
  TWIN_DRONE_MAX_STOPS,
  TWIN_DRONE_WEIGHTS,
  TWIN_LABEL,
  TWIN_MAX_WATER_LEVEL_M,
  TWIN_NOTICE,
  TWIN_ROAD_FREEBOARD_M,
  answerTwinCopilot,
  assessTwinFlood,
  buildTwinTimeline,
  compareTwinRoutes,
  generateTwinCity,
  getTwinBuildingIntelligence,
  planTwinDroneMission,
  planTwinRoute,
  resolveTwinIncident,
  type TwinCity,
  type TwinCopilotContext,
  type TwinRoute
} from './twin.js';
import { MILL_BRIDGE_EDGE_KEY } from './simulation.js';

const city = generateTwinCity();

/** Flood at a given modelled water level, with the default scenario toggles. */
function floodAt(water: number) {
  return assessTwinFlood(city, water);
}

/** Build a copilot context from the engines, mirroring what the UI passes in. */
function copilotContext(waterLevel = 2.4, extraBlocked: string[] = []): TwinCopilotContext {
  const flood = assessTwinFlood(city, waterLevel, extraBlocked);
  const timeline = buildTwinTimeline(city);
  const mission = planTwinDroneMission(city, flood);
  const routes: TwinRoute[] = city.units
    .map(unit => planTwinRoute(city, flood, unit.id, city.incidents[0].id))
    .filter((route): route is TwinRoute => route !== null);
  return {
    city,
    flood,
    timeline,
    routes,
    mission,
    selectedBuildingId: city.buildings[0].id,
    baselineRoute: null,
    updatedRoute: null
  };
}

/**
 * A hand-built route used to exercise the comparison branches directly, without
 * depending on which edges the generated topology happens to prefer.
 */
function makeRoute(overrides: Partial<TwinRoute> = {}): TwinRoute {
  const path = overrides.path ?? ['centraldepot', 'junction'];
  return {
    signature: 'test',
    unit_id: 'amb-2',
    unit_label: 'Ambulance A2',
    incident_id: 'inc-riverside',
    incident_title: 'Care home cut off by floodwater, staff request urgent evacuation',
    severity: 'Critical',
    from_node: path[0],
    to_node: path[path.length - 1],
    minutes: 14,
    path,
    geometry: [],
    reachable: true,
    within_sla: true,
    blocked_edge_keys: [],
    reasons: [],
    ...overrides
  };
}

describe('Twin — synthetic labelling', () => {
  it('labels every artefact a SIMULATED exercise', () => {
    expect(TWIN_LABEL.startsWith('SIMULATED')).toBe(true);
    expect(TWIN_NOTICE.toLowerCase()).toContain('synthetic');
    // The safety guarantee must be explicit in the shipped notice.
    expect(TWIN_NOTICE.toLowerCase()).toContain('dispatches nothing');

    expect(city.is_simulated).toBe(true);
    expect(city.label).toBe(TWIN_LABEL);
    expect(floodAt(1).is_simulated).toBe(true);
    expect(buildTwinTimeline(city).is_simulated).toBe(true);
    expect(planTwinDroneMission(city, floodAt(1)).is_simulated).toBe(true);
  });

  it('publishes the explicit model constants the UI renders', () => {
    expect(TWIN_MAX_WATER_LEVEL_M).toBe(5);
    expect(TWIN_ROAD_FREEBOARD_M).toBe(0.25);
    const weightSum =
      TWIN_DRONE_WEIGHTS.severity + TWIN_DRONE_WEIGHTS.proximity + TWIN_DRONE_WEIGHTS.coverageGap;
    expect(Math.round(weightSum * 100) / 100).toBe(1);
  });
});

describe('Twin — procedural city generation', () => {
  it('is byte-identical across repeated generations (fixed seed)', () => {
    expect(JSON.stringify(generateTwinCity())).toBe(JSON.stringify(generateTwinCity()));
  });

  it('returns an isolated copy so callers cannot mutate the shared dataset', () => {
    const a = generateTwinCity();
    const b = generateTwinCity();
    a.buildings[0].floors = 999;
    a.graph.edges[0].minutes = 999;
    expect(b.buildings[0].floors).not.toBe(999);
    expect(b.graph.edges[0].minutes).not.toBe(999);
  });

  it('lays out a district-scale skyline with the road network it routes over', () => {
    expect(city.graph.nodes).toHaveLength(11);
    expect(city.graph.edges).toHaveLength(14);
    expect(city.buildings.length).toBeGreaterThanOrEqual(60);
    expect(city.sla_minutes).toBe(12);
  });

  it('anchors the required landmark categories in the scene', () => {
    const categories = new Set(city.buildings.map(building => building.category));
    for (const required of ['HOSPITAL', 'SHELTER', 'FIRE_STATION', 'SCHOOL', 'RESIDENTIAL', 'COMMERCIAL']) {
      expect(categories.has(required as never)).toBe(true);
    }
    expect(city.buildings.find(building => building.category === 'HOSPITAL')?.label).toBe(
      'South General Hospital'
    );
  });

  it('gives every building a positive height, footprint and modelled occupancy', () => {
    for (const building of city.buildings) {
      expect(building.floors).toBeGreaterThan(0);
      expect(building.floor_height_m).toBeGreaterThan(0);
      expect(building.width).toBeGreaterThan(0);
      expect(building.depth).toBeGreaterThan(0);
      expect(building.occupants).toBeGreaterThan(0);
      expect(city.graph.nodes.some(node => node.id === building.node_id)).toBe(true);
    }
  });
});

describe('Twin — Feature 1: dynamic flood simulation', () => {
  it('is deterministic for a given water level', () => {
    expect(JSON.stringify(floodAt(2.4))).toBe(JSON.stringify(floodAt(2.4)));
  });

  it('clamps the slider to the documented 0..5 m band', () => {
    expect(floodAt(-3).water_level_m).toBe(0);
    expect(floodAt(99).water_level_m).toBe(TWIN_MAX_WATER_LEVEL_M);
  });

  it('leaves the modelled city dry and fully drivable at 0 m', () => {
    const flood = floodAt(0);
    expect(flood.stats.buildings_exposed).toBe(0);
    expect(flood.stats.exposed_occupants).toBe(0);
    expect(flood.stats.roads_impassable).toBe(0);
    expect(flood.blocked_edge_keys).toHaveLength(0);
    for (const building of flood.buildings) expect(building.water_depth_m).toBe(0);
  });

  it('never reports less exposure as the water rises (monotonic)', () => {
    let previousBuildings = -1;
    let previousOccupants = -1;
    for (const water of [0, 1, 2, 2.4, 3, 3.6, 4.3, 5]) {
      const flood = floodAt(water);
      expect(flood.stats.buildings_exposed).toBeGreaterThanOrEqual(previousBuildings);
      expect(flood.stats.exposed_occupants).toBeGreaterThanOrEqual(previousOccupants);
      previousBuildings = flood.stats.buildings_exposed;
      previousOccupants = flood.stats.exposed_occupants;
    }
    expect(previousBuildings).toBeGreaterThan(0);
    expect(previousOccupants).toBeGreaterThan(0);
  });

  it('floods a building ground floor only once water overtops its ground elevation', () => {
    const low = city.buildings.find(building => building.ground_elevation_m <= 1.7);
    expect(low).toBeDefined();
    const dry = assessTwinFlood(city, low!.ground_elevation_m).buildings.find(
      b => b.building_id === low!.id
    );
    const wet = assessTwinFlood(city, low!.ground_elevation_m + 1).buildings.find(
      b => b.building_id === low!.id
    );
    expect(dry?.flooded_floors).toBe(0);
    expect(dry?.exposure).toBe('NONE');
    expect(wet?.flooded_floors).toBeGreaterThan(0);
    expect(wet?.water_depth_m).toBeGreaterThan(0);
  });

  it('applies the freeboard rule to the bridge deck at the documented threshold', () => {
    // Mill Bridge models a 3.2 m deck; with a 0.25 m freeboard it closes above 3.45 m.
    const passable = floodAt(3.2 + TWIN_ROAD_FREEBOARD_M);
    const impassable = floodAt(3.2 + TWIN_ROAD_FREEBOARD_M + 0.1);

    expect(passable.blocked_edge_keys).not.toContain(MILL_BRIDGE_EDGE_KEY);
    expect(impassable.blocked_edge_keys).toContain(MILL_BRIDGE_EDGE_KEY);

    const road = impassable.roads.find(candidate => candidate.edge_key === MILL_BRIDGE_EDGE_KEY);
    expect(road?.accessible).toBe(false);
    expect(road?.reason).toContain('freeboard');
  });

  it('honours an explicit scenario closure on top of the flood', () => {
    const flood = assessTwinFlood(city, 0, [MILL_BRIDGE_EDGE_KEY]);
    expect(flood.blocked_edge_keys).toContain(MILL_BRIDGE_EDGE_KEY);
    const road = flood.roads.find(candidate => candidate.edge_key === MILL_BRIDGE_EDGE_KEY);
    expect(road?.accessible).toBe(false);
    expect(road?.reason.toLowerCase()).toContain('scenario');
  });

  it('explains each road verdict in plain language', () => {
    const flood = floodAt(5);
    for (const road of flood.roads) {
      expect(road.reason.length).toBeGreaterThan(0);
    }
  });
});

describe('Twin — Feature 2: rescue route optimisation', () => {
  it('returns null for an unknown unit or incident', () => {
    const flood = floodAt(0);
    expect(planTwinRoute(city, flood, 'ghost', city.incidents[0].id)).toBeNull();
    expect(planTwinRoute(city, flood, city.units[0].id, 'ghost')).toBeNull();
  });

  it('finds a route with the road graph while the city is dry', () => {
    const route = planTwinRoute(city, floodAt(0), 'amb-2', 'inc-riverside');
    expect(route).not.toBeNull();
    expect(route!.reachable).toBe(true);
    expect(route!.minutes).toBeGreaterThan(0);
    expect(route!.path[0]).toBe('centraldepot');
    expect(route!.path[route!.path.length - 1]).toBe('riverside');
    expect(route!.geometry.length).toBe(route!.path.length);
    expect(route!.reasons.join(' ')).toContain('Dijkstra');
  });

  it('strands the west bank when the only crossing floods', () => {
    // Riverside sits behind Mill Bridge, the sole link to the west bank.
    const route = planTwinRoute(city, floodAt(TWIN_MAX_WATER_LEVEL_M), 'amb-2', 'inc-riverside');
    expect(route).not.toBeNull();
    expect(route!.reachable).toBe(false);
    expect(route!.minutes).toBeNull();
    expect(route!.path).toHaveLength(0);
    expect(route!.reasons.join(' ').toLowerCase()).toContain('no road route');
  });

  it('re-routes deterministically and the signature reflects the closure set', () => {
    const dry = planTwinRoute(city, floodAt(0), 'amb-3', 'inc-oldmill');
    const repeat = planTwinRoute(city, floodAt(0), 'amb-3', 'inc-oldmill');
    expect(JSON.stringify(dry)).toBe(JSON.stringify(repeat));
    expect(dry!.signature).toContain('amb-3→inc-oldmill');
  });

  it('compares baseline and updated routes and flags a lost route as degraded', () => {
    const baseline = planTwinRoute(city, floodAt(0), 'amb-2', 'inc-riverside')!;
    const updated = planTwinRoute(city, floodAt(TWIN_MAX_WATER_LEVEL_M), 'amb-2', 'inc-riverside')!;
    const comparison = compareTwinRoutes(baseline, updated);

    expect(comparison.is_simulated).toBe(true);
    expect(comparison.degraded).toBe(true);
    expect(comparison.delta_minutes).toBeNull();
    expect(comparison.summary.toLowerCase()).toContain('no longer reach');
    expect(comparison.changes.some(change => change.label === 'Route lost')).toBe(true);
  });

  it('classifies a slower but still reachable detour as degraded with a positive delta', () => {
    const baseline = makeRoute({ minutes: 14, path: ['centraldepot', 'junction', 'westdepot'] });
    const updated = makeRoute({ minutes: 21, path: ['centraldepot', 'marketrow', 'northgate'] });
    const comparison = compareTwinRoutes(baseline, updated);

    expect(comparison.degraded).toBe(true);
    expect(comparison.delta_minutes).toBe(7);
    expect(comparison.summary).toContain('slower');
    expect(comparison.changes.some(change => change.label === 'Slower')).toBe(true);
    expect(comparison.changes.some(change => change.label === 'Path changed')).toBe(true);
  });

  it('classifies a faster detour as an improvement', () => {
    const baseline = makeRoute({ minutes: 21 });
    const updated = makeRoute({ minutes: 14 });
    const comparison = compareTwinRoutes(baseline, updated);

    expect(comparison.degraded).toBe(false);
    expect(comparison.delta_minutes).toBe(-7);
    expect(comparison.summary).toContain('faster');
    expect(comparison.changes.some(change => change.label === 'Faster')).toBe(true);
  });

  it('reports an unchanged route as neither better nor worse', () => {
    const baseline = planTwinRoute(city, floodAt(0), 'amb-2', 'inc-northgate')!;
    const comparison = compareTwinRoutes(baseline, baseline);
    expect(comparison.degraded).toBeNull();
    expect(comparison.delta_minutes).toBe(0);
    expect(comparison.summary).toContain('unchanged');
  });
});

describe('Twin — Feature 3: virtual drone reconnaissance', () => {
  it('is deterministic and never claims to control a real aircraft', () => {
    const first = planTwinDroneMission(city, floodAt(3));
    const second = planTwinDroneMission(city, floodAt(3));
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.is_simulated).toBe(true);
  });

  it('plans at most the configured number of stops', () => {
    const mission = planTwinDroneMission(city, floodAt(2.4));
    expect(mission.total_points).toBeLessThanOrEqual(TWIN_DRONE_MAX_STOPS);
    expect(mission.points.length).toBe(mission.total_points);
    expect(mission.base_node).toBe('centraldepot');
  });

  it('selects the highest-priority stops, using severity, proximity and coverage gap', () => {
    const all = planTwinDroneMission(city, floodAt(2.4), { max_stops: 999 });
    const few = planTwinDroneMission(city, floodAt(2.4), { max_stops: 3 });

    const selectedIds = new Set(few.points.map(point => point.building_id));
    const selectedMin = Math.min(...few.points.map(point => point.priority));
    const rejectedMax = Math.max(
      ...all.points.filter(point => !selectedIds.has(point.building_id)).map(point => point.priority)
    );
    expect(selectedMin).toBeGreaterThanOrEqual(rejectedMax);

    for (const point of few.points) {
      expect(point.priority).toBeGreaterThanOrEqual(0);
      expect(point.priority).toBeLessThanOrEqual(100);
      expect(point.reasons.length).toBeGreaterThan(0);
    }
  });

  it('reports coverage statistics and a flight time consistent with the path length', () => {
    const mission = planTwinDroneMission(city, floodAt(2.4));
    expect(mission.path_length_m).toBeGreaterThan(0);
    expect(mission.coverage.buildings_total).toBe(city.buildings.length);
    expect(mission.coverage.buildings_inspected).toBeLessThanOrEqual(city.buildings.length);
    expect(mission.coverage.coverage_pct).toBeGreaterThanOrEqual(0);
    expect(mission.estimated_minutes).toBeGreaterThan(0);
    expect(mission.parameters.speed_m_per_min).toBeGreaterThan(0);
  });

  it('prioritises severe incidents so a Critical-incident zone appears in the plan', () => {
    const mission = planTwinDroneMission(city, floodAt(2.4), { max_stops: 999 });
    const severe = mission.points.filter(point => point.severity === 'Critical');
    expect(severe.length).toBeGreaterThan(0);
  });
});

describe('Twin — Feature 4: interactive building intelligence', () => {
  it('returns null for an unknown building', () => {
    expect(getTwinBuildingIntelligence(city, floodAt(2), 'ghost')).toBeNull();
  });

  it('describes a building with floor-level risk, resources and rescue status', () => {
    const target = city.buildings.find(building => building.category === 'HOSPITAL')!;
    const intel = getTwinBuildingIntelligence(city, floodAt(4), target.id)!;

    expect(intel.is_simulated).toBe(true);
    expect(intel.building.id).toBe(target.id);
    expect(intel.floors).toHaveLength(target.floors);
    expect(intel.floors[0].floor).toBe(1);
    expect(intel.zone_name.length).toBeGreaterThan(0);
    expect(intel.nearby_resources.length).toBeGreaterThan(0);
    expect(intel.rescue_status.status.length).toBeGreaterThan(0);
  });

  it('ranks floors by risk so lower floors flood before upper floors', () => {
    const target = city.buildings.find(building => building.ground_elevation_m < 2.5)!;
    const intel = getTwinBuildingIntelligence(city, floodAt(5), target.id)!;
    const groundFloor = intel.floors[0];
    const topFloor = intel.floors[intel.floors.length - 1];

    expect(groundFloor.water_depth_m).toBeGreaterThanOrEqual(topFloor.water_depth_m);
    expect(groundFloor.risk).not.toBe('SAFE');
    // Floor risk bands must never be reported without an explanation.
    for (const floor of intel.floors) expect(floor.reason.length).toBeGreaterThan(0);
  });

  it('lists nearby resources in ascending distance order', () => {
    const intel = getTwinBuildingIntelligence(city, floodAt(3), city.buildings[0].id)!;
    const distances = intel.nearby_resources.map(resource => resource.distance_units);
    const sorted = [...distances].sort((a, b) => a - b);
    expect(distances).toEqual(sorted);
    expect(intel.nearby_resources.length).toBeLessThanOrEqual(6);
  });
});

describe('Twin — Feature 5: disaster time machine', () => {
  it('is deterministic and replays a strictly rising flood', () => {
    const first = buildTwinTimeline(city);
    const second = buildTwinTimeline(city);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));

    expect(first.frames.length).toBeGreaterThanOrEqual(5);
    expect(first.duration_minutes).toBe(30);
    for (let index = 1; index < first.frames.length; index += 1) {
      expect(first.frames[index].water_level_m).toBeGreaterThan(first.frames[index - 1].water_level_m);
    }
  });

  it('opens with the incident creation events', () => {
    const timeline = buildTwinTimeline(city);
    const kinds = timeline.frames[0].events.map(event => event.kind);
    expect(kinds).toContain('INCIDENT');
    expect(timeline.frames[0].events.filter(event => event.kind === 'INCIDENT')).toHaveLength(
      city.incidents.length
    );
  });

  it('records the bridge closure as the water overtops the deck', () => {
    const timeline = buildTwinTimeline(city);
    const closures = timeline.frames
      .flatMap(frame => frame.events)
      .filter(event => event.kind === 'ROAD_CLOSURE');
    expect(closures.some(event => event.title.includes('Mill Bridge'))).toBe(true);
  });

  it('records assignments and keeps the exposure snapshot consistent with the flood engine', () => {
    const timeline = buildTwinTimeline(city);
    const hasAssignment = timeline.frames.some(frame =>
      frame.events.some(event => event.kind === 'ASSIGNMENT' || event.kind === 'ROUTE_CHANGE')
    );
    expect(hasAssignment).toBe(true);

    for (const frame of timeline.frames) {
      const flood = assessTwinFlood(city, frame.water_level_m);
      expect(frame.snapshot.buildings_exposed).toBe(flood.stats.buildings_exposed);
      expect(frame.snapshot.roads_impassable).toBe(flood.stats.roads_impassable);
      expect(frame.blocked_edge_keys).toEqual(flood.blocked_edge_keys);
    }
  });

  it('never exposes less of the city as the replay advances', () => {
    const timeline = buildTwinTimeline(city);
    for (let index = 1; index < timeline.frames.length; index += 1) {
      expect(timeline.frames[index].snapshot.buildings_exposed).toBeGreaterThanOrEqual(
        timeline.frames[index - 1].snapshot.buildings_exposed
      );
    }
  });
});

describe('Twin — Feature 6: AI disaster copilot', () => {
  it('resolves "Incident A" to the most severe incident, tie-broken lexicographically', () => {
    const incident = resolveTwinIncident('incident A', city);
    expect(incident?.id).toBe('inc-northgate');
    expect(incident?.severity).toBe('Critical');
  });

  it('answers "which buildings are most exposed" from the flood state', () => {
    const answer = answerTwinCopilot('Which buildings are most exposed?', copilotContext(4.3));
    expect(answer.intent).toBe('MOST_EXPOSED');
    expect(answer.is_simulated).toBe(true);
    expect(answer.facts.length).toBeGreaterThan(0);
    expect(answer.facts.length).toBeLessThanOrEqual(5);
    expect(answer.answer).toContain('4.3');
    expect(answer.citations).toContain('assessTwinFlood');
  });

  it('answers "which ambulance can reach Incident A fastest" with computed ETAs', () => {
    const answer = answerTwinCopilot(
      'Which ambulance can reach Incident A fastest?',
      copilotContext(0.6)
    );
    expect(answer.intent).toBe('FASTEST_UNIT');
    expect(answer.facts.length).toBeGreaterThan(0);
    expect(answer.citations).toContain('planTwinRoute');
    expect(answer.answer).toMatch(/min|unreachable/);
  });

  it('answers the bridge what-if by comparing two allocation plans', () => {
    const answer = answerTwinCopilot('What happens if the bridge closes?', copilotContext(1.4));
    expect(answer.intent).toBe('BRIDGE_WHAT_IF');
    expect(answer.citations).toContain('computePlan');
    expect(answer.facts.map(fact => fact.label)).toEqual(
      expect.arrayContaining(['Avg response, bridge open', 'Avg response, bridge closed'])
    );
  });

  it('answers the coverage question from the coverage-balanced plan', () => {
    const answer = answerTwinCopilot(
      'Which areas have limited rescue coverage?',
      copilotContext(2.4)
    );
    expect(answer.intent).toBe('COVERAGE_GAP');
    expect(answer.citations).toContain('computePlan');
    expect(answer.facts.some(fact => fact.label === 'Unattended incidents')).toBe(true);
  });

  it('describes the drone flight without claiming control of a real drone', () => {
    const answer = answerTwinCopilot('What is the drone doing?', copilotContext(2.4));
    expect(answer.intent).toBe('DRONE_MISSION');
    expect(answer.answer.toLowerCase()).toContain('does not control');
    expect(answer.citations).toContain('planTwinDroneMission');
  });

  it('falls back to an overall situation summary for an unmatched question', () => {
    const answer = answerTwinCopilot('Hello there', copilotContext(2.4));
    expect(answer.intent).toBe('SITUATION');
    expect(answer.facts.map(fact => fact.label)).toContain('Water level');
  });

  it('offers the documented follow-up questions on every answer', () => {
    const answer = answerTwinCopilot('Which buildings are most exposed?', copilotContext(2.4));
    expect(answer.suggestions).toContain('Which ambulance can reach Incident A fastest?');
    expect(answer.suggestions).toContain('What happens if the bridge closes?');
  });
});

describe('Twin — one-click demo scenario', () => {
  it('scripts the recovery story inside the slider range', () => {
    expect(TWIN_DEMO_TITLE).toBe('Urban Flood Emergency — 3D Simulation');
    expect(TWIN_DEMO_STEPS.length).toBeGreaterThanOrEqual(6);
    expect(TWIN_DEMO_STEPS[0].id).toBe('load-city');
    expect(TWIN_DEMO_STEPS[TWIN_DEMO_STEPS.length - 1].id).toBe('summary');

    for (const step of TWIN_DEMO_STEPS) {
      expect(step.water_level_m).toBeGreaterThanOrEqual(0);
      expect(step.water_level_m).toBeLessThanOrEqual(TWIN_MAX_WATER_LEVEL_M);
    }
  });

  it('closes the bridge partway through the demonstration', () => {
    const bridgeStep = TWIN_DEMO_STEPS.find(step => step.focus === 'BRIDGE');
    expect(bridgeStep).toBeDefined();
    const flood = assessTwinFlood(city, bridgeStep!.water_level_m, bridgeStep!.extra_blocked);
    expect(flood.blocked_edge_keys).toContain(MILL_BRIDGE_EDGE_KEY);
  });
});
