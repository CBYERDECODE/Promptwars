/**
 * Rescue narrative layer (SIMULATED).
 *
 * ROLE OF GEMINI — deliberately narrow:
 *   Gemini ONLY rephrases results that the deterministic engines in
 *   `@resq-ai/shared` have already computed. It never allocates units, never
 *   scores zones and never invents numbers. The prompt forbids it explicitly,
 *   and the code enforces it structurally: everything Gemini sees is a
 *   pre-computed fact string, and anything it returns must survive Zod
 *   validation before a single character reaches a user.
 *
 * FALLBACK CONTRACT
 *   Every request carries a deterministic `fallback_explanation` built from
 *   engine output. If Gemini is unconfigured, slow, malformed or invalid, the
 *   template is returned instead and the failure is logged server-side only.
 *   A provider error is never propagated to the client.
 */

import { GoogleGenAI, Type } from '@google/genai';
import {
  PlanDetail,
  RadarDetailResult,
  ReplayDetail,
  RescueNarrativeOutputSchema
} from '@resq-ai/shared';
import { config } from '../config.js';

export type NarrativeKind = 'RADAR' | 'PLAN' | 'REPLAY';

export interface RescueNarrativeRequest {
  kind: NarrativeKind;
  /** Deterministic facts. Gemini may reuse these numbers and words, and nothing else. */
  facts: string[];
  /** Always returned when the model is unavailable or its output fails validation. */
  fallback_explanation: string;
  fallback_verification_suggestions: string[];
  /** What a coordinator is being asked to understand. */
  question: string;
}

export interface RescueNarrative {
  is_simulated: true;
  kind: NarrativeKind;
  source: 'GEMINI' | 'TEMPLATE';
  explanation: string;
  verification_suggestions: string[];
}

/**
 * Injection seam so unit tests can drive the service without the GenAI SDK.
 * Returns the raw model text (expected to be JSON).
 */
export type NarrativeGenerator = (systemPrompt: string, userPrompt: string) => Promise<string>;

const NARRATIVE_SYSTEM_PROMPT = `You are the explanation layer of ResQ AI, an emergency decision-support tool used by a human coordinator.

You will be given facts that a deterministic algorithm has ALREADY computed from a SIMULATED dataset.

NON-NEGOTIABLE RULES
1. Explain only the facts you are given. Never invent numbers, places, casualties, units or roads.
2. NEVER propose, change, review or re-rank an allocation. Allocation is decided by the deterministic engine and approved by a human coordinator. Your text is descriptive only.
3. Be explicit about uncertainty. A missing report or a quiet area is unverified, never safe.
4. Never say or imply that casualties exist in a flagged zone. Flagged zones warrant verification only.
5. Never infer personal or sensitive attributes about anyone.
6. Write 2 to 4 short sentences in calm, plain language for someone under pressure. No jargon, no bullet spam, no emoji.
7. Respond with JSON only, matching: {"explanation": string, "verification_suggestions": string[]} where each suggestion is a concrete verification action (max 3).`;

export class RescueNarrativeService {
  private ai: GoogleGenAI | null = null;
  private modelName: string;
  private generator: NarrativeGenerator | null;

  constructor(options: { generator?: NarrativeGenerator } = {}) {
    this.modelName = config.geminiModel;
    if (config.geminiApiKey) {
      this.ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
    }
    this.generator = options.generator ?? null;
  }

  public isConfigured(): boolean {
    return this.generator !== null || this.ai !== null;
  }

  /** Explain deterministic results. Never throws; degrades to the template. */
  public async explain(request: RescueNarrativeRequest): Promise<RescueNarrative> {
    const template: RescueNarrative = {
      is_simulated: true,
      kind: request.kind,
      source: 'TEMPLATE',
      explanation: request.fallback_explanation,
      verification_suggestions: request.fallback_verification_suggestions
    };

    if (!this.isConfigured()) {
      return template;
    }

    const userPrompt = [
      `Question: ${request.question}`,
      'Deterministic facts (your only permitted source of content):',
      ...request.facts.map((fact, index) => `${index + 1}. ${fact}`)
    ].join('\n');

    try {
      const raw = await this.generate(NARRATIVE_SYSTEM_PROMPT, userPrompt);

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw);
      } catch {
        throw new Error('Model response was not valid JSON.');
      }

      const validated = RescueNarrativeOutputSchema.safeParse(parsedJson);
      if (!validated.success) {
        throw new Error('Model response failed schema validation.');
      }

      return {
        is_simulated: true,
        kind: request.kind,
        source: 'GEMINI',
        explanation: validated.data.explanation,
        verification_suggestions:
          validated.data.verification_suggestions.length > 0
            ? validated.data.verification_suggestions
            : request.fallback_verification_suggestions
      };
    } catch (err) {
      // Server-side only: provider/library errors are never returned to the client.
      console.warn(
        `[rescue-narrative] Falling back to the deterministic template for ${request.kind}:`,
        err instanceof Error ? err.message : 'unknown error'
      );
      return template;
    }
  }

  private async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    if (this.generator) {
      return this.generator(systemPrompt, userPrompt);
    }
    if (!this.ai) {
      throw new Error('Gemini API key is not configured on the server.');
    }

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Narrative request timed out after 20 seconds.')), 20000)
    );

    const request = this.ai.models.generateContent({
      model: this.modelName,
      contents: [{ text: userPrompt }],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            explanation: { type: Type.STRING },
            verification_suggestions: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }
        }
      }
    });

    const response: { text?: string } = await Promise.race([request, timeout]);
    if (!response.text) {
      throw new Error('Model returned an empty response.');
    }
    return response.text;
  }
}

