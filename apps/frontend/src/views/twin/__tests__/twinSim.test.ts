import { describe, expect, it } from 'vitest';
import { getCity, MILL_BRIDGE_ID } from '../sim/city';
import { computeFlood, ROAD_RULES } from '../sim/flood';
import { computeSimState, SimInputs } from '../sim/scenario';
import { aStarRoute, dijkstraRoute, rankAmbulances, formatMinutes } from '../sim/routing';
import { dronePoseAt, droneStats, planDroneMission } from '../sim/drone';
import { buildTimeline, TIMELINE_DURATION_MIN } from '../sim/timeline';
import { answerQuestion } from '../sim/copilot';
import { assignResources, analyseCoverage } from '../sim/dispatch';
import { floorRisks } from '../mapData';

const city = getCity();
const all = city.incidents.map(i => i.id);
const inputs = (waterLevelM: number, extra: Partial<SimInputs> = {}): SimInputs => ({
  waterLevelM,
  manualEdgeIds: [],
  manualBridgeIds: [],
  activeIncidentIds: all,
  ...extra
});
const millEdge = city.edges.find(e => e.bridge?.id === MILL_BRIDGE_ID)!;

describe('synthetic city', () => {
  it('is reproducible and contains every required asset type', () => {
    const again = getCity();
    expect(again.buildings.map(b => b.heightM)).toEqual(city.buildings.map(b => b.heightM));
    expect(city.buildings.length).toBeGreaterThan(100);
    expect(new Set(city.buildings.map(b => b.floors)).size).toBeGreaterThan(3);
    for (const kind of ['hospital', 'shelter', 'fire_station'] as const) {
      expect(city.facilities.some(f => f.kind === kind)).toBe(true);
    }
    expect(city.ambulances.length).toBeGreaterThan(2);
    expect(city.rescueTeams.length).toBeGreaterThan(0);
    expect(city.incidents.length).toBeGreaterThanOrEqual(4);
    expect(city.edges.filter(e => e.bridge).length).toBe(3);
  });
});

describe('flood simulation', () => {
  it('exposure grows monotonically with water level', () => {
    const levels = [0, 1, 2, 3, 4, 5].map(l => computeFlood(city, l).exposedBuildings);
    expect(levels[0]).toBe(0);
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
    expect(levels[5]).toBeGreaterThan(levels[1]);
  });

  it('applies the explicit road rules', () => {
    const s = computeSimState(city, inputs(2.8));
    let closed = 0;
    for (const [, road] of s.roads) {
      if (road.cause === 'flood_depth') {
        expect(road.depthM).toBeGreaterThanOrEqual(ROAD_RULES.closedDepthM);
        closed++;
      }
      if (road.status === 'caution') {
        expect(road.depthM).toBeLessThan(ROAD_RULES.closedDepthM);
        expect(road.speedFactor).toBe(ROAD_RULES.cautionSpeedFactor);
      }
    }
    expect(closed).toBeGreaterThan(0);
  });

  it('closes Mill Bridge at its deck threshold', () => {
    const below = computeSimState(city, inputs(millEdge.bridge!.closureLevelM - 0.1));
    const above = computeSimState(city, inputs(millEdge.bridge!.closureLevelM + 0.1));
    expect(below.roads.get(millEdge.id)!.cause).not.toBe('bridge_rule');
    expect(above.roads.get(millEdge.id)!.status).toBe('closed');
    expect(above.roads.get(millEdge.id)!.cause).toBe('bridge_rule');
  });

  it('marks floors below the water as flooded', () => {
    const s = computeSimState(city, inputs(3));
    const b = city.buildings.find(x => (s.flood.exposure.get(x.id)?.depthM ?? 0) > 0.5)!;
    expect(floorRisks(s, b)[0]).toBe('flooded');
    const dry = city.buildings.find(x => x.elevation > 4.5)!;
    expect(floorRisks(s, dry).every(r => r === 'safe')).toBe(true);
  });
});

