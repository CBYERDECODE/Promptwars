import { describe, it, expect } from 'vitest';
import {
  CHAIN_FRAMING,
  COMMODITIES,
  SIMULATED_DEPOTS,
  SUPPLY_LABEL,
  SUPPLY_PARAMETERS,
  computeSupplyPlan,
  deriveExposure,
  getSimulatedDepots
} from './supply.js';
import { getSimulatedDataset, MILL_BRIDGE_EDGE_KEY } from './simulation.js';

const dataset = getSimulatedDataset();

/** Convenience: how much of a commodity the plan actually allocated. */
function allocated(plan: ReturnType<typeof computeSupplyPlan>, commodityId: string): number {
  return plan.commodity_summary.find(row => row.commodity_id === commodityId)?.allocated ?? 0;
}

function required(plan: ReturnType<typeof computeSupplyPlan>, commodityId: string): number {
  return plan.commodity_summary.find(row => row.commodity_id === commodityId)?.required ?? 0;
}

describe('Chain — simulated labelling and determinism', () => {
  it('labels itself as simulated and carries the distribution framing', () => {
    const plan = computeSupplyPlan(dataset);
    expect(plan.is_simulated).toBe(true);
    expect(plan.label).toBe(SUPPLY_LABEL);
    expect(plan.label.startsWith('SIMULATED')).toBe(true);
    expect(plan.framing).toBe(CHAIN_FRAMING);
  });

  it('is byte-identical across repeated calls with the same inputs', () => {
    const first = computeSupplyPlan(dataset, { planning_horizon_days: 3 });
    const second = computeSupplyPlan(dataset, { planning_horizon_days: 3 });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('returns an isolated depot copy so callers cannot mutate the shared constant', () => {
    const depots = getSimulatedDepots();
    depots[0].stock.WATER = 999999;
    expect(SIMULATED_DEPOTS[0].stock.WATER).not.toBe(999999);
    expect(getSimulatedDepots()[0].stock.WATER).toBe(SIMULATED_DEPOTS[0].stock.WATER);
  });
});

describe('Chain — needs are derived honestly from the dataset', () => {
  it('never invents a casualty figure where reports exist, and flags the silent zone as a data gap', () => {
    const exposure = deriveExposure(dataset);
    const byZone = new Map(exposure.map(zone => [zone.zone_id, zone]));

    // Reported zones use the figures the reports actually claim.
    expect(byZone.get('z-northgate')?.basis).toBe('REPORTED');
    expect(byZone.get('z-northgate')?.planned_people).toBe(24);
    expect(byZone.get('z-riverside')?.planned_people).toBe(30);

    // The silent zone is a data gap, never a safe zone.
    const silent = byZone.get('z-cedarhollow');
    expect(silent?.basis).toBe('DATA_GAP_ESTIMATE');
    expect(silent?.reported_people).toBe(0);
    expect(silent?.planned_people).toBe(
      Math.ceil(2600 * SUPPLY_PARAMETERS.unobservedExposureShare)
    );
    expect(silent?.detail).toContain('data gap');
    // Silence must be stated as unknown, never as reassurance.
    expect(silent?.detail).toContain('not evidence that the area is safe');
  });

  it('computes demand from documented per-person rates and the planning horizon', () => {
    const plan = computeSupplyPlan(dataset, { planning_horizon_days: 3 });
    // 336 planned people across five zones × 3 L/day × 3 days.
    expect(required(plan, 'WATER')).toBe(336 * SUPPLY_PARAMETERS.waterLitresPerPersonPerDay * 3);
    expect(required(plan, 'FOOD')).toBe(336 * SUPPLY_PARAMETERS.foodMealsPerPersonPerDay * 3);

    const oneDay = computeSupplyPlan(dataset, { planning_horizon_days: 1 });
    expect(required(oneDay, 'WATER')).toBe(336 * SUPPLY_PARAMETERS.waterLitresPerPersonPerDay);
    expect(required(oneDay, 'WATER')).toBeLessThan(required(plan, 'WATER'));
  });

  it('states the arithmetic behind every demand line', () => {
    const plan = computeSupplyPlan(dataset);
    expect(plan.requirements).toHaveLength(5 * COMMODITIES.length);
    for (const line of plan.requirements) {
      expect(line.reasons.length).toBeGreaterThan(0);
      expect(line.required).toBeGreaterThan(0);
    }
  });
});

describe('Chain — the distribution order is the fairness rule', () => {
  it('serves confirmed reported need before need estimated from a data gap', () => {
    const plan = computeSupplyPlan(dataset);
    const firstEstimated = plan.requirements.findIndex(line => line.basis === 'DATA_GAP_ESTIMATE');
    const lastReported = plan.requirements.map(line => line.basis).lastIndexOf('REPORTED');

    expect(firstEstimated).toBeGreaterThan(-1);
    expect(lastReported).toBeLessThan(firstEstimated);

    // Everything after the first estimate is an estimate: the groups never interleave.
    expect(plan.requirements.slice(firstEstimated).every(line => line.basis === 'DATA_GAP_ESTIMATE')).toBe(true);
  });

  it('orders the reported group by severity, then by life-critical commodity first', () => {
    const plan = computeSupplyPlan(dataset);
    // Northgate (Critical) and Riverside (Critical) own the head of the queue;
    // the zone id breaks the severity tie, and water is committed before food.
    expect(plan.requirements[0]).toMatchObject({
      zone_id: 'z-northgate',
      commodity_id: 'WATER',
      basis: 'REPORTED'
    });
    expect(plan.requirements[1]).toMatchObject({ zone_id: 'z-northgate', commodity_id: 'FOOD' });
  });

  it('draws each first shipment from the nearest depot with stock on hand', () => {
    const plan = computeSupplyPlan(dataset);
    const first = plan.shipments[0];
    expect(first.zone_id).toBe('z-northgate');
    expect(first.commodity_id).toBe('WATER');
    // Hilltop Depot is 8 modelled minutes from Northgate — nearer than Central (16) or West (22).
    expect(first.depot_id).toBe('dep-hilltop');
    expect(first.quantity).toBe(216);
    expect(first.route[0]).toBe('hilltopdepot');
    expect(first.route[first.route.length - 1]).toBe('northgate');
    expect(first.reasons.length).toBeGreaterThan(0);
  });

  it('gives every shipment a modelled route that starts at its depot and ends at the zone', () => {
    const plan = computeSupplyPlan(dataset);
    const centroid = new Map(dataset.zones.map(zone => [zone.id, zone.centroid_node]));
    const depotNode = new Map(plan.depots.map(depot => [depot.id, depot.node_id]));

    expect(plan.shipments.length).toBeGreaterThan(0);
    for (const shipment of plan.shipments) {
      expect(shipment.route[0]).toBe(depotNode.get(shipment.depot_id));
      expect(shipment.route[shipment.route.length - 1]).toBe(centroid.get(shipment.zone_id));
      expect(shipment.travel_minutes).toBeGreaterThanOrEqual(0);
      expect(shipment.quantity).toBeGreaterThan(0);
    }
  });
});

describe('Chain — scarcity is reported, never hidden', () => {
  it('allocates exactly the stock that exists and reports the rest as unmet', () => {
    const plan = computeSupplyPlan(dataset);

    // The fixture is deliberately under-stocked, so nothing here is fully covered.
    expect(plan.metrics.fulfilment_pct).toBeLessThan(100);
    expect(plan.unmet.length).toBeGreaterThan(0);
    expect(plan.metrics.unmet_lines).toBeGreaterThan(0);

    // Total allocation is capped by total stock, commodity by commodity.
    const stockByCommodity = new Map<string, number>();
    for (const depot of plan.depots) {
      for (const commodity of COMMODITIES) {
        stockByCommodity.set(
          commodity.id,
          (stockByCommodity.get(commodity.id) ?? 0) + depot.stock[commodity.id]
        );
      }
    }
    for (const commodity of COMMODITIES) {
      const onHand = stockByCommodity.get(commodity.id) ?? 0;
      const need = required(plan, commodity.id);
      expect(allocated(plan, commodity.id)).toBe(Math.min(onHand, need));
      expect(plan.shipments.some(shipment => shipment.commodity_id === commodity.id)).toBe(true);
    }
  });

  it('explains every shortfall in plain language', () => {
    const plan = computeSupplyPlan(dataset);
    for (const row of plan.unmet) {
      expect(row.shortfall).toBeGreaterThan(0);
      expect(row.allocated + row.shortfall).toBe(row.required);
      expect(row.reason.length).toBeGreaterThan(20);
    }
    expect(plan.metrics.unmet_lines).toBe(plan.unmet.length);
  });

  it('says out loud that the data-gap zone is the one this plan under-serves', () => {
    const plan = computeSupplyPlan(dataset);
    const silentShortfalls = plan.unmet.filter(row => row.zone_id === 'z-cedarhollow');
    expect(silentShortfalls.length).toBeGreaterThan(0);
    expect(plan.disadvantaged_summary).toContain('Cedar Hollow');
    expect(plan.disadvantaged_summary).toContain('data gap');
    expect(plan.metrics.estimated_need_shortfall_lines).toBe(silentShortfalls.length);
    expect(plan.planning_confidence).not.toBe('High');
  });

  it('records the scarcity and the data gaps as active constraints', () => {
    const plan = computeSupplyPlan(dataset);
    const joined = plan.active_constraints.join(' ');
    expect(joined).toContain('Planning horizon');
    expect(joined).toContain('scarce');
    expect(joined).toContain('Cedar Hollow');
  });
});

describe('Chain — scenario toggles change the plan deterministically', () => {
  it('strands the west bank behind a closed Mill Bridge and serves it from West Depot alone', () => {
    const closed = computeSupplyPlan(dataset, { blocked_edge_keys: [MILL_BRIDGE_EDGE_KEY] });
    const westBank = new Set(['z-riverside', 'z-cedarhollow']);

    const westBankShipments = closed.shipments.filter(shipment => westBank.has(shipment.zone_id));
    expect(westBankShipments.length).toBeGreaterThan(0);
    // West Depot is the only depot with a modelled route to either zone.
    expect(westBankShipments.every(shipment => shipment.depot_id === 'dep-west')).toBe(true);
    // ...and there is none of it to spare, so its stock is exhausted.
    const westDepot = closed.depots.find(depot => depot.id === 'dep-west');
    expect(westDepot).toBeDefined();

    // The east-bank zones are still served, but not by the orphaned West Depot alone.
    expect(closed.shipments.some(shipment => shipment.zone_id === 'z-northgate')).toBe(true);
    expect(closed.active_constraints.join(' ')).toContain('Mill Bridge');

    // Compare with the open-bridge plan: with the bridge down, Cedar Hollow can
    // only be reached from West Depot, so it loses the East Depot stock that
    // reached it when the bridge was open — measurably less relief.
    const open = computeSupplyPlan(dataset);
    const shippedToCedarHollow = (plan: ReturnType<typeof computeSupplyPlan>) =>
      plan.shipments.filter(s => s.zone_id === 'z-cedarhollow').reduce((total, s) => total + s.quantity, 0);
    expect(shippedToCedarHollow(closed)).toBeLessThan(shippedToCedarHollow(open));
  });

  it('leaves a zone with nothing when no depot can reach it', () => {
    const plan = computeSupplyPlan(dataset, {
      // Both east-bank depots are unreachable from the west bank once the bridge is out,
      // so disabling West Depot strands Riverside Flats and Cedar Hollow completely.
      blocked_edge_keys: [MILL_BRIDGE_EDGE_KEY],
      unavailable_depot_ids: ['dep-west']
    });

    expect(plan.metrics.zones_isolated).toBe(2);
    expect(plan.shipments.some(shipment => shipment.zone_id === 'z-riverside')).toBe(false);
    expect(plan.shipments.some(shipment => shipment.zone_id === 'z-cedarhollow')).toBe(false);

    const isolated = plan.unmet.filter(row => row.zone_id === 'z-riverside');
    expect(isolated.length).toBeGreaterThan(0);
    expect(isolated.every(row => row.allocated === 0)).toBe(true);
    expect(isolated[0].reason).toContain('No depot has a modelled route');
    expect(plan.disadvantaged_summary).toContain('Riverside Flats');
    expect(plan.planning_confidence).toBe('Low');
  });

  it('honours a depot stock override without touching the shared fixture', () => {
    const plan = computeSupplyPlan(dataset, {
      depot_stock_overrides: { 'dep-central': { WATER: 0 } }
    });
    // Central's 900 litres are gone, so only Hilltop (500) and West (400) can supply water.
    expect(allocated(plan, 'WATER')).toBe(900);
    expect(SIMULATED_DEPOTS[0].stock.WATER).toBe(900);
  });

  it('removes an unavailable depot\'s stock from the totals', () => {
    const plan = computeSupplyPlan(dataset, { unavailable_depot_ids: ['dep-central'] });
    expect(plan.depots.find(depot => depot.id === 'dep-central')).toBeDefined();
    expect(plan.shipments.every(shipment => shipment.depot_id !== 'dep-central')).toBe(true);
    expect(allocated(plan, 'WATER')).toBe(900);
    expect(plan.active_constraints.join(' ')).toContain('Central Depot');
  });

  it('refuses to distribute anything when every depot is unavailable', () => {
    const plan = computeSupplyPlan(dataset, {
      unavailable_depot_ids: ['dep-central', 'dep-hilltop', 'dep-west']
    });
    expect(plan.shipments).toHaveLength(0);
    expect(plan.metrics.zones_isolated).toBe(5);
    expect(plan.metrics.zones_reached).toBe(0);
    expect(plan.disadvantaged_summary).toContain('every zone receives nothing');
    expect(plan.planning_confidence).toBe('Low');
  });
});
