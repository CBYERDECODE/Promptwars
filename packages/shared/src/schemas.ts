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

/* ------------------------------------------------------------------ */
/* Explainable Rescue Intelligence API (SIMULATED)                     */
/* ------------------------------------------------------------------ */

/**
 * Characters that must never survive into a rendered explanation: ASCII control
 * codes plus bidirectional-override code points. Bidi overrides can visually
 * re-order text, which would let a client make an audit trail read backwards.
 */
const UNSAFE_RENDERED_CHARS = /[\u0000-\u0009\u000B-\u001F\u007F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

/** Strip control characters and collapse whitespace, preserving single newlines. */
export function sanitizeRenderedText(value: string): string {
  return value
    .replace(UNSAFE_RENDERED_CHARS, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Text that may be echoed back into a UI or an audit trail. Sanitised first, then
 * length-bounded. React escapes on render; this stops unsafe characters from
 * ever entering storage in the first place.
 */
export function SafeTextSchema(maxLength: number, minimum = 1) {
  return z
    .string()
    .transform(value => sanitizeRenderedText(value))
    .pipe(
      z
        .string()
        .min(minimum, `Text must be at least ${minimum} character(s) after sanitising.`)
        .max(maxLength, `Text must be at most ${maxLength} characters.`)
    );
}

/** Slug used for simulated node/zone/unit/incident identifiers. */
export const SimIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{0,39}$/, 'Identifiers must be short lowercase slugs.');

/**
 * Undirected road-segment key (`"<node>|<node>"`, alphabetically sorted).
 * Validated strictly because the label is rendered inside the plan's
 * "active constraints" explanation.
 */
export const BlockedEdgeKeySchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{0,39}\|[a-z0-9][a-z0-9_-]{0,39}$/, 'Edge keys look like "nodea|nodeb".');

export const AllocationStrategySchema = z.enum(['FASTEST', 'SEVERITY_FIRST', 'COVERAGE_BALANCED']);

export const SimIncidentInputSchema = z.object({
  id: SimIdSchema,
  zone_id: SimIdSchema,
  node_id: SimIdSchema,
  severity: z.enum(['Critical', 'High', 'Moderate', 'Low']),
  title: SafeTextSchema(200, 3),
  people_at_risk: z.number().int().nonnegative().max(1_000_000).nullable().default(null),
  reported_at: SafeTimestampSchema
});

export const PlanScenarioSchema = z.object({
  unavailable_unit_ids: z.array(SimIdSchema).max(20).optional(),
  blocked_edge_keys: z.array(BlockedEdgeKeySchema).max(20).optional(),
  extra_incidents: z.array(SimIncidentInputSchema).max(10).optional(),
  hospital_at_capacity: z.boolean().optional(),
  forced_assignment: z
    .object({
      unit_id: SimIdSchema,
      incident_id: SimIdSchema
    })
    .optional()
});

export const RescueRadarRequestSchema = z.object({
  blocked_edge_keys: z.array(BlockedEdgeKeySchema).max(20).optional(),
  window_hours: z.number().positive().max(72).optional()
});

export const RescuePlansRequestSchema = z.object({
  scenario: PlanScenarioSchema.optional()
});

export const RescuePlanRequestSchema = z.object({
  strategy: AllocationStrategySchema,
  scenario: PlanScenarioSchema.optional()
});

export const RescueReplayRequestSchema = z.object({
  strategy: AllocationStrategySchema,
  override: z.object({
    unit_id: SimIdSchema,
    incident_id: SimIdSchema
  }),
  scenario: PlanScenarioSchema.optional()
});

export const RescueDecisionSchema = z.enum(['APPROVED', 'REJECTED', 'MODIFIED']);

/**
 * A human decision on a proposed plan. Every consequential recommendation must be
 * recorded this way, with the coordinator's own note, so the audit trail shows
 * who accepted which plan and why.
 */
export const RescueDecisionRequestSchema = z.object({
  decision: RescueDecisionSchema,
  strategy: AllocationStrategySchema,
  coordinator_note: SafeTextSchema(500, 3),
  /** Deterministic signature of the plan the coordinator saw (unit→incident list). */
  plan_signature: SafeTextSchema(2000, 3),
  active_constraints: z.array(SafeTextSchema(300, 3)).max(30).optional()
});

/** Structured output requested from Gemini when explaining deterministic results. */
export const RescueNarrativeOutputSchema = z.object({
  explanation: SafeTextSchema(1200, 20),
  verification_suggestions: z.array(SafeTextSchema(240, 3)).max(5).default([])
});

/**
 * Narrative request.
 *
 * The client sends the SAME deterministic inputs it would send to the plain
 * endpoints; the server recomputes the engine result and then asks the model
 * only to *explain* it. The model therefore never receives a plan it could have
 * chosen — it can only describe what the deterministic core already decided.
 */
export const RescueExplainRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('RADAR'), request: RescueRadarRequestSchema.default({}) }),
  z.object({ kind: z.literal('PLAN'), request: RescuePlanRequestSchema }),
  z.object({ kind: z.literal('REPLAY'), request: RescueReplayRequestSchema })
]);

export type RescueExplainRequest = z.infer<typeof RescueExplainRequestSchema>;
