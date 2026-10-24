import { analyseCoverage, assignResources, COVERAGE_TARGET_S, districtOf, recommendations } from './dispatch';
import type { DroneStats } from './drone';
import { EXPOSURE_BANDS, ROAD_RULES } from './flood';
import { formatKm, formatMinutes, rankAmbulances, routeStreetNames } from './routing';
import { SimState, stateBasis } from './scenario';

/**
 * Grounded Disaster Copilot. Questions are matched to an intent and answered
 * by running the simulation engine on the CURRENT twin state. It does not call
 * a language model and it never invents a number: if the state cannot answer
 * a question, it says so and lists what it can answer.
 */

export interface CopilotContext {
  state: SimState;
  drone?: DroneStats | null;
}

export interface CopilotAnswer {
  intent: 'exposure' | 'fastest' | 'bridge' | 'coverage' | 'summary' | 'shelter' | 'drone' | 'roads' | 'unknown';
  title: string;
  lines: string[];
  basis: string;
}

export const SUGGESTED_QUESTIONS = [
  'Which buildings are most exposed?',
  'Which ambulance can reach Incident A fastest?',
  'What happens if the bridge closes?',
  'Which areas have limited rescue coverage?',
  'Give me a response summary'
];

function exposure(ctx: CopilotContext): CopilotAnswer {
  const { state } = ctx;
  const ranked = state.city.buildings
    .map(b => ({ b, e: state.flood.exposure.get(b.id)! }))
    .filter(x => x.e.depthM > 0)
    .sort((a, b) => b.e.depthM * Math.max(1, b.e.occupantsExposed) - a.e.depthM * Math.max(1, a.e.occupantsExposed));
  if (ranked.length === 0) {
    const atRisk = state.flood.atRiskBuildings;
    return {
      intent: 'exposure',
      title: 'No buildings are flooded at this water level',
      lines: [
        `At ${state.inputs.waterLevelM.toFixed(1)} m no building footprint is hydraulically connected to flood water.`,
        atRisk > 0 ? `${atRisk} building(s) sit within ${EXPOSURE_BANDS.atRiskFreeboardM} m of the water and are flagged "at risk".` : 'No buildings are within the at-risk freeboard either.'
      ],
      basis: stateBasis(state)
    };
  }
  return {
    intent: 'exposure',
    title: `${ranked.length} buildings exposed — top ${Math.min(5, ranked.length)} by depth × exposed occupants`,
    lines: [
      ...ranked.slice(0, 5).map(
        ({ b, e }, i) =>
          `${i + 1}. ${b.id}${b.name ? ` (${b.name})` : ''} — ${e.depthM.toFixed(2)} m at ground, ${e.floorsAffected}/${b.floors} floor(s) affected, ~${e.occupantsExposed} occupants exposed · ${districtOf(b.centroid.x, b.centroid.y)}`
      ),
      `Total: ~${state.flood.occupantsExposed} occupants on affected floors (synthetic estimate); ${state.flood.atRiskBuildings} more buildings at risk.`
    ],
    basis: stateBasis(state)
  };
}

function findIncident(ctx: CopilotContext, q: string) {
  const match = q.match(/incident\s+([a-z])\b/i) ?? q.match(/\b([a-f])\b(?=\s*\??$)/i);
  const label = match?.[1]?.toUpperCase();
  const pool = ctx.state.activeIncidents;
  if (label) return { incident: ctx.state.city.incidents.find(i => i.label === label), label, active: pool.some(i => i.label === label) };
  const top = [...pool].sort((a, b) => b.severity - a.severity)[0];
  return { incident: top, label: top?.label, active: Boolean(top) };
}

function fastest(ctx: CopilotContext, q: string): CopilotAnswer {
  const { state } = ctx;
  const { incident, label, active } = findIncident(ctx, q);
  if (!incident) {
    return { intent: 'fastest', title: label ? `Incident ${label} does not exist` : 'No active incidents', lines: [`Known incidents: ${state.city.incidents.map(i => i.label).join(', ')}.`], basis: stateBasis(state) };
  }
  const options = rankAmbulances(state.city, state.roads, incident);
  const reachable = options.filter(o => o.route.found);
  const lines: string[] = [];
  if (!active) lines.push(`Note: Incident ${incident.label} is not yet active in the current state; ranking computed anyway.`);
  if (reachable.length === 0) {
    lines.push(`No available ambulance has a drivable route to Incident ${incident.label} — every path crosses a closed segment.`);
    lines.push('Recommendation: task the Swift-water Boat Team (simulated).');
  } else {
    const best = reachable[0];
    lines.push(
      `${best.ambulance.callSign} is fastest: ${formatMinutes(best.route.timeS)}, ${formatKm(best.route.distanceM)} via ${routeStreetNames(state.city, best.route).join(' → ')}.`
    );
    options.slice(1).forEach(o => lines.push(`${o.ambulance.id}: ${o.route.found ? `${formatMinutes(o.route.timeS)}, ${formatKm(o.route.distanceM)}` : 'no drivable route'}`));
  }
  const unavailable = state.city.ambulances.filter(a => a.status !== 'available');
  if (unavailable.length) lines.push(`Excluded as unavailable: ${unavailable.map(a => a.id).join(', ')}.`);
  return { intent: 'fastest', title: `Fastest ambulance to Incident ${incident.label}`, lines, basis: `${stateBasis(state)} · A* over ${state.city.edges.length} road segments` };
}

