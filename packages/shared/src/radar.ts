/**
 * Invisible Victims Radar — deterministic, evidence-based zone scoring.
 *
 * SCORING CONTRACT
 * ----------------
 * Each zone accumulates a transparent weighted score in the range 0..100 from
 * six factors. Every factor emits an `evidence` entry describing exactly what
 * it observed, and every missing input is surfaced in `missing_data` instead of
 * being silently treated as "safe". A factor with no usable input is credited
 * at half weight and flagged `unobserved: true`, so losing sight of a zone can
 * never make it look calmer than it did while it was observable.
 *
 * LANGUAGE CONTRACT
 * -----------------
 * A high score means "warrants verification". It NEVER means "victims are here",
 * and the absence of reports is NEVER interpreted as evidence that nobody is at
 * risk (a zone with zero reports gains a *report-density gap*, which raises its
 * verification priority and lowers its confidence).
 */

import { Confidence, RadarResult, RADAR_FRAMING, SimulationDataset, Severity, ZoneAssessment, ZoneEvidence } from './rescue.js';
import { severityRank } from './severity.js';
import { travelMinutes } from './geo.js';

/**
 * Documented weights. They sum to 1 so the priority score stays on 0..100.
 * The reporting-gap term carries the largest weight on purpose: a zone that
 * goes quiet is the zone a coordinator is most likely to under-serve.
 */
export const RADAR_WEIGHTS = {
  population_exposure: 0.17,
  proximity_to_incidents: 0.15,
  report_density_gap: 0.28,
  connectivity: 0.12,
  road_access: 0.12,
  severity: 0.16
} as const;

export type RadarFactor = keyof typeof RADAR_WEIGHTS;

export const RADAR_PARAMETERS = {
  /** Travel time (minutes) at which proximity to an incident contributes zero. */
  proximityHorizonMinutes: 20,
  /**
   * The dataset snapshot itself represents the analysis window. Expected report
   * volume is derived as `expected_reports_per_hour * windowHours`.
   */
  defaultWindowHours: 3,
  /** Below these normalised values a zone is treated as hard to reach. */
  connectivityConcernThreshold: 0.5,
  roadAccessConcernThreshold: 0.5,
  /**
   * Share of a factor's weight credited when its input is missing. Rationale:
   * a factor with no input used to contribute zero, which made a zone that can
   * no longer be observed (e.g. cut off by a closed bridge) score *lower* than
   * the same zone while it was visible. Unknown inputs are therefore credited
   * at half weight, flagged with `unobserved: true` in `evidence`, and listed
   * in `missing_data` so the uncertainty is never hidden.
   */
  unobservedFactorCredit: 0.5,
  /** At or above this score a zone is listed as "warrants verification". */
  highPriorityThreshold: 50
} as const;

export interface RadarOptions {
  /** Road segments to treat as blocked (scenario toggle). */
  blocked_edge_keys?: string[];
  /** Analysis window length in hours (see RADAR_PARAMETERS.defaultWindowHours). */
  window_hours?: number;
  /** Injectable clock for reproducible snapshots in tests and replays. */
  now?: string;
}

/** Radar assessment plus the raw numbers behind each factor. */
export interface RadarZoneDetail extends ZoneAssessment {
  population: number;
  reports_observed: number;
  reports_expected: number;
  /** Modelled minutes from the zone centroid to the nearest known incident. */
  nearest_incident_minutes: number | null;
  severity_observed: Severity | null;
}

