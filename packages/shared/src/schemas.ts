import { z } from 'zod';

export const ProvenanceSchema = z.enum([
  'USER_REPORTED',
  'AI_INFERRED',
  'VERIFIED',
  'UNVERIFIED_OR_CONFLICTING'
]);

export const PriorityLevelSchema = z.enum([
  'Critical',
  'High',
  'Moderate',
  'Low',
  'Needs review'
]);

export const IncidentTypeSchema = z.enum([
  'FLOOD',
  'FIRE',
  'INFRASTRUCTURE_DAMAGE',
  'BLOCKED_ROAD',
  'LANDSLIDE',
  'MEDICAL_EMERGENCY',
  'HAZARDOUS_MATERIAL',
  'OTHER'
]);

export const IncidentStatusSchema = z.enum([
  'NEW',
  'IN_REVIEW',
  'TRIAGED',
  'FUSED',
  'RESOLVED',
  'ARCHIVED'
]);

export const NormalizedLocationSchema = z.object({
  formatted_address: z.string(),
  city: z.string().optional(),
  region: z.string().optional(),
  country: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW'])
});

export const EvidenceItemSchema = z.object({
  id: z.string().default(() => Math.random().toString(36).substring(2, 9)),
  claim: z.string().min(1, 'Claim cannot be empty'),
  provenance: ProvenanceSchema,
  confidence: z.number().min(0).max(1).default(0.8),
  source_excerpt: z.string().optional(),
  source_url: z.string().url().optional().or(z.literal('')),
  source_name: z.string().optional()
});

export const PeopleAtRiskSchema = z.object({
  estimated_count: z.number().int().nonnegative().nullable(),
  description: z.string().nullable()
});

export const ReportedInjuriesSchema = z.object({
  estimated_count: z.number().int().nonnegative().nullable(),
  description: z.string().nullable()
});

/**
 * A safe timestamp field.
 * Accepts a string (or null/undefined); a non-empty, parseable timestamp is normalised to ISO-8601.
 * An empty string, whitespace-only string, missing value, or unparseable value falls back to the
 * current time so downstream records never carry an empty/invalid `reported_at`.
 */
export const SafeTimestampSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform(value => {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return new Date().toISOString();
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
  });

/**
 * Schema for raw Gemini extraction response.
 * Note: Model may only supply raw indicators and facts.
 * Priority is strictly calculated by our deterministic rule engine, not the model.
 */
export const GeminiExtractionOutputSchema = z.object({
  incident_type: IncidentTypeSchema,
  summary: z.string().min(5, 'Summary must be at least 5 characters'),
  reported_location: z.string().nullable(),
  hazard_indicators: z.array(z.string()).default([]),
  people_at_risk: PeopleAtRiskSchema.default({ estimated_count: null, description: null }),
  reported_injuries: ReportedInjuriesSchema.default({ estimated_count: null, description: null }),
  access_constraints: z.array(z.string()).default([]),
  reported_at: SafeTimestampSchema,
  missing_information: z.array(z.string()).default([]),
  conflicting_information: z.array(z.string()).default([]),
  evidence_items: z.array(EvidenceItemSchema).default([]),
  uncertainty_notes: z.array(z.string()).default([])
});

export const VerificationSourceSchema = z.object({
  source_name: z.string(),
  source_url: z.string(),
  retrieval_timestamp: z.string(),
  excerpt: z.string(),
  claim_supported: z.string(),
  domain: z.string()
});

export const IncidentRecordSchema = z.object({
  id: z.string(),
  incident_type: IncidentTypeSchema,
  summary: z.string(),
  reported_location: z.string().nullable(),
  normalized_location: NormalizedLocationSchema.nullable().default(null),
  hazard_indicators: z.array(z.string()),
  people_at_risk: PeopleAtRiskSchema,
  reported_injuries: ReportedInjuriesSchema,
  access_constraints: z.array(z.string()),
  reported_at: z.string(),
  missing_information: z.array(z.string()),
  conflicting_information: z.array(z.string()),
  evidence_items: z.array(EvidenceItemSchema),
  uncertainty_notes: z.array(z.string()),
  priority: z.object({
    level: PriorityLevelSchema,
    reasons: z.array(z.string()),
    disclaimer: z.string()
  }),
  status: IncidentStatusSchema.default('NEW'),
  created_at: z.string(),
  updated_at: z.string(),
  source_channel: z.enum([
    'MANUAL_TEXT',
    'VOICE_TRANSCRIPT',
    'ALERT_DOC',
    'MULTI_REPORT_FUSION',
    'SIMULATED_DEMO'
  ]),
  is_simulated: z.boolean().default(false),
  attachments: z.array(z.object({
    id: z.string(),
    filename: z.string(),
    mime_type: z.string(),
    size_bytes: z.number(),
    uploaded_at: z.string(),
    url: z.string().optional()
  })).default([]),
  verification_status: z.enum(['VERIFIED', 'UNVERIFIED', 'UNAVAILABLE', 'CONFLICTING']).default('UNVERIFIED'),
  sources: z.array(VerificationSourceSchema).default([]),
  is_fused: z.boolean().optional(),
  merged_incident_ids: z.array(z.string()).optional(),
  original_reports: z.array(z.any()).optional()
});

export const IncidentCreateInputSchema = z.object({
  idempotency_key: z.string().optional(),
  extraction: GeminiExtractionOutputSchema,
  source_channel: z.enum([
    'MANUAL_TEXT',
    'VOICE_TRANSCRIPT',
    'ALERT_DOC',
    'MULTI_REPORT_FUSION',
    'SIMULATED_DEMO'
  ]).default('MANUAL_TEXT'),
  is_simulated: z.boolean().default(false),
  reported_location_override: z.string().optional()
});

export const IncidentPatchSchema = z.object({
  status: IncidentStatusSchema.optional(),
  summary: z.string().optional(),
  uncertainty_notes: z.array(z.string()).optional(),
  missing_information: z.array(z.string()).optional()
});

export const FusionPreviewRequestSchema = z.object({
  primary_id: z.string(),
  secondary_id: z.string()
});

export const FusionConfirmRequestSchema = z.object({
  primary_id: z.string(),
  secondary_id: z.string(),
  resolution_notes: z.string().optional(),
  override_fields: z.record(z.any()).optional()
});
