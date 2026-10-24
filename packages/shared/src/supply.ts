/**
 * Chain — relief supply distribution (SIMULATED), Tier 3.
 *
 * DETERMINISM
 * -----------
 * Demand is derived from the dataset with fixed arithmetic, and distribution is
 * a single greedy pass over a fully ordered demand list. Routes come from the
 * deterministic router in `geo.ts`. No randomness and no clock, so identical
 * inputs always produce identical plans, including identical tie-breaks.
 *
 * FAIRNESS CONTRACT
 * -----------------
 * Stock is deliberately scarce in this exercise, so the *order* in which demand
 * is served is the whole point. A demand line is always ordered by:
 *   1. confirmed reported need before need estimated from a data gap;
 *   2. the most severe zone before the less severe zone;
 *   3. zone id, as a stable tie-break — so a whole zone's requirement is
 *      committed before the next zone's, and "most severe first" is literally
 *      true rather than true per commodity;
 *   4. life-critical commodities (water, food) before the rest, within a zone.
 * Silence is never treated as safety: a zone with no reports still receives a
 * population-based planning estimate, explicitly flagged `DATA_GAP_ESTIMATE` and
 * served last — and the plan states plainly that this under-serves it.
 *
 * SAFETY
 * ------
 * The engine only *proposes* a distribution. Nothing here dispatches a truck:
 * every plan is surfaced for a recorded human decision.
 */

import { Severity, SimulationDataset, SimZone } from './rescue.js';
import { compareIds, shortestPaths } from './geo.js';
import { isHighSeverity, severityRank } from './severity.js';

export type CommodityId = 'WATER' | 'FOOD' | 'MEDICAL_KIT' | 'SHELTER_KIT';

export interface Commodity {
  id: CommodityId;
  label: string;
  /** Unit every quantity of this commodity is expressed in. */
  unit: string;
  /** Lower = more life-critical. Used only for ordering, never for scoring. */
  rank: number;
}

/**
 * The commodity catalogue, in the order demand is served. Water before food
 * before medical before shelter: a planning order, stated here rather than
 * buried in a comparator.
 */
export const COMMODITIES: Commodity[] = [
  { id: 'WATER', label: 'Drinking water', unit: 'litres', rank: 1 },
  { id: 'FOOD', label: 'Food rations', unit: 'meals', rank: 2 },
  { id: 'MEDICAL_KIT', label: 'Medical kits', unit: 'kits', rank: 3 },
  { id: 'SHELTER_KIT', label: 'Shelter kits', unit: 'kits', rank: 4 }
];

/* ------------------------------------------------------------------ */
/* Depots                                                              */
/* ------------------------------------------------------------------ */

export interface SimDepot {
  id: string;
  label: string;
  /** Graph node the depot loads out from. */
  node_id: string;
  /** Simulated stock on hand, per commodity. */
  stock: Record<CommodityId, number>;
}

/**
 * SIMULATED relief stock. The totals are deliberately insufficient for the
 * modelled demand — that scarcity is what makes the distribution order (and who
 * pays for it) visible instead of theoretical.
 */
export const SIMULATED_DEPOTS: SimDepot[] = [
  {
    id: 'dep-central',
    label: 'Central Depot',
    node_id: 'centraldepot',
    stock: { WATER: 900, FOOD: 700, MEDICAL_KIT: 12, SHELTER_KIT: 30 }
  },
  {
    id: 'dep-hilltop',
    label: 'Hilltop Depot',
    node_id: 'hilltopdepot',
    stock: { WATER: 500, FOOD: 400, MEDICAL_KIT: 8, SHELTER_KIT: 18 }
  },
  {
    id: 'dep-west',
    label: 'West Depot',
    node_id: 'westdepot',
    stock: { WATER: 400, FOOD: 300, MEDICAL_KIT: 6, SHELTER_KIT: 14 }
  }
];

