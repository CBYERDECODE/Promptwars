import { describe, it, expect } from 'vitest';
import { edgeKey, buildAdjacency, shortestPaths, travelMinutes, toBlockedKeySet } from './geo.js';
import { RoadGraph } from './rescue.js';

const tinyGraph: RoadGraph = {
  nodes: [
    { id: 'a', label: 'A', x: 0, y: 0 },
    { id: 'b', label: 'B', x: 1, y: 0 },
    { id: 'c', label: 'C', x: 0, y: 1 },
    { id: 'd', label: 'D', x: 1, y: 1 },
    { id: 'island', label: 'Island', x: 5, y: 5 }
  ],
  edges: [
    { from: 'a', to: 'b', minutes: 1 },
    { from: 'b', to: 'd', minutes: 1 },
    { from: 'a', to: 'c', minutes: 1 },
    { from: 'c', to: 'd', minutes: 1 }
  ]
};

describe('edgeKey', () => {
  it('produces the same key regardless of direction', () => {
    expect(edgeKey('a', 'b')).toBe('a|b');
    expect(edgeKey('b', 'a')).toBe('a|b');
    expect(edgeKey('z', 'y')).toBe('y|z');
  });
});

describe('shortestPaths', () => {
  it('finds the shortest distance and path', () => {
    const result = shortestPaths(tinyGraph, 'a');
    expect(result.get('d')?.minutes).toBe(2);
    expect(result.get('d')?.path).toEqual(['a', 'b', 'd']);
  });

  it('resolves equal-length paths deterministically (lexicographically smallest first hop)', () => {
    const first = shortestPaths(tinyGraph, 'a').get('d');
    const second = shortestPaths(tinyGraph, 'a').get('d');
    expect(first?.path).toEqual(second?.path);
    expect(first?.path).toEqual(['a', 'b', 'd']);
  });

  it('omits nodes that are unreachable from the source', () => {
    const result = shortestPaths(tinyGraph, 'a');
    expect(result.has('island')).toBe(false);
  });

  it('returns an empty map when the source node does not exist', () => {
    expect(shortestPaths(tinyGraph, 'nope').size).toBe(0);
  });

  it('treats the graph as undirected by default but honours one_way edges', () => {
    const directed: RoadGraph = {
      nodes: [
        { id: 'a', label: 'A', x: 0, y: 0 },
        { id: 'b', label: 'B', x: 1, y: 0 }
      ],
      edges: [{ from: 'a', to: 'b', minutes: 3, one_way: true }]
    };
    expect(travelMinutes(directed, 'a', 'b')).toBe(3);
    expect(travelMinutes(directed, 'b', 'a')).toBeNull();
  });

  it('never routes across a structurally blocked edge', () => {
    const blocked: RoadGraph = {
      nodes: [
        { id: 'a', label: 'A', x: 0, y: 0 },
        { id: 'b', label: 'B', x: 1, y: 0 },
        { id: 'c', label: 'C', x: 2, y: 0 }
      ],
      edges: [
        { from: 'a', to: 'b', minutes: 1, blocked: true },
        { from: 'b', to: 'c', minutes: 1 }
      ]
    };
    expect(travelMinutes(blocked, 'a', 'c')).toBeNull();
  });

  it('respects scenario road closures supplied as edge keys', () => {
    const closed = toBlockedKeySet([edgeKey('b', 'd')]);
    expect(travelMinutes(tinyGraph, 'a', 'd', closed)).toBe(2); // a-c-d still open
    const closedBoth = toBlockedKeySet([edgeKey('b', 'd'), edgeKey('c', 'd')]);
    expect(travelMinutes(tinyGraph, 'a', 'd', closedBoth)).toBeNull();
  });
});

describe('buildAdjacency', () => {
  it('creates both directions for undirected edges and one direction otherwise', () => {
    const adjacency = buildAdjacency(tinyGraph);
    expect(adjacency.get('a')?.map((entry) => entry.to)).toEqual(['b', 'c']);
    expect(adjacency.get('d')?.map((entry) => entry.to)).toEqual(['b', 'c']);
  });

  it('sorts neighbours so relaxation order never depends on input ordering', () => {
    const shuffled: RoadGraph = {
      nodes: tinyGraph.nodes,
      edges: [...tinyGraph.edges].reverse()
    };
    expect(buildAdjacency(shuffled).get('a')).toEqual(buildAdjacency(tinyGraph).get('a'));
  });

  it('ignores negative and non-finite travel times instead of inventing routes', () => {
    const corrupt: RoadGraph = {
      nodes: [
        { id: 'a', label: 'A', x: 0, y: 0 },
        { id: 'b', label: 'B', x: 1, y: 0 }
      ],
      edges: [
        { from: 'a', to: 'b', minutes: -5 },
        { from: 'a', to: 'b', minutes: Number.NaN }
      ]
    };
    expect(travelMinutes(corrupt, 'a', 'b')).toBeNull();
  });
});

describe('travelMinutes', () => {
  it('is zero for the same node and null when no route exists', () => {
    expect(travelMinutes(tinyGraph, 'a', 'a')).toBe(0);
    expect(travelMinutes(tinyGraph, 'a', 'island')).toBeNull();
  });
});
