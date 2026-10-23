import { 
  IncidentRecord, 
  IncidentStatus, 
  IncidentType, 
  PriorityLevel, 
  IncidentReportExport 
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

export async function fetchActivityLogs(): Promise<{ entries: any[] }> {
  const res = await fetch(`${API_BASE}/activity`);
  return res.json();
}

export async function resetDemoData(): Promise<void> {
  const res = await fetch(`${API_BASE}/incidents/reset-demo`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to reset demo data');
}