/** Independent copy so callers can never mutate the shared constant. */
export function getSimulatedDepots(): SimDepot[] {
  return JSON.parse(JSON.stringify(SIMULATED_DEPOTS)) as SimDepot[];
}

/* ------------------------------------------------------------------ */
/* Parameters and framing                                              */
/* ------------------------------------------------------------------ */

export const SUPPLY_PARAMETERS = {
  /** Days of relief a single distribution round is planned to cover. */
  planningHorizonDays: 3,
  maxPlanningHorizonDays: 14,
  /** Litres of drinking water per person per day. */
  waterLitresPerPersonPerDay: 3,
  /** Meals per person per day. */
  foodMealsPerPersonPerDay: 3,
  /** Shelter kits per person covered by the plan (rounded up). */
  shelterKitsPerPerson: 0.25,
  /** Medical kits committed per Critical/High incident in a zone. */
  medicalKitsPerHighSeverityIncident: 5,
  /** Medical kits committed per other incident in a zone. */
  medicalKitsPerOtherIncident: 2,
  /** Medical kits allowed per person in a zone that has no incident records. */
  medicalKitsPerUnreportedPerson: 0.05,
  /**
   * Share of a zone's population used as a floor when the zone has produced no
   * usable casualty figures. Silence raises uncertainty, so the plan must still
   * assume someone is there — it never reads silence as safety.
   */
  unobservedExposureShare: 0.1
} as const;

export const SUPPLY_LABEL = 'SIMULATED — relief supply chain exercise';

/** Shipped verbatim with every plan. */
export const CHAIN_FRAMING =
  'Distribution proposal only. It allocates simulated relief stock along a modelled road network and must be approved by a human coordinator before anything moves.';

export const CHAIN_NOTICE =
  'SIMULATED EXERCISE. The depots, stock levels, road times, populations and incidents are fictional. ' +
  'Nothing here is a real-world prediction, and no shipment is dispatched automatically.';

/* ------------------------------------------------------------------ */
/* Needs                                                               */
/* ------------------------------------------------------------------ */

/**
 * How a demand figure was arrived at. `REPORTED` means casualty figures reached
 * the coordinator; `DATA_GAP_ESTIMATE` means the zone produced none, so the
 * figure is a population-based planning floor that must be presented as
 * uncertain rather than measured.
 */
export type NeedBasis = 'REPORTED' | 'DATA_GAP_ESTIMATE';

export interface ZoneExposure {
  zone_id: string;
  zone_name: string;
  population: number;
  /** People the zone's own reports actually claim. */
  reported_people: number;
  /** Incidents inside the zone that never stated a headcount. */
  incidents_without_headcount: number;
  /** The planning figure the demand is computed from. */
  planned_people: number;
  basis: NeedBasis;
  highest_severity: Severity | null;
  detail: string;
}

export interface RequirementLine {
  zone_id: string;
  zone_name: string;
  commodity_id: CommodityId;
  commodity_label: string;
  unit: string;
  required: number;
  basis: NeedBasis;
  highest_severity: Severity | null;
  /** Why this quantity was planned, in plain language. */
  reasons: string[];
}

export interface Shipment {
  depot_id: string;
  depot_label: string;
  zone_id: string;
  zone_name: string;
  commodity_id: CommodityId;
  commodity_label: string;
  unit: string;
  quantity: number;
  /** Modelled travel time in minutes. Shipments are only created when a route exists. */
  travel_minutes: number;
  /** Ordered node ids from the depot to the zone's access node. */
  route: string[];
  /** True when this shipment answers need that was only estimated from a data gap. */
  estimated: boolean;
  reasons: string[];
}

export interface UnmetRequirement {
  zone_id: string;
  zone_name: string;
  commodity_id: CommodityId;
  commodity_label: string;
  unit: string;
  required: number;
  allocated: number;
  shortfall: number;
  basis: NeedBasis;
  reason: string;
}

export interface CommoditySummary {
  commodity_id: CommodityId;
  label: string;
  unit: string;
  required: number;
  allocated: number;
  shortfall: number;
  fulfilment_pct: number;
}

