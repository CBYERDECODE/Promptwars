import { 
  IncidentRecord, 
  IncidentStatus, 
  IncidentType, 
  PriorityLevel, 
  IncidentReportExport,
  AllocationStrategy,
  Commodity,
  PlanDetail,
  PlanScenario,
  RadarDetailResult,
  ReplayDetail,
  ReplayOverride,
  RescueExplainRequest,
  SimulationDataset,
  SupplyPlanDetail,
  SupplyScenario
} from '@resq-ai/shared';

const API_BASE = '/api';

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  timestamp: string;
  environment: string;
  storage_type: string;
  gemini: {
    configured: boolean;
    model: string;
    status: string;
  };
  google_maps: {
    configured: boolean;
  };
  stats: {
    total_incidents_stored: number;
  };
}

export interface AnalysisResponse {
  extraction: any;
  normalized_location: any;
  suggested_priority: {
    level: PriorityLevel;
    reasons: string[];
    disclaimer: string;
  };
  is_simulated: boolean;
  provenance_summary: {
    user_reported_count: number;
    ai_inferred_count: number;
    conflicts_count: number;
  };
  _cached?: boolean;
}

export interface PaginatedIncidents {
  items: IncidentRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error(`Health check failed (${res.status})`);
  return res.json();
}

export async function analyzeIncident(
  text: string,
  file?: File,
  location?: string,
  isSimulated: boolean = false
): Promise<AnalysisResponse> {
  const formData = new FormData();
  if (text) formData.append('text', text);
  if (file) formData.append('attachment', file);
  if (location) formData.append('location', location);
  formData.append('is_simulated', String(isSimulated));

  const res = await fetch(`${API_BASE}/incidents/analyze`, {
    method: 'POST',
    body: formData
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `Analysis failed (${res.status})`);
  }
  return data;
}

export async function fetchIncidents(params: {
  page?: number;
  limit?: number;
  status?: IncidentStatus;
  incident_type?: IncidentType;
  priority?: PriorityLevel;
  search?: string;
  sortBy?: 'created_at' | 'priority';
  sortOrder?: 'asc' | 'desc';
  is_simulated?: boolean;
}): Promise<PaginatedIncidents> {
  const url = new URL(`${window.location.origin}${API_BASE}/incidents`);
  if (params.page) url.searchParams.set('page', String(params.page));
  if (params.limit) url.searchParams.set('limit', String(params.limit));
  if (params.status) url.searchParams.set('status', params.status);
  if (params.incident_type) url.searchParams.set('incident_type', params.incident_type);
  if (params.priority) url.searchParams.set('priority', params.priority);
  if (params.search) url.searchParams.set('search', params.search);
  if (params.sortBy) url.searchParams.set('sortBy', params.sortBy);
  if (params.sortOrder) url.searchParams.set('sortOrder', params.sortOrder);
  if (params.is_simulated !== undefined) url.searchParams.set('is_simulated', String(params.is_simulated));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Failed to fetch incidents (${res.status})`);
  return res.json();
}

export async function fetchIncidentById(id: string): Promise<IncidentRecord> {
  const res = await fetch(`${API_BASE}/incidents/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Failed to load incident (${res.status})`);
  return res.json();
}

export async function createIncident(payload: {
  extraction: any;
  source_channel?: string;
  is_simulated?: boolean;
  reported_location_override?: string;
  idempotency_key?: string;
}): Promise<IncidentRecord> {
  const res = await fetch(`${API_BASE}/incidents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Failed to create incident (${res.status})`);
  return data;
}

export async function patchIncident(id: string, updates: Partial<IncidentRecord>): Promise<IncidentRecord> {
  const res = await fetch(`${API_BASE}/incidents/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Failed to update incident (${res.status})`);
  return data;
}

export async function fetchIncidentReport(id: string): Promise<IncidentReportExport> {
  const res = await fetch(`${API_BASE}/incidents/${encodeURIComponent(id)}/report`);
  if (!res.ok) throw new Error(`Failed to load report (${res.status})`);
  return res.json();
}

export async function fetchFusionCandidates(incidentId: string): Promise<{ candidates: any[] }> {
  const res = await fetch(`${API_BASE}/incidents/fusion/candidates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ incident_id: incidentId })
  });
  return res.json();
}

export async function previewFusion(primaryId: string, secondaryId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/incidents/fusion/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ primary_id: primaryId, secondary_id: secondaryId })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Failed to preview fusion (${res.status})`);
  return data;
}

export async function confirmFusion(primaryId: string, secondaryId: string, notes?: string): Promise<IncidentRecord> {
  const res = await fetch(`${API_BASE}/incidents/fusion/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ primary_id: primaryId, secondary_id: secondaryId, resolution_notes: notes })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Failed to confirm fusion (${res.status})`);
  return data;
}

export async function fetchSources(): Promise<any> {
  const res = await fetch(`${API_BASE}/sources`);
  return res.json();
}

export async function verifyClaimWithGrounding(claim: string, location?: string, region?: string, incidentId?: string): Promise<any> {
  const res = await fetch(`${API_BASE}/sources/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ claim, location, region, incident_id: incidentId })
  });
  return res.json();
}

