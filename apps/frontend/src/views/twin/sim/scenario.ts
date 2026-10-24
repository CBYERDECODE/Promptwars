import { computeFlood, evaluateRoads, FloodResult, RoadState } from './flood';
import type { City, RoadEdge, TwinIncident } from './types';

/** Operator-controlled inputs that fully determine a simulation state. */
export interface SimInputs {
  waterLevelM: number;
  manualEdgeIds: string[];
  manualBridgeIds: string[];
  activeIncidentIds: string[];
}

export interface SimState {
  city: City;
  inputs: SimInputs;
  flood: FloodResult;
  roads: Map<string, RoadState>;
  activeIncidents: TwinIncident[];
  closedEdges: RoadEdge[];
  cautionEdges: RoadEdge[];
  closedBridges: RoadEdge[];
}

export function computeSimState(city: City, inputs: SimInputs): SimState {
  const flood = computeFlood(city, inputs.waterLevelM);
  const roads = evaluateRoads(city, flood, {
    manualEdgeIds: inputs.manualEdgeIds,
    manualBridgeIds: inputs.manualBridgeIds
  });
  const active = new Set(inputs.activeIncidentIds);
  const closedEdges = city.edges.filter(e => roads.get(e.id)?.status === 'closed');
  return {
    city,
    inputs,
    flood,
    roads,
    activeIncidents: city.incidents.filter(i => active.has(i.id)),
    closedEdges,
    cautionEdges: city.edges.filter(e => roads.get(e.id)?.status === 'caution'),
    closedBridges: closedEdges.filter(e => e.bridge)
  };
}

export function stateBasis(state: SimState): string {
  return `Simulated state: water ${state.inputs.waterLevelM.toFixed(1)} m · ${state.flood.exposedBuildings} exposed buildings · ${state.closedEdges.length} closed segments (${state.closedBridges.length} bridge${state.closedBridges.length === 1 ? '' : 's'}) · ${state.activeIncidents.length} active incidents`;
}