export interface SupplyMetrics {
  shipments: number;
  /** Mean per-line fulfilment (allocated / required), 0..100. */
  fulfilment_pct: number;
  demand_lines: number;
  fully_met_lines: number;
  partially_met_lines: number;
  unmet_lines: number;
  zones_reached: number;
  /** Zones that received nothing at all. */
  zones_isolated: number;
  total_travel_minutes: number;
  worst_travel_minutes: number | null;
  estimated_need_lines: number;
  estimated_need_shortfall_lines: number;
}

export interface SupplyPlan {
  is_simulated: true;
  label: string;
  framing: string;
  exposure: ZoneExposure[];
  requirements: RequirementLine[];
  shipments: Shipment[];
  unmet: UnmetRequirement[];
  commodity_summary: CommoditySummary[];
  metrics: SupplyMetrics;
  active_constraints: string[];
  /** Plain-language summary of who is left short by this plan. */
  disadvantaged_summary: string;
  /** Confidence in the plan's own completeness. Never a statement about the hazard. */
  planning_confidence: 'Low' | 'Medium' | 'High';
}

export interface SupplyScenario {
  /** Undirected edge keys (`"a|b"`, alphabetically sorted) to block. */
  blocked_edge_keys?: string[];
  /** Depots that cannot load out (flooded, staffed down, etc.). */
  unavailable_depot_ids?: string[];
  /** Scenario override of a depot's stock on hand. */
  depot_stock_overrides?: Record<string, Partial<Record<CommodityId, number>>>;
  /** Planning horizon in days; defaults to `SUPPLY_PARAMETERS.planningHorizonDays`. */
  planning_horizon_days?: number;
}

export interface SupplyPlanDetail extends SupplyPlan {
  /** Depots as the plan actually used them (availability and overrides applied). */
  depots: SimDepot[];
  planning_horizon_days: number;
  total_incidents: number;
}

/* ------------------------------------------------------------------ */
/* Public entry point                                                  */
/* ------------------------------------------------------------------ */

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function basisRank(basis: NeedBasis): number {
  return basis === 'REPORTED' ? 0 : 1;
}

function zoneSeverityRank(line: { highest_severity: Severity | null }): number {
  return line.highest_severity === null ? 0 : severityRank(line.highest_severity);
}

/**
 * Derive who is assumed to need relief in each zone.
 *
 * A zone only gets the population-based floor when its reports produced no
 * usable headcount at all. That is a data gap, not a quiet neighbourhood, and
 * the returned `detail` always says which of the two it is.
 */
export function deriveExposure(dataset: SimulationDataset): ZoneExposure[] {
  return dataset.zones.map((zone: SimZone) => {
    const zoneIncidents = dataset.incidents.filter((incident) => incident.zone_id === zone.id);

    let reportedPeople = 0;
    let withoutHeadcount = 0;
    let highestSeverity: Severity | null = null;

    for (const incident of zoneIncidents) {
      if (incident.people_at_risk === null) {
        withoutHeadcount += 1;
      } else {
        reportedPeople += incident.people_at_risk;
      }
      if (highestSeverity === null || severityRank(incident.severity) > severityRank(highestSeverity)) {
        highestSeverity = incident.severity;
      }
    }

    if (reportedPeople > 0) {
      return {
        zone_id: zone.id,
        zone_name: zone.name,
        population: zone.population,
        reported_people: reportedPeople,
        incidents_without_headcount: withoutHeadcount,
        planned_people: reportedPeople,
        basis: 'REPORTED' as const,
        highest_severity: highestSeverity,
        detail: `${reportedPeople} people are named in ${zoneIncidents.length} report(s) reaching the coordinator from ${zone.name}.`
      };
    }

    const plannedPeople = Math.ceil(zone.population * SUPPLY_PARAMETERS.unobservedExposureShare);
    const detail =
      zoneIncidents.length === 0
        ? `${zone.name} has recorded no incidents at all, so no casualty figure exists. Planning assumes ${SUPPLY_PARAMETERS.unobservedExposureShare * 100}% of its ${zone.population} simulated residents need relief. This is a data gap, not evidence that the area is safe.`
        : `${zoneIncidents.length} incident(s) are recorded in ${zone.name} but none states a headcount. Planning assumes ${SUPPLY_PARAMETERS.unobservedExposureShare * 100}% of its ${zone.population} simulated residents need relief until a verified figure exists.`;

    return {
      zone_id: zone.id,
      zone_name: zone.name,
      population: zone.population,
      reported_people: 0,
      incidents_without_headcount: withoutHeadcount,
      planned_people: plannedPeople,
      basis: 'DATA_GAP_ESTIMATE' as const,
      highest_severity: highestSeverity,
      detail
    };
  });
}

