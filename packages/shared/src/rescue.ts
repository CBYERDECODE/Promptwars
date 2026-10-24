/**
 * ResQ AI — Explainable Rescue Intelligence types (Tier 1).
 *
 * IMPORTANT: Everything in this module describes a SIMULATED scenario.
 * The synthetic city graph, zones, units, incidents and reports are fictional
 * demonstration data. Every result type carries an `is_simulated: true` literal
 * so that neither the API nor the UI can accidentally present model output as a
 * real-world prediction.
 */

export type Confidence = 'Low' | 'Medium' | 'High';

export type Severity = 'Critical' | 'High' | 'Moderate' | 'Low';

export type UnitType = 'AMBULANCE' | 'RESCUE_TEAM';

export type UnitStatus = 'AVAILABLE' | 'UNAVAILABLE';

export type AllocationStrategy = 'FASTEST' | 'SEVERITY_FIRST' | 'COVERAGE_BALANCED';

/* ------------------------------------------------------------------ */
/* Road graph                                                          */
/* ------------------------------------------------------------------ */

export interface GraphNode {
  id: string;
  label: string;
  /** Normalised 0..100 coordinates used for the dependency-free SVG map. */
  x: number;
  y: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  /** Modelled travel time in minutes. Undirected unless `one_way` is true. */
  minutes: number;
  one_way?: boolean;
  /** Permanently blocked segments (e.g. structurally failed bridge). */
  blocked?: boolean;
  label?: string;
}

export interface RoadGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/* ------------------------------------------------------------------ */
/* Simulated domain entities                                           */
/* ------------------------------------------------------------------ */

export interface SimZone {
  id: string;
  name: string;
  /** Simulated resident count. */
  population: number;
  /** Simulated historical expectation of incoming reports per hour. */
  expected_reports_per_hour: number;
  /** Graph node used as the zone's access point / centroid. */
  centroid_node: string;
  /** SVG polygon points (0..100 space). */
  polygon: Array<{ x: number; y: number }>;
  /** 0..1 — how well the zone is connected to the wider network. */
  connectivity: number;
  /** 0..1 — quality/robustness of road access (roads, bridges, gradients). */
  road_access: number;
}

export interface SimReport {
  id: string;
  zone_id: string;
  node_id: string;
  reported_at: string;
  summary: string;
}

export interface SimIncident {
  id: string;
  zone_id: string;
  node_id: string;
  severity: Severity;
  title: string;
  people_at_risk: number | null;
  reported_at: string;
}

export interface SimUnit {
  id: string;
  label: string;
  type: UnitType;
  home_node: string;
  status: UnitStatus;
}

export interface SimulationDataset {
  /** Always true: this dataset is synthetic and MUST be labelled as such. */
  is_simulated: true;
  label: string;
  city: string;
  /** Target response time (minutes) used for coverage calculations. */
  sla_minutes: number;
  graph: RoadGraph;
  zones: SimZone[];
  units: SimUnit[];
  incidents: SimIncident[];
  reports: SimReport[];
}

/* ------------------------------------------------------------------ */
/* Invisible Victims Radar                                             */
/* ------------------------------------------------------------------ */

export interface ZoneEvidence {
  /** Machine-readable factor id, e.g. `population_exposure`. */
  factor: string;
  /** Human-readable explanation shown in the UI. */
  detail: string;
  /** Weight applied to this factor (0..1). */
  weight: number;
  /** Signed points this factor contributed to the 0..100 priority score. */
  contribution: number;
  /**
   * True when the factor had no usable input and was therefore credited at a
   * reduced weight. Rendering code must show these rows as *uncertain*, not as
   * measured evidence.
   */
  unobserved?: boolean;
}

export interface ZoneAssessment {
  zone_id: string;
  zone_name: string;
  /** 0..100 — higher means "warrants verification", NOT "victims present". */
  priority_score: number;
  confidence: Confidence;
  evidence: ZoneEvidence[];
  missing_data: string[];
  recommended_verification_actions: string[];
  is_simulated: true;
}

export interface RadarResult {
  is_simulated: true;
  generated_at: string;
  /** Non-negotiable framing statement shipped with every radar response. */
  framing: string;
  zones: ZoneAssessment[];
  observations: string[];
}

/* ------------------------------------------------------------------ */
/* FairRescue / RescueBrain allocation                                 */
/* ------------------------------------------------------------------ */

export interface Assignment {
  unit_id: string;
  unit_label: string;
  unit_type: UnitType;
  incident_id: string;
  incident_title: string;
  severity: Severity;
  zone_id: string;
  /** Modelled travel time in minutes; null when no route exists. */
  travel_minutes: number | null;
  within_sla: boolean;
  /** Per-assignment explanation ("why" this unit serves this incident). */
  reasons: string[];
}

export interface UnassignedIncident {
  incident_id: string;
  incident_title: string;
  severity: Severity;
  zone_id: string;
  reason: string;
}

export interface PlanMetrics {
  avg_response_minutes: number | null;
  worst_response_minutes: number | null;
  coverage_pct: number;
  unattended_incidents: number;
  unattended_high_severity: number;
  utilization_pct: number;
  hard_to_reach_served: number;
  hard_to_reach_unserved: number;
}

export interface AllocationPlan {
  is_simulated: true;
  strategy: AllocationStrategy;
  strategy_label: string;
  assignments: Assignment[];
  unassigned: UnassignedIncident[];
  metrics: PlanMetrics;
  active_constraints: string[];
  /** Plain-language summary of who is disadvantaged by this plan. */
  disadvantaged_summary: string;
}

export interface PlanScenario {
  /** Units toggled offline (mechanical failure, standby, etc.). */
  unavailable_unit_ids?: string[];
  /** Undirected edge keys (`"a|b"`, alphabetically sorted) to block. */
  blocked_edge_keys?: string[];
  /** Newly injected incident (e.g. a fresh critical report). */
  extra_incidents?: SimIncident[];
  /** Whether the regional hospital is at capacity (adds a transport constraint). */
  hospital_at_capacity?: boolean;
  /** Force a specific unit to a specific incident (used by CrisisReplay). */
  forced_assignment?: { unit_id: string; incident_id: string };
}

/* ------------------------------------------------------------------ */
/* CrisisReplay                                                        */
/* ------------------------------------------------------------------ */

export interface ReplayDelta {
  metric: string;
  baseline: number | null;
  hypothetical: number | null;
  delta: number | null;
  /** true = hypothetical is better, false = worse, null = unchanged/unknown. */
  better: boolean | null;
}

export interface ReplayOverride {
  unit_id: string;
  incident_id: string;
}

export interface ReplayResult {
  is_simulated: true;
  banner: string;
  strategy: AllocationStrategy;
  baseline: AllocationPlan;
  hypothetical: AllocationPlan;
  deltas: ReplayDelta[];
  assumptions: string[];
}

/** Ship this exact banner text with every Replay result. */
export const CRISIS_REPLAY_BANNER =
  'Hypothetical, model-dependent, not verified.';

/** Ship this exact framing text with every Radar result. */
export const RADAR_FRAMING =
  'Flagged zones warrant verification only. Absence of reports is never treated as evidence that no one is at risk.';