/* ------------------------------------------------------------------ */
/* Deterministic narrative requests                                    */
/* ------------------------------------------------------------------ */

function uniqueActions(actions: string[], limit = 3): string[] {
  return Array.from(new Set(actions)).slice(0, limit);
}

/** Radar: explain why zones warrant verification, and how to check them. */
export function buildRadarNarrative(result: RadarDetailResult): RescueNarrativeRequest {
  const facts: string[] = [
    `Mandatory framing shipped with this result: ${result.framing}`,
    ...result.zones.map(zone => {
      const evidence = zone.evidence
        .map(item => `[${item.unobserved ? 'UNOBSERVED' : 'observed'}] ${item.detail}`)
        .join(' ');
      const missing =
        zone.missing_data.length > 0 ? ` Missing inputs: ${zone.missing_data.join(' ')}` : ' No missing inputs.';
      return `Zone ${zone.zone_name}: verification priority ${zone.priority_score} of 100, confidence ${zone.confidence}. ${evidence}${missing}`;
    }),
    ...result.observations
  ];

  const flagged = result.zones.filter(zone => zone.priority_score >= 50);
  const suggestions = uniqueActions(
    flagged.length > 0
      ? flagged.flatMap(zone => zone.recommended_verification_actions)
      : (result.zones[0]?.recommended_verification_actions ?? [])
  );

  return {
    kind: 'RADAR',
    facts,
    question:
      'Explain why these zones warrant verification, what evidence is missing, and what the coordinator should verify first. Do not state that anyone is trapped.',
    fallback_explanation: result.observations.join(' '),
    fallback_verification_suggestions: suggestions
  };
}

/** FairRescue / RescueBrain: explain one deterministic plan and who it leaves behind. */
export function buildPlanNarrative(plan: PlanDetail): RescueNarrativeRequest {
  const facts: string[] = [
    `Strategy: ${plan.strategy_label}.`,
    `Active constraints: ${plan.active_constraints.join(' ') || 'none.'}`,
    `Metrics: average modelled response ${plan.metrics.avg_response_minutes ?? 'unknown'} min, worst ${
      plan.metrics.worst_response_minutes ?? 'unknown'
    } min, coverage within target ${plan.metrics.coverage_pct}%, unattended incidents ${
      plan.metrics.unattended_incidents
    } (${plan.metrics.unattended_high_severity} Critical or High), unit utilisation ${plan.metrics.utilization_pct}%.`,
    ...plan.assignments.map(
      assignment =>
        `Assignment: ${assignment.unit_label} to "${assignment.incident_title}" (${assignment.severity}, ${
          assignment.travel_minutes ?? 'no modelled route'
        } min). Why: ${assignment.reasons.join(' ')}`
    ),
    ...plan.unassigned.map(
      incident =>
        `Left without a unit: "${incident.incident_title}" (${incident.severity}). Reason: ${incident.reason}`
    ),
    `Deterministic disadvantaged summary: ${plan.disadvantaged_summary}`
  ];

  const suggestions = uniqueActions(
    plan.unassigned.length > 0
      ? plan.unassigned.map(
          incident => `Verify on-scene status of "${incident.incident_title}" before the next reallocation cycle.`
        )
      : plan.assignments
          .filter(assignment => !assignment.within_sla)
          .map(
            assignment =>
              `Check whether ${assignment.unit_label} can still reach "${assignment.incident_title}" inside the target response time.`
          )
  );

  return {
    kind: 'PLAN',
    facts,
    question:
      'Explain this plan in plain language, including who is disadvantaged by it, without proposing a different allocation.',
    fallback_explanation: plan.disadvantaged_summary,
    fallback_verification_suggestions:
      suggestions.length > 0 ? suggestions : ['Add the unserved incidents to the next verification sweep.']
  };
}

/** CrisisReplay: explain the hypothetical comparison and its assumptions. */
export function buildReplayNarrative(replay: ReplayDetail): RescueNarrativeRequest {
  const facts: string[] = [
    `Mandatory banner: ${replay.banner}`,
    `Override: ${replay.override_summary}`,
    ...replay.deltas.map(
      delta =>
        `Metric "${delta.metric}": baseline ${delta.baseline ?? 'unknown'}, hypothetical ${
          delta.hypothetical ?? 'unknown'
        }, change ${delta.delta ?? 'none'}${
          delta.better === null ? ' (unchanged)' : delta.better ? ' (better)' : ' (worse)'
        }.`
    ),
    `Modelling assumptions: ${replay.assumptions.join(' ')}`
  ];

  return {
    kind: 'REPLAY',
    facts,
    question:
      'Explain what changes under this hypothetical override and what stays the same. State that the comparison is hypothetical and requires human approval.',
    fallback_explanation: `${replay.banner} ${replay.override_summary} ${
      replay.assumptions[0] ?? ''
    } A human coordinator must review this comparison before any allocation changes.`.trim(),
    fallback_verification_suggestions: [
      'Confirm the override with the coordinator who owns the affected incidents before reallocating.',
      'Re-check modelled travel times against current road reports before acting on this comparison.'
    ]
  };
}