/**
 * Turn exposure into a demand line per zone and commodity. Pure arithmetic from
 * the exposure figure and the dataset's own incidents — nothing is sampled or
 * guessed beyond the parameters above.
 */
export function deriveRequirements(
  dataset: SimulationDataset,
  horizonDays: number = SUPPLY_PARAMETERS.planningHorizonDays
): RequirementLine[] {
  const lines: RequirementLine[] = [];

  for (const zone of deriveExposure(dataset)) {
    const zoneIncidents = dataset.incidents.filter((incident) => incident.zone_id === zone.zone_id);
    const waterLitres = Math.ceil(
      zone.planned_people * SUPPLY_PARAMETERS.waterLitresPerPersonPerDay * horizonDays
    );
    const foodMeals = Math.ceil(zone.planned_people * SUPPLY_PARAMETERS.foodMealsPerPersonPerDay * horizonDays);
    const shelterKits = Math.ceil(zone.planned_people * SUPPLY_PARAMETERS.shelterKitsPerPerson);
    const medicalKits =
      zoneIncidents.length === 0
        ? Math.ceil(zone.planned_people * SUPPLY_PARAMETERS.medicalKitsPerUnreportedPerson)
        : zoneIncidents.reduce(
            (total, incident) =>
              total +
              (isHighSeverity(incident.severity)
                ? SUPPLY_PARAMETERS.medicalKitsPerHighSeverityIncident
                : SUPPLY_PARAMETERS.medicalKitsPerOtherIncident),
            0
          );

    const quantities: Record<CommodityId, { required: number; reasons: string[] }> = {
      WATER: {
        required: waterLitres,
        reasons: [
          `${zone.planned_people} people × ${SUPPLY_PARAMETERS.waterLitresPerPersonPerDay} litres/day × ${horizonDays} day(s).`
        ]
      },
      FOOD: {
        required: foodMeals,
        reasons: [
          `${zone.planned_people} people × ${SUPPLY_PARAMETERS.foodMealsPerPersonPerDay} meals/day × ${horizonDays} day(s).`
        ]
      },
      MEDICAL_KIT: {
        required: medicalKits,
        reasons:
          zoneIncidents.length === 0
            ? [
                `${SUPPLY_PARAMETERS.medicalKitsPerUnreportedPerson} kits per person in a zone with no incident records — committed against the data gap, not a confirmed injury count.`
              ]
            : [
                `${zoneIncidents.filter((incident) => isHighSeverity(incident.severity)).length} Critical/High incident(s) × ${
                  SUPPLY_PARAMETERS.medicalKitsPerHighSeverityIncident
                } kits, plus ${
                  zoneIncidents.filter((incident) => !isHighSeverity(incident.severity)).length
                } other incident(s) × ${SUPPLY_PARAMETERS.medicalKitsPerOtherIncident} kits.`
              ]
      },
      SHELTER_KIT: {
        required: shelterKits,
        reasons: [
          `${zone.planned_people} people × ${SUPPLY_PARAMETERS.shelterKitsPerPerson} kits/person, rounded up.`
        ]
      }
    };

    for (const commodity of COMMODITIES) {
      const entry = quantities[commodity.id];
      lines.push({
        zone_id: zone.zone_id,
        zone_name: zone.zone_name,
        commodity_id: commodity.id,
        commodity_label: commodity.label,
        unit: commodity.unit,
        required: entry.required,
        basis: zone.basis,
        highest_severity: zone.highest_severity,
        reasons: entry.reasons
      });
    }
  }

  return lines;
}

