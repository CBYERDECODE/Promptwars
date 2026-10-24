import type { RoadState } from './flood';
import type { Ambulance, City, RoadEdge, TwinIncident } from './types';

/**
 * Graph routing for the twin. Roads are undirected edges between intersection
 * nodes; the cost of an edge is its travel time in seconds at the free-flow
 * emergency speed multiplied by the flood speed factor. Closed edges are
 * removed from the graph. A* uses a straight-line / max-speed heuristic, which
 * never over-estimates, so it returns the same optimum as Dijkstra.
 */

export const MAX_SPEED_KMH = 45;
/** Fixed delay added per segment for intersections and turns. */
export const INTERSECTION_DELAY_S = 20;

export interface Route {
  found: boolean;
  fromNodeId: string;
  toNodeId: string;
  nodeIds: string[];
  edgeIds: string[];
  distanceM: number;
  timeS: number;
  /** Nodes settled during the search — reported to make the algorithm inspectable. */
  expandedNodes: number;
}

interface Adjacent {
  edge: RoadEdge;
  to: string;
}

const adjacencyCache = new WeakMap<City, Map<string, Adjacent[]>>();

function adjacency(city: City): Map<string, Adjacent[]> {
  const cached = adjacencyCache.get(city);
  if (cached) return cached;
  const map = new Map<string, Adjacent[]>();
  for (const node of city.nodes) map.set(node.id, []);
  for (const edge of city.edges) {
    map.get(edge.from)!.push({ edge, to: edge.to });
    map.get(edge.to)!.push({ edge, to: edge.from });
  }
  adjacencyCache.set(city, map);
  return map;
}

const nodeIndexCache = new WeakMap<City, Map<string, { x: number; y: number }>>();
function nodePos(city: City, id: string) {
  let cache = nodeIndexCache.get(city);
  if (!cache) {
    cache = new Map(city.nodes.map(n => [n.id, { x: n.x, y: n.y }]));
    nodeIndexCache.set(city, cache);
  }
  return cache.get(id)!;
}

export function edgeTravelTimeS(edge: RoadEdge, state?: RoadState): number {
  const factor = state ? state.speedFactor : 1;
  if (factor <= 0) return Infinity;
  return edge.lengthM / ((edge.speedKmh * factor) / 3.6) + INTERSECTION_DELAY_S;
}

/** Minimal binary heap keyed on priority. */
class MinHeap {
  private items: Array<{ id: string; p: number }> = [];
  get size() {
    return this.items.length;
  }
  push(id: string, p: number) {
    const a = this.items;
    a.push({ id, p });
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].p <= a[i].p) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }
  pop(): { id: string; p: number } | undefined {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].p < a[m].p) m = l;
        if (r < a.length && a[r].p < a[m].p) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

function search(
  city: City,
  roads: Map<string, RoadState> | undefined,
  fromId: string,
  toId: string,
  useHeuristic: boolean
): Route {
  const adj = adjacency(city);
  const target = nodePos(city, toId);
  const h = (id: string) => {
    if (!useHeuristic) return 0;
    const p = nodePos(city, id);
    return Math.hypot(p.x - target.x, p.y - target.y) / (MAX_SPEED_KMH / 3.6);
  };
  const g = new Map<string, number>([[fromId, 0]]);
  const prev = new Map<string, { node: string; edge: RoadEdge }>();
  const settled = new Set<string>();
  const heap = new MinHeap();
  heap.push(fromId, h(fromId));

  while (heap.size > 0) {
    const { id } = heap.pop()!;
    if (settled.has(id)) continue;
    settled.add(id);
    if (id === toId) break;
    const gi = g.get(id)!;
    for (const { edge, to } of adj.get(id) ?? []) {
      if (settled.has(to)) continue;
      const cost = edgeTravelTimeS(edge, roads?.get(edge.id));
      if (!Number.isFinite(cost)) continue;
      const tentative = gi + cost;
      if (tentative < (g.get(to) ?? Infinity)) {
        g.set(to, tentative);
        prev.set(to, { node: id, edge });
        heap.push(to, tentative + h(to));
      }
    }
  }

  if (!settled.has(toId)) {
    return { found: false, fromNodeId: fromId, toNodeId: toId, nodeIds: [], edgeIds: [], distanceM: 0, timeS: Infinity, expandedNodes: settled.size };
  }
  const nodeIds = [toId];
  const edgeIds: string[] = [];
  let distanceM = 0;
  let cursor = toId;
  while (cursor !== fromId) {
    const step = prev.get(cursor)!;
    edgeIds.unshift(step.edge.id);
    distanceM += step.edge.lengthM;
    nodeIds.unshift(step.node);
    cursor = step.node;
  }
  return { found: true, fromNodeId: fromId, toNodeId: toId, nodeIds, edgeIds, distanceM, timeS: g.get(toId)!, expandedNodes: settled.size };
}

export function aStarRoute(city: City, roads: Map<string, RoadState> | undefined, fromId: string, toId: string): Route {
  return search(city, roads, fromId, toId, true);
}

export function dijkstraRoute(city: City, roads: Map<string, RoadState> | undefined, fromId: string, toId: string): Route {
  return search(city, roads, fromId, toId, false);
}