/**
 * One sanitized entry from the human-decision audit trail. Mirrors the server's
 * `ActivityLogEntry`; it never contains raw caller text or uploaded bytes.
 */
export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  action_type: string;
  incident_id?: string;
  summary: string;
}

/** `GET /api/activity` — the audit trail, newest first. */
export async function fetchActivityLogs(): Promise<{ entries: ActivityLogEntry[] }> {
  // Routed through `readJson` so a failing request raises instead of silently
  // resolving to an empty list, which the UI would misreport as "nothing logged".
  return readJson<{ entries: ActivityLogEntry[] }>(await fetch(`${API_BASE}/activity`));
}

/**
 * `DELETE /api/activity` — purges the audit trail.
 *
 * Destructive, so the server guards it with `requireAdmin`. The token is sent as
 * `X-Admin-Token`, never persisted, and the server's refusal is surfaced rather
 * than swallowed: the caller must be able to tell a real purge from a rejection.
 */
export async function clearActivityLogs(adminToken?: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (adminToken) headers['X-Admin-Token'] = adminToken;
  const res = await fetch(`${API_BASE}/activity`, { method: 'DELETE', headers });
  await readJson<{ message: string }>(res);
}

/**
 * `POST /api/incidents/reset-demo` — restores the fictional demo dataset.
 *
 * Destructive, and guarded by `requireAdmin` on the server, so it takes the same
 * coordinator token as a log purge and surfaces a refusal instead of hiding it.
 */
export async function resetDemoData(adminToken?: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (adminToken) headers['X-Admin-Token'] = adminToken;
  const res = await fetch(`${API_BASE}/incidents/reset-demo`, { method: 'POST', headers });
  await readJson<{ message: string }>(res);
}

/* ------------------------------------------------------------------ */
/* Explainable Rescue Intelligence API (SIMULATED)                     */
/* ------------------------------------------------------------------ */
/*
 * Every endpoint below is backed by the deterministic engines in
 * `@resq-ai/shared`. `POST /rescue/explain` is the only one that may involve a
 * model, and it is used strictly to *describe* a result that the server has
 * already computed. No function here can change an allocation.
 */

/** Shape of the error envelope returned by every JSON route. */
interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: Array<{ path: string; message: string }>;
  };
}

/**
 * Error carrying the server's own code, human message and validation details so
 * views can render a specific error state instead of a generic failure.
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details: Array<{ path: string; message: string }>;

  constructor(
    status: number,
    code: string,
    message: string,
    details: Array<{ path: string; message: string }> = []
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function readJson<T>(res: Response): Promise<T> {
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const body = payload as ApiErrorBody | null;
    throw new ApiError(
      res.status,
      body?.error?.code ?? 'REQUEST_FAILED',
      body?.error?.message ?? `Request failed (${res.status})`,
      body?.error?.details ?? []
    );
  }
  return payload as T;
}

async function getJson<T>(path: string): Promise<T> {
  return readJson<T>(await fetch(`${API_BASE}${path}`));
}

async function postJson<T>(path: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  return readJson<T>(res);
}

export interface RescueStrategyOption {
  id: AllocationStrategy;
  label: string;
}

/** `GET /api/rescue/dataset` — the SIMULATED dataset plus every algorithm parameter. */
export interface RescueDatasetResponse {
  is_simulated: true;
  label: string;
  city: string;
  notice: string;
  dataset: SimulationDataset;
  framing: string;
  replay_banner: string;
  methods: {
    strategies: RescueStrategyOption[];
    radar_weights: Record<string, number>;
    radar_parameters: Record<string, number>;
    allocation_parameters: Record<string, number>;
  };
}

export interface RescueRadarRequest {
  blocked_edge_keys?: string[];
  window_hours?: number;
}

/** `POST /api/rescue/radar` */
export interface RadarResponse {
  is_simulated: true;
  result: RadarDetailResult;
  weights: Record<string, number>;
  parameters: Record<string, number>;
}

/** `POST /api/rescue/plans` — all three strategies over identical inputs. */
export interface PlansResponse {
  is_simulated: true;
  generated_at: string;
  dataset_label: string;
  notice: string;
  plans: PlanDetail[];
  parameters: Record<string, number>;
}

/** `POST /api/rescue/plan` */
export interface PlanResponse {
  is_simulated: true;
  result: PlanDetail;
  parameters: Record<string, number>;
}

/** `POST /api/rescue/replay` */
export interface ReplayResponse {
  is_simulated: true;
  result: ReplayDetail;
}