/**
 * Compute a distribution plan.
 *
 * Demand is ordered once (see the fairness contract at the top of this file) and
 * then served by drawing from the nearest reachable depot first. The first
 * failure to serve a line is explained in `unmet`; nothing is silently dropped.
 */
export function computeSupplyPlan(
  dataset: SimulationDataset,
  scenario: SupplyScenario = {}
): SupplyPlanDetail {
  const horizonDays =
    scenario.planning_horizon_days === undefined
      ? SUPPLY_PARAMETERS.planningHorizonDays
      : Math.max(1, Math.floor(scenario.planning_horizon_days));

  const blockedKeys = new Set(scenario.blocked_edge_keys ?? []);
  const unavailable = new Set(scenario.unavailable_depot_ids ?? []);
  const overrides = scenario.depot_stock_overrides ?? {};

  const depots: SimDepot[] = getSimulatedDepots().map((depot) => {
    const override = overrides[depot.id];
    if (!override) return depot;
    const stock = { ...depot.stock };
    for (const commodity of COMMODITIES) {
      const value = override[commodity.id];
      if (value === undefined) continue;
      stock[commodity.id] = Math.max(0, Math.floor(value));
    }
    return { ...depot, stock };
  });

  const availableDepots = depots.filter((depot) => !unavailable.has(depot.id));
  const exposure = deriveExposure(dataset);
  const requirements = deriveRequirements(dataset, horizonDays);

  /* --- Routes: one Dijkstra run per available depot -------------------- */
  const depotOrder = [...availableDepots].sort((a, b) => compareIds(a.id, b.id));
  const routes = new Map<string, Map<string, { minutes: number; path: string[] }>>();
  for (const depot of depotOrder) {
    const estimates = shortestPaths(dataset.graph, depot.node_id, blockedKeys);
    const byNode = new Map<string, { minutes: number; path: string[] }>();
    for (const [nodeId, estimate] of estimates) {
      byNode.set(nodeId, { minutes: estimate.minutes, path: [...estimate.path] });
    }
    routes.set(depot.id, byNode);
  }

  const nodeToZoneAccess = new Map(dataset.zones.map((zone) => [zone.id, zone.centroid_node]));

  /* --- Serve demand in the documented order ---------------------------- */
  const orderedLines = [...requirements].sort((a, b) => {
    const basisDiff = basisRank(a.basis) - basisRank(b.basis);
    if (basisDiff !== 0) return basisDiff;
    const severityDiff = zoneSeverityRank(b) - zoneSeverityRank(a);
    if (severityDiff !== 0) return severityDiff;
    // Zone-major from here on: a zone's whole requirement is committed before
    // the next zone's, so "most severe zone first" is literally true.
    const zoneDiff = compareIds(a.zone_id, b.zone_id);
    if (zoneDiff !== 0) return zoneDiff;
    const rankA = COMMODITIES.find((commodity) => commodity.id === a.commodity_id)?.rank ?? 99;
    const rankB = COMMODITIES.find((commodity) => commodity.id === b.commodity_id)?.rank ?? 99;
    return rankA - rankB;
  });

  const workingStock = new Map<string, Record<CommodityId, number>>();
  for (const depot of depotOrder) {
    workingStock.set(depot.id, { ...depot.stock });
  }

  const shipments: Shipment[] = [];
  const unmet: UnmetRequirement[] = [];

  for (const line of orderedLines) {
    const accessNode = nodeToZoneAccess.get(line.zone_id);
    const estimated = line.basis === 'DATA_GAP_ESTIMATE';

    // Nearest reachable depot first; depot id breaks ties so the order is stable.
    const reachable = depotOrder
      .map((depot) => ({ depot, estimate: accessNode ? routes.get(depot.id)?.get(accessNode) : undefined }))
      .filter((candidate): candidate is { depot: SimDepot; estimate: { minutes: number; path: string[] } } =>
        Boolean(candidate.estimate)
      )
      .sort(
        (a, b) => a.estimate.minutes - b.estimate.minutes || compareIds(a.depot.id, b.depot.id)
      );

    let remaining = line.required;

    for (const { depot, estimate } of reachable) {
      if (remaining <= 0) break;
      const stock = workingStock.get(depot.id);
      if (!stock) continue;
      const onHand = stock[line.commodity_id];
      if (onHand <= 0) continue;

      const quantity = Math.min(remaining, onHand);
      stock[line.commodity_id] = onHand - quantity;
      remaining -= quantity;

      const reasons: string[] = [
        `${depot.label} is the nearest reachable depot for ${line.commodity_label.toLowerCase()} with stock on hand (${round1(
          estimate.minutes
        )} min modelled).`
      ];
      if (estimated) {
        reasons.push(
          'This need was estimated from a data gap rather than reported, so it is served after every confirmed requirement.'
        );
      }
      if (remaining > 0) {
        reasons.push(
          `${depot.label} could only cover part of the requirement, so the rest is drawn from the next nearest depot.`
        );
      }

      shipments.push({
        depot_id: depot.id,
        depot_label: depot.label,
        zone_id: line.zone_id,
        zone_name: line.zone_name,
        commodity_id: line.commodity_id,
        commodity_label: line.commodity_label,
        unit: line.unit,
        quantity,
        travel_minutes: round1(estimate.minutes),
        route: estimate.path,
        estimated,
        reasons
      });
    }

    if (remaining <= 0) continue;

    const allocated = line.required - remaining;
    unmet.push({
      zone_id: line.zone_id,
      zone_name: line.zone_name,
      commodity_id: line.commodity_id,
      commodity_label: line.commodity_label,
      unit: line.unit,
      required: line.required,
      allocated,
      shortfall: remaining,
      basis: line.basis,
      reason: explainUnmet(line, reachable.length, allocated)
    });
  }

  /* --- Summaries ------------------------------------------------------- */
  const deliveries = new Map<string, number>();
  const deliveredByZone = new Map<string, number>();
  for (const shipment of shipments) {
    const key = `${shipment.zone_id}|${shipment.commodity_id}`;
    deliveries.set(key, (deliveries.get(key) ?? 0) + shipment.quantity);
    deliveredByZone.set(shipment.zone_id, (deliveredByZone.get(shipment.zone_id) ?? 0) + shipment.quantity);
  }

  /** Quantity actually allocated to a demand line. */
  const allocatedFor = (line: RequirementLine): number =>
    deliveries.get(`${line.zone_id}|${line.commodity_id}`) ?? 0;

  const commoditySummary: CommoditySummary[] = COMMODITIES.map((commodity) => {
    const required = requirements
      .filter((line) => line.commodity_id === commodity.id)
      .reduce((total, line) => total + line.required, 0);
    const allocated = shipments
      .filter((shipment) => shipment.commodity_id === commodity.id)
      .reduce((total, shipment) => total + shipment.quantity, 0);
    return {
      commodity_id: commodity.id,
      label: commodity.label,
      unit: commodity.unit,
      required,
      allocated,
      shortfall: Math.max(0, required - allocated),
      fulfilment_pct: required === 0 ? 100 : round1((allocated / required) * 100)
    };
  });

  const fullyMet = requirements.filter((line) => allocatedFor(line) >= line.required).length;
  const zeroLines = requirements.filter((line) => allocatedFor(line) === 0).length;

  const travel = shipments.map((shipment) => shipment.travel_minutes);
  const estimatedLines = requirements.filter((line) => line.basis === 'DATA_GAP_ESTIMATE');
  const estimatedShortfallLines = unmet.filter((row) => row.basis === 'DATA_GAP_ESTIMATE').length;

  const metrics: SupplyMetrics = {
    shipments: shipments.length,
    fulfilment_pct:
      requirements.length === 0
        ? 100
        : round1(
            (requirements.reduce(
              (total, line) => total + Math.min(1, line.required === 0 ? 1 : allocatedFor(line) / line.required),
              0
            ) /
              requirements.length) *
              100
          ),
    demand_lines: requirements.length,
    fully_met_lines: fullyMet,
    partially_met_lines: Math.max(0, requirements.length - fullyMet - zeroLines),
    unmet_lines: requirements.length - fullyMet,
    zones_reached: deliveredByZone.size,
    zones_isolated: exposure.filter((zone) => !deliveredByZone.has(zone.zone_id)).length,
    total_travel_minutes: round1(travel.reduce((total, value) => total + value, 0)),
    worst_travel_minutes: travel.length === 0 ? null : round1(Math.max(...travel)),
    estimated_need_lines: estimatedLines.length,
    estimated_need_shortfall_lines: estimatedShortfallLines
  };

  /* --- Constraints ----------------------------------------------------- */
  const constraints: string[] = [`Planning horizon: ${horizonDays} day(s) of relief per round.`];

  if (unavailable.size > 0) {
    const labels = depots.filter((depot) => unavailable.has(depot.id)).map((depot) => depot.label);
    constraints.push(`${labels.length} depot(s) unavailable: ${labels.join(', ')}.`);
  }
  if (blockedKeys.size > 0) {
    constraints.push(`${blockedKeys.size} road segment(s) closed: ${describeBlockedSegments(dataset, blockedKeys)}.`);
  }
  if (Object.keys(overrides).length > 0) {
    constraints.push(`${Object.keys(overrides).length} depot stock override(s) applied by the scenario.`);
  }
  if (availableDepots.length === 0) {
    constraints.push('No depot is available in this scenario — nothing can be distributed.');
  }

  const totalRequired = commoditySummary.reduce((total, row) => total + row.required, 0);
  if (totalRequired > 0 && metrics.fulfilment_pct < 100) {
    constraints.push(
      `Relief stock is scarce in this exercise: the modelled requirement is only ${metrics.fulfilment_pct}% covered, so demand must be prioritised.`
    );
  }

  const gapZones = exposure.filter((zone) => zone.basis === 'DATA_GAP_ESTIMATE');
  if (gapZones.length > 0) {
    constraints.push(
      `${gapZones.length} zone(s) have no usable casualty figures (${gapZones
        .map((zone) => zone.zone_name)
        .join(', ')}). Their demand is a population-based planning estimate, not a confirmed need.`
    );
  }

  const planningConfidence: SupplyPlan['planning_confidence'] =
    metrics.zones_isolated > 0 || metrics.estimated_need_lines * 2 >= metrics.demand_lines
      ? 'Low'
      : gapZones.length > 0 || metrics.unmet_lines > 0
        ? 'Medium'
        : 'High';

  return {
    is_simulated: true,
    label: SUPPLY_LABEL,
    framing: CHAIN_FRAMING,
    exposure,
    requirements: orderedLines,
    shipments,
    unmet: unmet.sort(
      (a, b) =>
        basisRank(a.basis) - basisRank(b.basis) ||
        b.shortfall - a.shortfall ||
        compareIds(a.zone_id, b.zone_id) ||
        compareIds(a.commodity_id, b.commodity_id)
    ),
    commodity_summary: commoditySummary,
    metrics,
    active_constraints: constraints,
    disadvantaged_summary: buildDisadvantagedSummary(exposure, unmet, metrics, new Set(deliveredByZone.keys())),
    planning_confidence: planningConfidence,
    depots,
    planning_horizon_days: horizonDays,
    total_incidents: dataset.incidents.length
  };
}

