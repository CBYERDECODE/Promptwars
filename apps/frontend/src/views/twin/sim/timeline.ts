import { MILL_BRIDGE_ID } from './city';
import { assignResources, Assignment } from './dispatch';
import { formatMinutes, routeStreetNames } from './routing';
import { computeSimState, SimInputs, SimState } from './scenario';
import type { City } from './types';

/**
 * Disaster Time Machine: a scripted, reproducible 90-minute replay. The water
 * curve and the scripted closure are inputs; every other event (road closures,
 * assignments, route changes, recommendations) is DERIVED by re-running the
 * same simulation engine minute by minute and diffing consecutive states.
 */

export const TIMELINE_DURATION_MIN = 90;

export const WATER_KEYFRAMES: Array<[number, number]> = [
  [0, 0.4],
  [10, 1.2],
  [20, 1.8],
  [30, 2.45],
  [45, 2.9],
  [60, 3.3],
  [75, 3.0],
  [90, 2.6]
];

/** Scripted operator action in the replay. */
export const SCRIPTED_CLOSURES = [
  { atMin: 45, edgeId: 'e_n6_s300_n7_s300', label: 'Canal Ave (Grove St–Hazel St) closed — simulated debris report' }
];

export function waterLevelAt(minute: number): number {
  const m = Math.max(0, Math.min(TIMELINE_DURATION_MIN, minute));
  for (let i = 1; i < WATER_KEYFRAMES.length; i++) {
    const [t1, w1] = WATER_KEYFRAMES[i];
    const [t0, w0] = WATER_KEYFRAMES[i - 1];
    if (m <= t1) return w0 + ((w1 - w0) * (m - t0)) / (t1 - t0);
  }
  return WATER_KEYFRAMES[WATER_KEYFRAMES.length - 1][1];
}

export function timelineInputs(city: City, minute: number): SimInputs {
  return {
    waterLevelM: Math.round(waterLevelAt(minute) * 100) / 100,
    manualEdgeIds: SCRIPTED_CLOSURES.filter(c => c.atMin <= minute).map(c => c.edgeId),
    manualBridgeIds: [],
    activeIncidentIds: city.incidents.filter(i => i.createdAtMin <= minute).map(i => i.id)
  };
}

export type TimelineEventKind = 'incident' | 'flood' | 'closure' | 'reopen' | 'assignment' | 'route_change' | 'unreachable';

export interface TimelineEvent {
  minute: number;
  kind: TimelineEventKind;
  title: string;
  detail: string;
}

export interface TimelineSnapshot {
  minute: number;
  state: SimState;
  assignments: Assignment[];
}

export interface Timeline {
  snapshots: TimelineSnapshot[];
  events: TimelineEvent[];
}

export function buildTimeline(city: City): Timeline {
  const snapshots: TimelineSnapshot[] = [];
  for (let minute = 0; minute <= TIMELINE_DURATION_MIN; minute++) {
    const state = computeSimState(city, timelineInputs(city, minute));
    snapshots.push({ minute, state, assignments: assignResources(state) });
  }

  const events: TimelineEvent[] = [
    { minute: 0, kind: 'flood', title: 'Replay start', detail: `River at ${snapshots[0].state.inputs.waterLevelM.toFixed(1)} m above datum. All values are simulated.` }
  ];
  const thresholds = [1, 2, 3];
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const cur = snapshots[i];
    const m = cur.minute;
    const w0 = prev.state.inputs.waterLevelM;
    const w1 = cur.state.inputs.waterLevelM;

    for (const t of thresholds) {
      if (w0 < t && w1 >= t) {
        events.push({ minute: m, kind: 'flood', title: `Water level passes ${t.toFixed(1)} m`, detail: `${cur.state.flood.exposedBuildings} buildings exposed, ~${cur.state.flood.occupantsExposed} occupants (synthetic estimate).` });
      }
    }
    const peak = Math.max(...WATER_KEYFRAMES.map(k => k[1]));
    if (w1 === peak && w0 < peak) {
      events.push({ minute: m, kind: 'flood', title: `Flood peak ${peak.toFixed(1)} m`, detail: `${cur.state.flood.exposedBuildings} buildings exposed; ${cur.state.closedEdges.length} road segments closed.` });
    }

    for (const inc of cur.state.activeIncidents) {
      if (!prev.state.activeIncidents.some(p => p.id === inc.id)) {
        events.push({ minute: m, kind: 'incident', title: `Incident ${inc.label} created — severity ${inc.severity}`, detail: inc.title });
      }
    }

    const prevClosed = new Set(prev.state.closedEdges.map(e => e.id));
    const curClosed = new Set(cur.state.closedEdges.map(e => e.id));
    const newly = cur.state.closedEdges.filter(e => !prevClosed.has(e.id));
    const reopened = prev.state.closedEdges.filter(e => !curClosed.has(e.id));
    for (const e of newly.filter(e => e.bridge)) {
      events.push({ minute: m, kind: 'closure', title: `${e.name} closed`, detail: cur.state.roads.get(e.id)!.reason });
    }
    const scripted = SCRIPTED_CLOSURES.find(c => c.atMin === m);
    if (scripted) events.push({ minute: m, kind: 'closure', title: 'Operator road closure', detail: scripted.label });
    const floodClosed = newly.filter(e => !e.bridge && e.id !== scripted?.edgeId);
    if (floodClosed.length > 0) {
      events.push({
        minute: m,
        kind: 'closure',
        title: `${floodClosed.length} road segment${floodClosed.length > 1 ? 's' : ''} closed by flood rule`,
        detail: Array.from(new Set(floodClosed.map(e => e.name))).join(', ')
      });
    }
    if (reopened.length > 0) {
      events.push({ minute: m, kind: 'reopen', title: `${reopened.length} segment${reopened.length > 1 ? 's' : ''} reopened as water recedes`, detail: Array.from(new Set(reopened.map(e => e.name))).join(', ') });
    }

    for (const a of cur.assignments) {
      const before = prev.assignments.find(p => p.incident.id === a.incident.id);
      if (a.status === 'assigned' && a.route && a.ambulance) {
        if (!before || before.status !== 'assigned') {
          events.push({ minute: m, kind: 'assignment', title: `${a.ambulance.id} assigned to Incident ${a.incident.label}`, detail: `Simulated ETA ${formatMinutes(a.route.timeS)} via ${routeStreetNames(city, a.route).join(' → ')}.` });
        } else if (before.ambulance?.id !== a.ambulance.id) {
          events.push({ minute: m, kind: 'route_change', title: `Incident ${a.incident.label} reassigned ${before.ambulance?.id} → ${a.ambulance.id}`, detail: `New simulated ETA ${formatMinutes(a.route.timeS)} (was ${formatMinutes(before.route?.timeS ?? Infinity)}).` });
        } else if (before.route && before.route.edgeIds.join() !== a.route.edgeIds.join() && Math.abs(a.route.timeS - before.route.timeS) >= 18) {
          events.push({ minute: m, kind: 'route_change', title: `Route change for ${a.ambulance.id} → Incident ${a.incident.label}`, detail: `${formatMinutes(before.route.timeS)} → ${formatMinutes(a.route.timeS)} via ${routeStreetNames(city, a.route).join(' → ')}.` });
        }
      } else if (a.status === 'unreachable' && before?.status !== 'unreachable') {
        events.push({ minute: m, kind: 'unreachable', title: `Incident ${a.incident.label} cut off by road`, detail: 'No drivable route from any available ambulance — boat team recommended.' });
      }
    }
  }
  return { snapshots, events };
}

export { MILL_BRIDGE_ID };