/** Provenance of a narrative: `GEMINI` when the model answered, `TEMPLATE` on fallback. */
export interface NarrativeResult {
  is_simulated: true;
  kind: 'RADAR' | 'PLAN' | 'REPLAY';
  source: 'GEMINI' | 'TEMPLATE';
  explanation: string;
  verification_suggestions: string[];
}

/**
 * `POST /api/rescue/explain`. `result` is always the deterministic engine output
 * recomputed server-side; `narrative` is descriptive text only.
 */
export interface ExplainResponse {
  is_simulated: true;
  kind: 'RADAR' | 'PLAN' | 'REPLAY';
  result: RadarDetailResult | PlanDetail | ReplayDetail;
  narrative: NarrativeResult;
}

export type RescueDecision = 'APPROVED' | 'REJECTED' | 'MODIFIED';

/** Recorded human decision returned by `POST /api/rescue/decision`. */
export interface RescueDecisionRecord {
  is_simulated: true;
  decision: RescueDecision;
  strategy: AllocationStrategy;
  coordinator_note: string;
  plan_signature: string;
  active_constraints: string[];
  recorded_at: string;
  log_entry_id: string;
  notice: string;
  /** Present and true when an identical request was served from the server cache. */
  replayed?: true;
}

export function fetchRescueDataset(): Promise<RescueDatasetResponse> {
  return getJson<RescueDatasetResponse>('/rescue/dataset');
}

export function postRadar(body: RescueRadarRequest = {}): Promise<RadarResponse> {
  return postJson<RadarResponse>('/rescue/radar', body);
}

export function postPlans(body: { scenario?: PlanScenario } = {}): Promise<PlansResponse> {
  return postJson<PlansResponse>('/rescue/plans', body);
}

export function postPlan(body: { strategy: AllocationStrategy; scenario?: PlanScenario }): Promise<PlanResponse> {
  return postJson<PlanResponse>('/rescue/plan', body);
}

export function postReplay(body: {
  strategy: AllocationStrategy;
  override: ReplayOverride;
  scenario?: PlanScenario;
}): Promise<ReplayResponse> {
  return postJson<ReplayResponse>('/rescue/replay', body);
}

export function postExplain(body: RescueExplainRequest): Promise<ExplainResponse> {
  return postJson<ExplainResponse>('/rescue/explain', body);
}

/**
 * Record a human decision. The idempotency key makes a double-click harmless:
 * the server returns the original record instead of writing a second audit entry.
 */
export function postDecision(
  body: {
    decision: RescueDecision;
    strategy: AllocationStrategy;
    coordinator_note: string;
    plan_signature: string;
    active_constraints?: string[];
  },
  idempotencyKey: string,
  adminToken?: string
): Promise<RescueDecisionRecord> {
  const headers: Record<string, string> = { 'Idempotency-Key': idempotencyKey };
  if (adminToken) headers['X-Admin-Token'] = adminToken;
  return postJson<RescueDecisionRecord>('/rescue/decision', body, headers);
}

/* ------------------------------------------------------------------ */
/* Chain — relief supply distribution API (SIMULATED), Tier 3          */
/* ------------------------------------------------------------------ */
/*
 * Backed entirely by the deterministic `computeSupplyPlan` engine in
 * `@resq-ai/shared`. No model is involved on this surface, and no function here
 * dispatches anything: a distribution proposal becomes an action only when a
 * human records a decision against it.
 */

/** `POST /api/chain/plan` — a distribution proposal over the modelled road network. */
export interface ChainPlanResponse {
  is_simulated: true;
  label: string;
  notice: string;
  framing: string;
  result: SupplyPlanDetail;
  commodities: Commodity[];
  parameters: Record<string, number>;
}

/** A human decision on a distribution proposal. */
export type ChainDecision = RescueDecision;

/** Recorded human decision returned by `POST /api/chain/decision`. */
export interface ChainDecisionRecord {
  is_simulated: true;
  decision: ChainDecision;
  coordinator_note: string;
  plan_signature: string;
  active_constraints: string[];
  recorded_at: string;
  log_entry_id: string;
  notice: string;
  /** Present and true when an identical request was served from the server cache. */
  replayed?: true;
}

export function postChainPlan(body: { scenario?: SupplyScenario } = {}): Promise<ChainPlanResponse> {
  return postJson<ChainPlanResponse>('/chain/plan', body);
}

/**
 * Record a human decision on a distribution proposal. The idempotency key makes
 * a double-click harmless: the server returns the original record instead of
 * writing a second audit entry.
 */
export function postChainDecision(
  body: {
    decision: ChainDecision;
    coordinator_note: string;
    plan_signature: string;
    active_constraints?: string[];
  },
  idempotencyKey: string,
  adminToken?: string
): Promise<ChainDecisionRecord> {
  const headers: Record<string, string> = { 'Idempotency-Key': idempotencyKey };
  if (adminToken) headers['X-Admin-Token'] = adminToken;
  return postJson<ChainDecisionRecord>('/chain/decision', body, headers);
}