function bridge(ctx: CopilotContext, q: string): CopilotAnswer {
  const { state } = ctx;
  const bridges = state.city.edges.filter(e => e.bridge);
  const lower = q.toLowerCase();
  const target =
    bridges.find(b => (lower.includes('harbor') || lower.includes('harbour')) && b.bridge!.id === 'bridge-harbor') ??
    bridges.find(b => (lower.includes('weir') || lower.includes('west')) && b.bridge!.id === 'bridge-west-weir') ??
    bridges.find(b => b.bridge!.id === 'bridge-mill')!;
  const current = state.roads.get(target.id)!;
  const alreadyClosed = current.status === 'closed';
  const openRoads = new Map(state.roads);
  openRoads.set(target.id, { status: 'open', depthM: 0, speedFactor: 1, reason: 'Hypothetically open' });
  const closedRoads = new Map(state.roads);
  closedRoads.set(target.id, { status: 'closed', depthM: 0, speedFactor: 0, cause: 'bridge_manual', reason: `${target.name} hypothetically closed` });
  const baseline = { ...state, roads: openRoads };
  const withClosure = { ...state, roads: closedRoads };
  const lines: string[] = [];
  if (alreadyClosed) lines.push(`${target.name} is already closed in the current state (${current.reason}). Showing what that closure costs compared with the bridge open.`);
  if (state.activeIncidents.length === 0) lines.push('There are no active incidents, so no response times change.');
  let worse = 0;
  for (const incident of state.activeIncidents) {
    const before = rankAmbulances(state.city, baseline.roads, incident).find(o => o.route.found);
    const after = rankAmbulances(state.city, withClosure.roads, incident).find(o => o.route.found);
    const b = before ? `${before.ambulance.id} ${formatMinutes(before.route.timeS)}` : 'unreachable';
    const a = after ? `${after.ambulance.id} ${formatMinutes(after.route.timeS)}` : 'unreachable';
    const delta = before && after ? after.route.timeS - before.route.timeS : NaN;
    if (!after && before) worse++;
    else if (delta > 1) worse++;
    lines.push(`Incident ${incident.label}: ${b} → ${a}${Number.isFinite(delta) && Math.abs(delta) > 1 ? ` (${delta > 0 ? '+' : ''}${(delta / 60).toFixed(1)} min)` : Number.isFinite(delta) ? ' (no change)' : ''}`);
  }
  const covBefore = analyseCoverage(baseline).filter(c => c.limited).map(c => c.name);
  const covAfter = analyseCoverage(withClosure).filter(c => c.limited).map(c => c.name);
  const newlyLimited = covAfter.filter(n => !covBefore.includes(n));
  lines.push(`${worse} of ${state.activeIncidents.length} incident(s) get slower or lose road access with ${target.name} closed.`);
  if (newlyLimited.length) lines.push(`Coverage newly limited in: ${newlyLimited.join(', ')}.`);
  return { intent: 'bridge', title: `What if ${target.name} closes?`, lines, basis: `${stateBasis(state)} · counterfactual re-run with ${target.name} removed from the graph` };
}

function coverage(ctx: CopilotContext): CopilotAnswer {
  const { state } = ctx;
  const cov = analyseCoverage(state);
  const limited = cov.filter(c => c.limited);
  return {
    intent: 'coverage',
    title: limited.length ? `${limited.length} district(s) with limited simulated coverage` : 'All districts meet the coverage target',
    lines: [
      `Target: an available ambulance can reach an intersection within ${COVERAGE_TARGET_S / 60} min.`,
      ...cov.map(
        c =>
          `${c.limited ? 'LIMITED' : 'OK'} · ${c.name}: ${c.withinTargetPct.toFixed(0)}% of ${c.nodeCount} intersections within target${c.unreachableNodes ? `, ${c.unreachableNodes} unreachable` : ''}, median ${formatMinutes(c.medianTimeS)}`
      )
    ],
    basis: `${stateBasis(state)} · multi-source Dijkstra from ${state.city.ambulances.filter(a => a.status === 'available').length} available ambulances`
  };
}

function roads(ctx: CopilotContext): CopilotAnswer {
  const { state } = ctx;
  const byCause = new Map<string, string[]>();
  for (const e of state.closedEdges) {
    const cause = state.roads.get(e.id)!.cause ?? 'other';
    byCause.set(cause, [...(byCause.get(cause) ?? []), e.name]);
  }
  const label: Record<string, string> = { flood_depth: 'Flood depth rule', bridge_rule: 'Bridge deck rule', manual: 'Operator closure', bridge_manual: 'Bridge marked inaccessible' };
  return {
    intent: 'roads',
    title: `${state.closedEdges.length} closed and ${state.cautionEdges.length} caution segments`,
    lines: [
      `Rules: closed when flood depth > ${ROAD_RULES.closedDepthM} m; shallower water costs ×${ROAD_RULES.cautionSpeedFactor} speed; bridges close at their deck level.`,
      ...Array.from(byCause.entries()).map(([cause, names]) => `${label[cause] ?? cause}: ${names.length} — ${Array.from(new Set(names)).join(', ')}`)
    ],
    basis: stateBasis(state)
  };
}

