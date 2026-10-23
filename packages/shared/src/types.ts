export type Provenance = 
  | 'USER_REPORTED' 
  | 'AI_INFERRED' 
  | 'VERIFIED' 
  | 'UNVERIFIED_OR_CONFLICTING';

export type PriorityLevel = 
  | 'Critical' 
  | 'High' 
  | 'Moderate' 
  | 'Low' 
  | 'Needs review';

export type IncidentType = 
  | 'FLOOD'
  | 'FIRE'
  | 'INFRASTRUCTURE_DAMAGE'
  | 'BLOCKED_ROAD'
  | 'LANDSLIDE'
  | 'MEDICAL_EMERGENCY'
  | 'HAZARDOUS_MATERIAL'
  | 'OTHER';

export type IncidentStatus = 
  | 'NEW'
  | 'IN_REVIEW'
  | 'TRIAGED'
  | 'FUSED'
  | 'RESOLVED'
  | 'ARCHIVED';

export interface EvidenceItem {
  id: string;
  claim: string;
  provenance: Provenance;
  confidence: number; // 0.0 - 1.0
  source_excerpt?: string;
  source_url?: string;
  source_name?: string;
}

export interface PeopleAtRisk {
  estimated_count: number | null;
  description: string | null;
}

export interface ReportedInjuries {
  estimated_count: number | null;
  description: string | null;
}

export interface NormalizedLocation {
  formatted_address: string;
  city?: string;
  region?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface PriorityEvaluation {
  level: PriorityLevel;
  reasons: string[];
  disclaimer: string;
}

export interface VerificationSource {
  source_name: string;
  source_url: string;
  retrieval_timestamp: string;
  excerpt: string;
  claim_supported: string;
  domain: string;
}

export interface IncidentAttachment {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  url?: string;
}

export interface IncidentRecord {
  id: string;
  incident_type: IncidentType;
  summary: string;
  reported_location: string | null;
  normalized_location: NormalizedLocation | null;
  hazard_indicators: string[];
  people_at_risk: PeopleAtRisk;
  reported_injuries: ReportedInjuries;
  access_constraints: string[];
  reported_at: string;
  missing_information: string[];
  conflicting_information: string[];
  evidence_items: EvidenceItem[];
  uncertainty_notes: string[];
  
  // Computed deterministic priority
  priority: PriorityEvaluation;

  // Metadata
  status: IncidentStatus;
  created_at: string;
  updated_at: string;
  source_channel: 'MANUAL_TEXT' | 'VOICE_TRANSCRIPT' | 'ALERT_DOC' | 'MULTI_REPORT_FUSION' | 'SIMULATED_DEMO';
  is_simulated: boolean;
  attachments: IncidentAttachment[];
  
  // Verification details
  verification_status: 'VERIFIED' | 'UNVERIFIED' | 'UNAVAILABLE' | 'CONFLICTING';
  sources: VerificationSource[];
  
  // Merge / Fusion audit trail
  is_fused?: boolean;
  merged_incident_ids?: string[];
  original_reports?: IncidentRecord[];
}

export interface PriorityRule {
  id: string;
  description: string;
  check: (incident: {
    incident_type: IncidentType;
    hazard_indicators: string[];
    people_at_risk: PeopleAtRisk;
    reported_injuries: ReportedInjuries;
    access_constraints: string[];
    missing_information: string[];
    conflicting_information: string[];
    reported_location: string | null;
  }) => { matched: boolean; reason: string; forceLevel?: PriorityLevel };
}

export interface FusionCandidate {
  primary_id: string;
  secondary_id: string;
  similarity_score: number;
  matching_factors: string[];
  conflicting_fields: string[];
  gemini_explanation?: string;
}

export interface IncidentReportExport {
  incident_id: string;
  exported_at: string;
  markdown: string;
  structured_data: IncidentRecord;
  checklist: Array<{
    id: string;
    item: string;
    completed: boolean;
    recommended_role: string;
  }>;
  recommendations: Array<{
    category: string;
    advice: string;
    is_executed_action: false;
  }>;
}
