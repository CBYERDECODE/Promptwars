import { describe, it, expect } from 'vitest';
import { SIMULATION_LABEL, getSimulatedDataset, MILL_BRIDGE_EDGE_KEY } from './simulation.js';
import { shortestPaths, travelMinutes } from './geo.js';

describe('simulated dataset', () => {
  it('is explicitly and unambiguously labelled as simulated', () => {
    const dataset = getSimulatedDataset();
    expect(dataset.is_simulated).toBe(true);
    expect(dataset.label).toBe(SIMULATION_LABEL);
    expect(dataset.label.startsWith('SIMULATED')).toBe(true);
    expect(dataset.city).toContain('fictional');
  });

  it('has the documented shape: 5 neighbourhoods, 3 ambulances, 2 rescue teams, 5 emergencies', () => {
    const dataset = getSimulatedDataset();
    expect(dataset.zones.length).toBe(5);
    expect(dataset.units.filter((unit) => unit.type === 'AMBULANCE').length).toBe(3);
    expect(dataset.units.filter((unit) => unit.type === 'RESCUE_TEAM').length).toBe(2);
    expect(dataset.incidents.length).toBe(5);
  });

  it('keeps reports concentrated in three zones and one zone completely silent', () => {
    const dataset = getSimulatedDataset();
    const byZone = new Map<string, number>();
    for (const report of dataset.reports) {
      byZone.set(report.zone_id, (byZone.get(report.zone_id) ?? 0) + 1);
    }
    expect(byZone.get('z-cedarhollow')).toBeUndefined();
    expect(byZone.get('z-riverside')).toBe(1);
    expect(byZone.get('z-marketrow')).toBe(12);
    expect(byZone.get('z-northgate')).toBe(11);
    expect(byZone.get('z-oldmill')).toBe(9);
  });

  it('gives every incident deterministic, ordered identifiers and a known zone', () => {
    const dataset = getSimulatedDataset();
    const ids = dataset.incidents.map((incident) => incident.id);
    expect(ids).toEqual([...ids].sort());
    for (const incident of dataset.incidents) {
      expect(dataset.zones.some((zone) => zone.id === incident.zone_id)).toBe(true);
      expect(dataset.graph.nodes.some((node) => node.id === incident.node_id)).toBe(true);
    }
  });

  it('returns an isolated copy so callers cannot mutate the shared constant', () => {
    const first = getSimulatedDataset();
    first.zones[0].population = 999999;
    first.incidents.pop();
    const second = getSimulatedDataset();
    expect(second.zones[0].population).not.toBe(999999);
    expect(second.incidents.length).toBe(5);
  });

  it('connects every node to every depot so no district is silently unreachable', () => {
    const dataset = getSimulatedDataset();
    for (const unit of dataset.units) {
      const reachable = shortestPaths(dataset.graph, unit.home_node);
      for (const incident of dataset.incidents) {
        expect(reachable.has(incident.node_id)).toBe(true);
      }
    }
  });

  it('models the Mill Bridge as the only link between the west bank and the rest of the city', () => {
    const dataset = getSimulatedDataset();
    const closed = new Set([MILL_BRIDGE_EDGE_KEY]);

    // With the bridge open, west-bank neighbourhoods can reach the city centre.
    expect(travelMinutes(dataset.graph, 'riverside', 'marketrow')).toBe(22);
    expect(travelMinutes(dataset.graph, 'cedarhollow', 'hospital')).not.toBeNull();

    // Closing it strands the whole west bank: no modelled route survives.
    expect(travelMinutes(dataset.graph, 'riverside', 'marketrow', closed)).toBeNull();
    expect(travelMinutes(dataset.graph, 'cedarhollow', 'hospital', closed)).toBeNull();
    // The bridge really is the bridge: the two banks are only connected through it.
    expect(dataset.graph.edges.filter((edge) => edge.label === 'Mill Bridge').length).toBe(1);
  });

  it('contains no personally identifying or sensitive attributes', () => {
    const serialised = JSON.stringify(getSimulatedDataset()).toLowerCase();
    for (const forbidden of ['phone', 'email', 'passport', 'ethnicity', 'religion', 'gender', 'diagnosis', 'patient']) {
      expect(serialised).not.toContain(forbidden);
    }
  });
});