export interface RadarDetailResult extends Omit<RadarResult, 'zones'> {
  zones: RadarZoneDetail[];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Score every zone in the dataset. Fully deterministic for a given dataset,
 * scenario and clock value.
 */
export function assessZones(dataset: SimulationDataset, options: RadarOptions = {}): RadarDetailResult {
  const blockedKeys = new Set(options.blocked_edge_keys ?? []);
  const windowHours = options.window_hours ?? RADAR_PARAMETERS.defaultWindowHours;
  const now = options.now ?? new Date().toISOString();

  const maxPopulation = dataset.zones.reduce((max, zone) => Math.max(max, zone.population), 0);

  const reportsByZone = new Map<string, number>();
  for (const report of dataset.reports) {
    reportsByZone.set(report.zone_id, (reportsByZone.get(report.zone_id) ?? 0) + 1);
  }

  // Pre-compute one Dijkstra run per zone centroid — cheap, and keeps the
  // per-zone loop free of repeated graph work.
  const routesFromCentroid = new Map<string, Map<string, number>>();
  for (const zone of dataset.zones) {
    const estimates = new Map<string, number>();
    for (const incident of dataset.incidents) {
      const minutes = travelMinutes(dataset.graph, zone.centroid_node, incident.node_id, blockedKeys);
      if (minutes !== null) estimates.set(incident.id, minutes);
    }
    routesFromCentroid.set(zone.id, estimates);
  }

  /**
   * Evidence row for a factor with no usable input. Credited at half weight so
   * that "we cannot see this zone" is never scored as "this zone is calm".
   */
  const unobservedEvidence = (factor: RadarFactor): ZoneEvidence => ({
    factor,
    detail: `No usable input for "${factor}" in this snapshot, so it is credited at ${Math.round(
      RADAR_PARAMETERS.unobservedFactorCredit * 100
    )}% of its weight rather than zero. Treat this zone as uncertain, not as calm.`,
    weight: RADAR_WEIGHTS[factor],
    contribution: round1(RADAR_WEIGHTS[factor] * 100 * RADAR_PARAMETERS.unobservedFactorCredit),
    unobserved: true
  });

  const details: RadarZoneDetail[] = dataset.zones.map((zone) => {
    const evidence: ZoneEvidence[] = [];
    const missing: string[] = [];

    /* --- Factor 1: population exposure -------------------------------- */
    let populationSubscore = 0;
    if (maxPopulation > 0 && zone.population > 0) {
      populationSubscore = clamp01(zone.population / maxPopulation);
      evidence.push({
        factor: 'population_exposure',
        detail: `Simulated resident population of ${zone.population.toLocaleString('en-US')} (${Math.round(
          populationSubscore * 100
        )}% of the most populated zone).`,
        weight: RADAR_WEIGHTS.population_exposure,
        contribution: round1(RADAR_WEIGHTS.population_exposure * populationSubscore * 100)
      });
    } else {
      missing.push('No population estimate is available for this zone, so exposure cannot be quantified.');
      evidence.push(unobservedEvidence('population_exposure'));
    }

    /* --- Factor 2: proximity to incidents ----------------------------- */
    const incidentRoutes = routesFromCentroid.get(zone.id) ?? new Map<string, number>();
    let nearestIncidentMinutes: number | null = null;
    let nearestIncidentId: string | null = null;
    for (const [incidentId, minutes] of incidentRoutes) {
      if (nearestIncidentMinutes === null || minutes < nearestIncidentMinutes) {
        nearestIncidentMinutes = minutes;
        nearestIncidentId = incidentId;
      }
    }
    let proximitySubscore = 0;
    if (dataset.incidents.length === 0) {
      missing.push('No incidents are recorded anywhere in this snapshot, so the proximity factor is unavailable.');
      evidence.push(unobservedEvidence('proximity_to_incidents'));
    } else if (nearestIncidentMinutes === null) {
      missing.push('No modelled road route connects this zone to any known incident.');
      evidence.push(unobservedEvidence('proximity_to_incidents'));
    } else {
      proximitySubscore = clamp01(1 - nearestIncidentMinutes / RADAR_PARAMETERS.proximityHorizonMinutes);
      evidence.push({
        factor: 'proximity_to_incidents',
        detail:
          nearestIncidentMinutes === 0
            ? 'A known incident is located inside this zone.'
            : `Nearest known incident (${nearestIncidentId}) is ${round1(nearestIncidentMinutes)} modelled minutes away.`,
        weight: RADAR_WEIGHTS.proximity_to_incidents,
        contribution: round1(RADAR_WEIGHTS.proximity_to_incidents * proximitySubscore * 100)
      });
    }

    /* --- Factor 3: report density gap --------------------------------- */
    const observed = reportsByZone.get(zone.id) ?? 0;
    const expected = round1(zone.expected_reports_per_hour * windowHours);
    let gapSubscore = 0;
    if (expected > 0) {
      const gap = Math.max(0, expected - observed) / expected;
      gapSubscore = clamp01(gap);
      evidence.push({
        factor: 'report_density_gap',
        detail:
          observed === 0
            ? `No reports received in the ${windowHours}h window against ~${expected} expected. Silence is a data gap, not evidence of safety.`
            : `${observed} report(s) received against ~${expected} expected in the ${windowHours}h window (${Math.round(
                gapSubscore * 100
              )}% shortfall).`,
        weight: RADAR_WEIGHTS.report_density_gap,
        contribution: round1(RADAR_WEIGHTS.report_density_gap * gapSubscore * 100)
      });
    } else {
      missing.push('No expected report volume is configured for this zone, so the reporting gap cannot be measured.');
      evidence.push(unobservedEvidence('report_density_gap'));
    }
    if (observed === 0) {
      missing.push('Zero reports recorded for this zone in the analysis window.');
    }

    /* --- Factor 4: connectivity --------------------------------------- */
    const connectivity = clamp01(zone.connectivity);
    const connectivitySubscore = clamp01(1 - connectivity);
    evidence.push({
      factor: 'connectivity',
      detail: `Connectivity index ${connectivity.toFixed(2)} — ${
        connectivity < RADAR_PARAMETERS.connectivityConcernThreshold
          ? 'degraded links make reports less likely to reach coordinators.'
          : 'links are broadly intact.'
      }`,
      weight: RADAR_WEIGHTS.connectivity,
      contribution: round1(RADAR_WEIGHTS.connectivity * connectivitySubscore * 100)
    });

    /* --- Factor 5: road accessibility --------------------------------- */
    const roadAccess = clamp01(zone.road_access);
    const roadAccessSubscore = clamp01(1 - roadAccess);
    evidence.push({
      factor: 'road_access',
      detail: `Road access index ${roadAccess.toFixed(2)} — ${
        roadAccess < RADAR_PARAMETERS.roadAccessConcernThreshold
          ? 'access is poor, which both hides need and delays response.'
          : 'roads are broadly passable.'
      }`,
      weight: RADAR_WEIGHTS.road_access,
      contribution: round1(RADAR_WEIGHTS.road_access * roadAccessSubscore * 100)
    });

    /* --- Factor 6: severity of known incidents in this zone ----------- */
    const zoneIncidents = dataset.incidents.filter((incident) => incident.zone_id === zone.id);
    let severityObserved: Severity | null = null;
    for (const incident of zoneIncidents) {
      if (severityObserved === null || severityRank(incident.severity) > severityRank(severityObserved)) {
        severityObserved = incident.severity;
      }
    }
    const severitySubscore = severityObserved ? severityRank(severityObserved) / 4 : 0;
    if (severityObserved) {
      evidence.push({
        factor: 'severity',
        detail: `${zoneIncidents.length} incident(s) recorded inside the zone; highest severity is ${severityObserved}.`,
        weight: RADAR_WEIGHTS.severity,
        contribution: round1(RADAR_WEIGHTS.severity * severitySubscore * 100)
      });
    } else {
      missing.push('No incident has been recorded inside this zone, so severity is unconfirmed.');
      evidence.push(unobservedEvidence('severity'));
    }

    const priorityScore = round1(
      evidence.reduce((total, item) => total + item.contribution, 0)
    );

    /* --- Confidence: driven by how much input data we actually have --- */
    let confidence: Confidence = 'High';
    if (missing.length >= 2) confidence = 'Low';
    else if (missing.length === 1) confidence = 'Medium';

    return {
      zone_id: zone.id,
      zone_name: zone.name,
      priority_score: priorityScore,
      confidence,
      evidence,
      missing_data: missing,
      recommended_verification_actions: recommendActions({
        observed,
        roadAccess,
        connectivity,
        severityObserved,
        missing
      }),
      is_simulated: true,
      population: zone.population,
      reports_observed: observed,
      reports_expected: expected,
      nearest_incident_minutes: nearestIncidentMinutes === null ? null : round1(nearestIncidentMinutes),
      severity_observed: severityObserved
    };
  });

  // Highest priority first; zone id breaks ties so ordering never wobbles.
  details.sort(
    (a, b) => b.priority_score - a.priority_score || (a.zone_id < b.zone_id ? -1 : a.zone_id > b.zone_id ? 1 : 0)
  );

  const flagged = details.filter((zone) => zone.priority_score >= RADAR_PARAMETERS.highPriorityThreshold);
  const silent = details.filter((zone) => zone.reports_observed === 0);

  const observations: string[] = [];
  observations.push(
    flagged.length === 0
      ? `No zone reaches the ${RADAR_PARAMETERS.highPriorityThreshold}-point verification threshold in this snapshot.`
      : `${flagged.length} of ${details.length} zones score at or above the ${RADAR_PARAMETERS.highPriorityThreshold}-point verification threshold.`
  );
  if (silent.length > 0) {
    observations.push(
      `${silent.map((zone) => zone.zone_name).join(', ')} recorded no reports in the window. This is a data gap and must not be read as evidence of safety.`
    );
  }
  if (details.length > 0) {
    const top = details[0];
    observations.push(
      `Highest verification priority: ${top.zone_name} (${top.priority_score}/100, confidence ${top.confidence}). Suggested first action: ${
        top.recommended_verification_actions[0] ?? 'Add to the next verification sweep.'
      }`
    );
  }

  return {
    is_simulated: true,
    generated_at: now,
    framing: RADAR_FRAMING,
    zones: details,
    observations
  };
}

function recommendActions(input: {
  observed: number;
  roadAccess: number;
  connectivity: number;
  severityObserved: Severity | null;
  missing: string[];
}): string[] {
  const actions: string[] = [];

  if (input.observed === 0) {
    actions.push('Call a local community contact to confirm conditions before dispatching resources.');
  }
  if (input.roadAccess < RADAR_PARAMETERS.roadAccessConcernThreshold) {
    actions.push('Dispatch a drone reconnaissance along the accessible approach to verify road state.');
  }
  if (input.connectivity < RADAR_PARAMETERS.connectivityConcernThreshold) {
    actions.push('Request a satellite or radio-relay check because normal connectivity is degraded.');
  }
  if (input.severityObserved === 'Critical' || input.severityObserved === 'High') {
    actions.push('Confirm on-scene status with the nearest responding unit before re-allocating resources.');
  }
  if (actions.length === 0) {
    actions.push('Add this zone to the next scheduled verification sweep.');
  }

  // Deterministic, de-duplicated, capped list.
  return Array.from(new Set(actions)).slice(0, 3);
}