/* ------------------------------------------------------------------ */
/* Explanation helpers                                                 */
/* ------------------------------------------------------------------ */

function describeBlockedSegments(dataset: SimulationDataset, blockedKeys: ReadonlySet<string>): string {
  return Array.from(blockedKeys)
    .map((key) => {
      const [from, to] = key.split('|');
      const edge = dataset.graph.edges.find(
        (candidate) => [candidate.from, candidate.to].sort(compareIds).join('|') === key
      );
      if (edge?.label) return edge.label;
      const fromLabel = dataset.graph.nodes.find((node) => node.id === from)?.label ?? from;
      const toLabel = dataset.graph.nodes.find((node) => node.id === to)?.label ?? to;
      return `${fromLabel} ↔ ${toLabel}`;
    })
    .join(', ');
}

function explainUnmet(line: RequirementLine, reachableDepots: number, allocated: number): string {
  if (reachableDepots === 0) {
    return 'No depot has a modelled route to this zone (road network closed or disconnected), so nothing can be delivered.';
  }
  if (allocated === 0) {
    return `Every reachable depot is already out of ${line.commodity_label.toLowerCase()} by the time this requirement is served.`;
  }
  return `Reachable depots could only supply ${allocated} of ${line.required} ${line.unit} before their stock ran out.`;
}