/** One-to-all shortest travel times (Dijkstra), used for coverage analysis. */
export function travelTimesFrom(city: City, roads: Map<string, RoadState> | undefined, fromId: string): Map<string, number> {
  const adj = adjacency(city);
  const dist = new Map<string, number>([[fromId, 0]]);
  const settled = new Set<string>();
  const heap = new MinHeap();
  heap.push(fromId, 0);
  while (heap.size > 0) {
    const { id, p } = heap.pop()!;
    if (settled.has(id)) continue;
    settled.add(id);
    for (const { edge, to } of adj.get(id) ?? []) {
      const cost = edgeTravelTimeS(edge, roads?.get(edge.id));
      if (!Number.isFinite(cost)) continue;
      if (p + cost < (dist.get(to) ?? Infinity)) {
        dist.set(to, p + cost);
        heap.push(to, p + cost);
      }
    }
  }
  return dist;
}

export interface AmbulanceOption {
  ambulance: Ambulance;
  route: Route;
}

/** Rank every available ambulance by simulated travel time to an incident. */
export function rankAmbulances(city: City, roads: Map<string, RoadState>, incident: TwinIncident): AmbulanceOption[] {
  return city.ambulances
    .filter(a => a.status === 'available')
    .map(ambulance => ({ ambulance, route: aStarRoute(city, roads, ambulance.nodeId, incident.nodeId) }))
    .sort((a, b) => a.route.timeS - b.route.timeS);
}

export function edgeById(city: City, id: string): RoadEdge | undefined {
  return city.edges.find(e => e.id === id);
}

/** Collapse consecutive segments on the same street: "Mill Rd → Mill Bridge → Canal Ave". */
export function routeStreetNames(city: City, route: Route): string[] {
  const names: string[] = [];
  for (const id of route.edgeIds) {
    const name = edgeById(city, id)?.name ?? id;
    if (names[names.length - 1] !== name) names.push(name);
  }
  return names;
}

export function formatMinutes(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'unreachable';
  return `${(seconds / 60).toFixed(1)} min`;
}

export function formatKm(metres: number): string {
  return `${(metres / 1000).toFixed(2)} km`;
}

export interface RouteComparison {
  deltaTimeS: number;
  deltaDistanceM: number;
  sharedEdges: number;
  removedStreets: string[];
  addedStreets: string[];
}

export function compareRoutes(city: City, previous: Route, next: Route): RouteComparison {
  const prevSet = new Set(previous.edgeIds);
  const nextSet = new Set(next.edgeIds);
  const nameSet = (ids: string[]) => Array.from(new Set(ids.map(id => edgeById(city, id)?.name ?? id)));
  return {
    deltaTimeS: next.timeS - previous.timeS,
    deltaDistanceM: next.distanceM - previous.distanceM,
    sharedEdges: next.edgeIds.filter(id => prevSet.has(id)).length,
    removedStreets: nameSet(previous.edgeIds.filter(id => !nextSet.has(id))),
    addedStreets: nameSet(next.edgeIds.filter(id => !prevSet.has(id)))
  };
}

/**
 * Plain-language reasons for a route. Every sentence is derived from the
 * graph: the unconstrained (dry, no closures) optimum is computed and any
 * closed or slowed segments on it are named as the reason for a detour.
 */
export function explainRoute(city: City, roads: Map<string, RoadState>, route: Route): string[] {
  const lines: string[] = [];
  if (!route.found) {
    const ideal = aStarRoute(city, undefined, route.fromNodeId, route.toNodeId);
    const blocked = ideal.edgeIds
      .map(id => ({ edge: edgeById(city, id)!, state: roads.get(id) }))
      .filter(x => x.state?.status === 'closed');
    lines.push('No drivable path exists: every connection to the destination crosses a closed segment.');
    blocked.slice(0, 3).forEach(b => lines.push(`${b.edge.name}: ${b.state!.reason}.`));
    lines.push('Recommendation: assign a boat or high-clearance rescue team, or wait for water to recede.');
    return lines;
  }
  const streets = routeStreetNames(city, route);
  lines.push(
    `A* search settled ${route.expandedNodes} of ${city.nodes.length} intersections and chose ${streets.join(' → ')} (${formatKm(route.distanceM)}, ${formatMinutes(route.timeS)}).`
  );
  const ideal = aStarRoute(city, undefined, route.fromNodeId, route.toNodeId);
  const idealClosed = ideal.edgeIds.filter(id => roads.get(id)?.status === 'closed');
  if (idealClosed.length > 0) {
    const named = Array.from(new Set(idealClosed.map(id => edgeById(city, id)!.name)));
    lines.push(
      `The dry-weather fastest path (${formatMinutes(ideal.timeS)}) is blocked on ${named.join(', ')}; the detour adds ${formatMinutes(route.timeS - ideal.timeS)}.`
    );
    const reason = roads.get(idealClosed[0])?.reason;
    if (reason) lines.push(`Closure rule applied: ${reason}.`);
  } else if (route.timeS > ideal.timeS + 1) {
    lines.push(`Same corridor as the dry-weather path, but ${formatMinutes(route.timeS - ideal.timeS)} slower because of standing water.`);
  } else {
    lines.push('This matches the dry-weather fastest path — no closures affect it.');
  }
  const caution = route.edgeIds.filter(id => roads.get(id)?.status === 'caution');
  if (caution.length > 0) {
    lines.push(`${caution.length} segment(s) on this route have shallow standing water and are costed at half speed.`);
  }
  const bridge = route.edgeIds.map(id => edgeById(city, id)!).find(e => e.bridge);
  if (bridge) lines.push(`River crossing: ${bridge.name}.`);
  return lines;
}
