/**
 * Deterministic road-graph utilities (SIMULATED).
 *
 * All routing uses Dijkstra with explicit, reproducible tie-breaking: when two
 * candidate nodes share the same distance, the lexicographically smallest node
 * id wins, and adjacency lists are sorted by target id before relaxation. The
 * same graph + the same blocked segments therefore always produce identical
 * distances AND identical paths. No randomness, no clock, no I/O.
 */

import { GraphEdge, RoadGraph } from './rescue.js';

/** Canonical, direction-independent key for an undirected road segment. */
export function edgeKey(a: string, b: string): string {
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

export interface TravelEstimate {
  /** Modelled travel time in minutes. */
  minutes: number;
  /** Ordered node ids from source (inclusive) to target (inclusive). */
  path: string[];
}

/** A single relaxation candidate in the adjacency list. */
interface Neighbour {
  to: string;
  minutes: number;
}

/**
 * Build an adjacency list for the graph, dropping structurally blocked edges
 * and any edge explicitly listed in `blockedKeys` (from a scenario toggle).
 */
export function buildAdjacency(
  graph: RoadGraph,
  blockedKeys: ReadonlySet<string> = new Set<string>()
): Map<string, Neighbour[]> {
  const adjacency = new Map<string, Neighbour[]>();
  for (const node of graph.nodes) {
    adjacency.set(node.id, []);
  }

  for (const edge of graph.edges) {
    if (edge.blocked) continue;
    if (!Number.isFinite(edge.minutes) || edge.minutes < 0) continue;
    if (blockedKeys.has(edgeKey(edge.from, edge.to))) continue;

    const forward = adjacency.get(edge.from);
    if (!forward) continue;
    forward.push({ to: edge.to, minutes: edge.minutes });

    if (!edge.one_way) {
      const backward = adjacency.get(edge.to);
      if (backward) backward.push({ to: edge.from, minutes: edge.minutes });
    }
  }

  // Deterministic relaxation order.
  for (const list of adjacency.values()) {
    list.sort((a, b) => compareIds(a.to, b.to));
  }

  return adjacency;
}

/** Lexicographic string comparison used for every tie-break in this module. */
export function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function reconstructPath(
  target: string,
  previous: ReadonlyMap<string, string | null>
): string[] {
  const path: string[] = [];
  let cursor: string | null | undefined = target;
  // Bounded by node count; the guard also protects against a malformed cycle.
  while (cursor !== null && cursor !== undefined && path.length < previous.size + 1) {
    path.push(cursor);
    cursor = previous.get(cursor) ?? null;
  }
  return path.reverse();
}

/**
 * Single-source shortest paths. Nodes unreachable from `source` are omitted
 * from the result (the caller must treat a missing node as "no route").
 */
export function shortestPaths(
  graph: RoadGraph,
  source: string,
  blockedKeys: ReadonlySet<string> = new Set<string>()
): Map<string, TravelEstimate> {
  const adjacency = buildAdjacency(graph, blockedKeys);
  const nodeIds = graph.nodes.map((node) => node.id).sort(compareIds);
  const results = new Map<string, TravelEstimate>();

  const previous = new Map<string, string | null>();
  if (!adjacency.has(source)) return results;

  const distance = new Map<string, number>();
  const settled = new Set<string>();
  for (const id of nodeIds) {
    distance.set(id, Number.POSITIVE_INFINITY);
    previous.set(id, null);
  }
  distance.set(source, 0);

  // Linear-scan selection: O(V^2) but fully deterministic and trivial to audit.
  // The simulated graphs are small (a few dozen nodes), so this is more than fast enough.
  while (settled.size < nodeIds.length) {
    let current: string | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const id of nodeIds) {
      if (settled.has(id)) continue;
      const candidate = distance.get(id) as number;
      // Strict `<` keeps the first (lexicographically smallest) node on a tie.
      if (candidate < best) {
        best = candidate;
        current = id;
      }
    }
    if (current === null || !Number.isFinite(best)) break;
    settled.add(current);

    for (const neighbour of adjacency.get(current) ?? []) {
      if (settled.has(neighbour.to)) continue;
      const relaxed = best + neighbour.minutes;
      if (relaxed < (distance.get(neighbour.to) as number)) {
        distance.set(neighbour.to, relaxed);
        previous.set(neighbour.to, current);
      }
    }
  }

  for (const id of nodeIds) {
    const value = distance.get(id) as number;
    if (!Number.isFinite(value)) continue;
    results.set(id, { minutes: value, path: reconstructPath(id, previous) });
  }

  return results;
}

/** Modelled travel time between two nodes, or null when no route exists. */
export function travelMinutes(
  graph: RoadGraph,
  from: string,
  to: string,
  blockedKeys: ReadonlySet<string> = new Set<string>()
): number | null {
  if (from === to) return 0;
  const estimate = shortestPaths(graph, from, blockedKeys).get(to);
  return estimate ? estimate.minutes : null;
}

/** Convenience: turn an array of scenario keys into a lookup set. */
export function toBlockedKeySet(keys: string[] | undefined): Set<string> {
  return new Set(keys ?? []);
}

/** Sanity helper used by the generator and by tests. */
export function graphEdgesOf(graph: RoadGraph, nodeId: string): GraphEdge[] {
  return graph.edges.filter((edge) => edge.from === nodeId || edge.to === nodeId);
}