function buildDisadvantagedSummary(
  exposure: ZoneExposure[],
  unmet: UnmetRequirement[],
  metrics: SupplyMetrics,
  reachedZoneIds: ReadonlySet<string>
): string {
  const sentences: string[] = [];

  sentences.push(
    'Confirmed reported need is served first and a data gap is served last, so the residents a coordinator heard least from are the ones this plan leaves short.'
  );

  if (metrics.shipments === 0) {
    sentences.push('No shipment can be made at all under this scenario, so every zone receives nothing.');
    return sentences.join(' ');
  }

  const shortfallByZone = new Map<string, number>();
  for (const row of unmet) {
    shortfallByZone.set(row.zone_id, (shortfallByZone.get(row.zone_id) ?? 0) + row.shortfall);
  }

  if (metrics.unmet_lines === 0) {
    sentences.push('Every modelled requirement is fully covered by the reachable depots.');
  } else {
    const worst = exposure
      .map((zone) => ({ zone, shortfall: shortfallByZone.get(zone.zone_id) ?? 0 }))
      .filter((row) => row.shortfall > 0)
      .sort((a, b) => b.shortfall - a.shortfall || compareIds(a.zone.zone_id, b.zone.zone_id));

    if (worst.length > 0) {
      sentences.push(
        `${worst.length} zone(s) go short. The largest gap is in ${worst[0].zone.zone_name}, and the shortfalls fall on ${worst
          .map((row) => row.zone.zone_name)
          .join(', ')}.`
      );
    }
  }

  const gapZones = exposure.filter((zone) => zone.basis === 'DATA_GAP_ESTIMATE');
  if (gapZones.length > 0) {
    sentences.push(
      `${gapZones
        .map((zone) => zone.zone_name)
        .join(', ')} produced no usable casualty figures, so the plan can only budget for an estimated population share. Because those lines are served last, the plan is least reliable exactly where it is least able to check.`
    );
  }

  if (metrics.zones_isolated > 0) {
    const isolatedNames = exposure
      .filter((zone) => !reachedZoneIds.has(zone.zone_id))
      .map((zone) => zone.zone_name)
      .join(', ');
    sentences.push(`No shipment at all reaches ${isolatedNames}.`);
  }

  if (metrics.estimated_need_shortfall_lines > 0) {
    sentences.push(
      `${metrics.estimated_need_shortfall_lines} estimated requirement(s) receive nothing, which means the real shortfall is probably larger than this plan can show.`
    );
  }

  return sentences.join(' ');
}