describe('graph routing', () => {
  it('A* matches Dijkstra on travel time', () => {
    const s = computeSimState(city, inputs(2));
    for (const amb of city.ambulances) {
      for (const inc of city.incidents) {
        const a = aStarRoute(city, s.roads, amb.nodeId, inc.nodeId);
        const d = dijkstraRoute(city, s.roads, amb.nodeId, inc.nodeId);
        expect(a.found).toBe(d.found);
        if (a.found) expect(a.timeS).toBeCloseTo(d.timeS, 6);
      }
    }
  });

  it('never routes over a closed road and detours when Mill Bridge closes', () => {
    const incA = city.incidents.find(i => i.label === 'A')!;
    const open = computeSimState(city, inputs(2.2));
    const shut = computeSimState(city, inputs(2.2, { manualBridgeIds: [MILL_BRIDGE_ID] }));
    const before = rankAmbulances(city, open.roads, incA)[0];
    const after = rankAmbulances(city, shut.roads, incA)[0];
    expect(before.route.edgeIds).toContain(millEdge.id);
    expect(after.route.edgeIds).not.toContain(millEdge.id);
    expect(after.route.timeS).toBeGreaterThan(before.route.timeS);
    for (const id of after.route.edgeIds) expect(shut.roads.get(id)!.status).not.toBe('closed');
  });

  it('only ranks available ambulances', () => {
    const s = computeSimState(city, inputs(1));
    const ranked = rankAmbulances(city, s.roads, city.incidents[0]);
    expect(ranked.every(o => o.ambulance.status === 'available')).toBe(true);
  });
});

describe('virtual drone', () => {
  it('plans a prioritised mission and reports growing coverage', () => {
    const s = computeSimState(city, inputs(2.2));
    const home = city.facilities.find(f => f.kind === 'fire_station')!.position;
    const plan = planDroneMission(s, home);
    expect(plan.points.length).toBeGreaterThan(2);
    expect(plan.points.length).toBeLessThanOrEqual(8);
    expect(plan.points.map(p => p.order)).toEqual(plan.points.map((_, i) => i + 1));
    expect(dronePoseAt(plan, 0).position).toEqual(home);
    const start = droneStats(plan, s, 0);
    const end = droneStats(plan, s, plan.totalDistanceM);
    expect(end.inspectedPoints).toBe(plan.points.length);
    expect(end.coveragePct).toBeGreaterThan(start.coveragePct);
    expect(end.remainingM).toBe(0);
  });
});

describe('disaster time machine', () => {
  const timeline = buildTimeline(city);
  it('produces one snapshot per minute and a rising flood', () => {
    expect(timeline.snapshots).toHaveLength(TIMELINE_DURATION_MIN + 1);
    expect(timeline.snapshots[60].state.inputs.waterLevelM).toBeGreaterThan(timeline.snapshots[0].state.inputs.waterLevelM);
  });
  it('records incidents, closures, assignments and route changes', () => {
    const kinds = new Set(timeline.events.map(e => e.kind));
    for (const k of ['incident', 'flood', 'closure', 'assignment', 'route_change'] as const) expect(kinds.has(k)).toBe(true);
    expect(timeline.events.some(e => e.minute === 45 && e.kind === 'closure')).toBe(true);
  });
});

describe('copilot grounding', () => {
  it('answers the fastest-ambulance question with the computed route', () => {
    const s = computeSimState(city, inputs(2.2));
    const incA = city.incidents.find(i => i.label === 'A')!;
    const best = rankAmbulances(city, s.roads, incA)[0];
    const answer = answerQuestion('Which ambulance can reach Incident A fastest?', { state: s });
    const text = [answer.title, ...answer.lines].join(' ');
    expect(answer.intent).toBe('fastest');
    expect(text).toContain(best.ambulance.callSign);
    expect(text).toContain(formatMinutes(best.route.timeS));
  });

  it('evaluates bridge closure even when the flood has already closed it', () => {
    const s = computeSimState(city, inputs(2.6));
    const answer = answerQuestion('What happens if the bridge closes?', { state: s });
    expect(answer.intent).toBe('bridge');
    expect(answer.lines.join(' ')).toMatch(/already closed/);
    expect(answer.lines.join(' ')).toMatch(/Incident A/);
  });

  it('reports exposure counts that match the flood model', () => {
    const s = computeSimState(city, inputs(2.2));
    const answer = answerQuestion('Which buildings are most exposed?', { state: s });
    expect([answer.title, ...answer.lines].join(' ')).toContain(String(s.flood.exposedBuildings));
  });

  it('identifies limited coverage districts from Dijkstra travel times', () => {
    const s = computeSimState(city, inputs(2.2));
    const limited = analyseCoverage(s).filter(d => d.limited);
    const answer = answerQuestion('Which areas have limited rescue coverage?', { state: s });
    for (const d of limited) expect(answer.lines.join(' ')).toContain(d.name);
  });

  it('refuses questions it cannot compute', () => {
    const s = computeSimState(city, inputs(1));
    expect(answerQuestion('What is the weather in Paris?', { state: s }).intent).toBe('unknown');
  });

  it('assignments never use unavailable ambulances', () => {
    const s = computeSimState(city, inputs(2.2));
    for (const a of assignResources(s)) if (a.ambulance) expect(a.ambulance.status).toBe('available');
  });
});