function shelters(ctx: CopilotContext): CopilotAnswer {
  const { state } = ctx;
  const lines = state.city.facilities
    .filter(f => f.kind === 'shelter')
    .map(f => {
      const e = state.flood.exposure.get(f.buildingId)!;
      const status = e.depthM > 0 ? `FLOODED (${e.depthM.toFixed(2)} m)` : e.level === 'at_risk' ? 'at risk' : 'dry';
      return `${f.name}: capacity ${f.capacity}, ${status} · ${districtOf(f.position.x, f.position.y)}`;
    });
  lines.push(`~${state.flood.occupantsExposed} occupants are on affected floors (synthetic estimate).`);
  return { intent: 'shelter', title: 'Shelter status', lines, basis: stateBasis(state) };
}

function drone(ctx: CopilotContext): CopilotAnswer {
  const { state, drone: d } = ctx;
  if (!d) return { intent: 'drone', title: 'No drone mission planned', lines: ['Plan a virtual drone mission in the Drone tab to get coverage figures.'], basis: stateBasis(state) };
  return {
    intent: 'drone',
    title: 'Virtual drone coverage',
    lines: [
      `${d.inspectedPoints}/${d.totalPoints} inspection points visited; ${formatKm(d.distanceFlownM)} flown, ${formatKm(d.remainingM)} remaining.`,
      `${d.buildingsCovered} buildings imaged (${d.coveragePct.toFixed(0)}% of city); ${d.exposedCovered}/${d.exposedTotal} exposed buildings (${d.exposedCoveragePct.toFixed(0)}%).`
    ],
    basis: `${stateBasis(state)} · simulated drone, no real aircraft`
  };
}

export function responseSummary(ctx: CopilotContext): CopilotAnswer {
  const { state } = ctx;
  const assignments = assignResources(state);
  const cov = analyseCoverage(state);
  const lines: string[] = [
    `Flood: ${state.inputs.waterLevelM.toFixed(1)} m, ${state.flood.floodedAreaKm2.toFixed(2)} km² inundated, ${state.flood.exposedBuildings} buildings exposed (~${state.flood.occupantsExposed} occupants, synthetic).`,
    `Roads: ${state.closedEdges.length} segments closed${state.closedBridges.length ? `, including ${state.closedBridges.map(b => b.name).join(', ')}` : ''}; ${state.cautionEdges.length} slowed by standing water.`
  ];
  for (const a of assignments) {
    if (a.status === 'assigned') lines.push(`Incident ${a.incident.label} (sev ${a.incident.severity}): ${a.ambulance!.id}, simulated ETA ${formatMinutes(a.route!.timeS)}.`);
    else lines.push(`Incident ${a.incident.label} (sev ${a.incident.severity}): ${a.status === 'unreachable' ? 'no drivable route' : 'queued — no free ambulance'}.`);
  }
  if (ctx.drone) lines.push(`Drone recon: ${ctx.drone.exposedCovered}/${ctx.drone.exposedTotal} exposed buildings imaged.`);
  lines.push('Recommended actions:');
  recommendations(state, assignments, cov).forEach(r => lines.push(`• ${r}`));
  return { intent: 'summary', title: 'Simulated response summary', lines, basis: `${stateBasis(state)} · decision support only — no units were dispatched` };
}

export function answerQuestion(question: string, ctx: CopilotContext): CopilotAnswer {
  const q = question.trim().toLowerCase();
  if (/bridge/.test(q)) return bridge(ctx, q);
  if (/fastest|quickest|reach|nearest ambulance|closest ambulance|which ambulance|best ambulance/.test(q)) return fastest(ctx, q);
  if (/coverage|limited|underserved|gap|cut off|cut-off/.test(q)) return coverage(ctx);
  if (/expos|flooded build|most at risk|which buildings|affected build/.test(q)) return exposure(ctx);
  if (/shelter|evacu/.test(q)) return shelters(ctx);
  if (/drone|recon|inspect/.test(q)) return drone(ctx);
  if (/road|closed|closure|route/.test(q)) return roads(ctx);
  if (/summary|status|recommend|overview|situation|what should|report/.test(q)) return responseSummary(ctx);
  return {
    intent: 'unknown',
    title: "I can't answer that from the simulation state",
    lines: [
      'I only answer questions the twin can compute. Try asking about:',
      '• exposed buildings · fastest ambulance to an incident · bridge closures',
      '• rescue coverage gaps · road closures · shelters · drone coverage · response summary'
    ],
    basis: stateBasis(ctx.state)
  };
}
