/**
 * Explainable Rescue Intelligence API (SIMULATED).
 *
 * ARCHITECTURE GUARANTEE
 * ----------------------
 * Every allocation, zone score and replay comparison on these routes is produced
 * by the deterministic engines in `@resq-ai/shared`. The same inputs always
 * produce byte-identical outputs, including tie-breaks. Gemini is *never* used
 * to choose or alter an allocation — the only route that talks to a model is
 * `/explain`, and it recomputes the deterministic result server-side first, then
 * asks the model to describe it in plain language (with a template fallback).
 *
 * SAFETY GUARANTEE
 * ----------------
 * Every response carries `is_simulated: true`. Nothing here dispatches anything:
 * plans are proposals that require a recorded human decision (`/decision`).
 *
 * All request bodies are validated with Zod before use, and every string that is
 * echoed back or written to the audit log is sanitised by the shared schemas.
 */

import { NextFunction, Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  ALLOCATION_PARAMETERS,
  ALL_STRATEGIES,
  AllocationStrategy,
  CRISIS_REPLAY_BANNER,
  PlanScenario,
  RADAR_FRAMING,
  RADAR_PARAMETERS,
  RADAR_WEIGHTS,
  RescueDecisionRequestSchema,
  RescueExplainRequestSchema,
  RescuePlanRequestSchema,
  RescuePlansRequestSchema,
  RescueRadarRequestSchema,
  RescueReplayRequestSchema,
  SIMULATION_CITY,
  SIMULATION_LABEL,
  STRATEGY_LABELS,
  assessZones,
  computePlan,
  computeReplay,
  getSimulatedDataset
} from '@resq-ai/shared';
import { ActivityLogEntry, ActivityLogService } from '../services/activityLog.js';
import {
  RescueNarrativeService,
  buildPlanNarrative,
  buildRadarNarrative,
  buildReplayNarrative
} from '../services/rescueNarrative.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

/** Which audit action a coordinator decision maps to. */
const DECISION_ACTION: Record<'APPROVED' | 'REJECTED' | 'MODIFIED', ActivityLogEntry['action_type']> = {
  APPROVED: 'RESCUE_PLAN_APPROVED',
  REJECTED: 'RESCUE_PLAN_REJECTED',
  MODIFIED: 'RESCUE_PLAN_MODIFIED'
};

const SIMULATION_NOTICE =
  'SIMULATED EXERCISE. The city, road times, populations, units and incidents are fictional. ' +
  'Nothing here is a real-world prediction, and no plan is dispatched automatically.';

/** Recorded human decision returned by `/decision`. */
export interface RescueDecisionRecord {
  is_simulated: true;
  decision: 'APPROVED' | 'REJECTED' | 'MODIFIED';
  strategy: AllocationStrategy;
  coordinator_note: string;
  plan_signature: string;
  active_constraints: string[];
  recorded_at: string;
  /** Id of the matching entry in the shared activity log. */
  log_entry_id: string;
  notice: string;
  /** Present and true when an identical request was served from the cache. */
  replayed?: true;
}

/** Express 4 does not forward rejected promises to the error handler. */
function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}

export function createRescueRouter(
  narrative: RescueNarrativeService,
  activityLog: ActivityLogService
): Router {
  const router = Router();

  // Dedicated limiter: these endpoints run graph computations, so they are
  // throttled independently of the global limiter.
  const computeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many rescue-intelligence requests. Please try again later.',
        timestamp: new Date().toISOString()
      }
    }
  });

  // Stricter limiter for the model-backed route — narrations cost a provider call.
  const explainLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'NARRATIVE_RATE_LIMIT_EXCEEDED',
        message: 'Too many explanation requests. The deterministic results are still available without explanations.',
        timestamp: new Date().toISOString()
      }
    }
  });

  // Idempotency cache: replaying the same decision must never write a second
  // audit entry (a double-click must not look like two approvals).
  const decisionCache = new Map<string, { body: RescueDecisionRecord; at: number }>();
  const DECISION_TTL_MS = 15 * 60 * 1000;

  router.use(computeLimiter);

  /**
   * GET /api/rescue/dataset
   * The SIMULATED dataset plus the exact algorithm parameters in use, so the UI
   * can show a coordinator what the models assume.
   */
  router.get('/dataset', (_req: Request, res: Response) => {
    const dataset = getSimulatedDataset();
    res.json({
      is_simulated: true,
      label: SIMULATION_LABEL,
      city: SIMULATION_CITY,
      notice: SIMULATION_NOTICE,
      dataset,
      framing: RADAR_FRAMING,
      replay_banner: CRISIS_REPLAY_BANNER,
      methods: {
        strategies: ALL_STRATEGIES.map((strategy) => ({ id: strategy, label: STRATEGY_LABELS[strategy] })),
        radar_weights: RADAR_WEIGHTS,
        radar_parameters: RADAR_PARAMETERS,
        allocation_parameters: ALLOCATION_PARAMETERS
      }
    });
  });

  /**
   * POST /api/rescue/radar
   * Invisible Victims Radar — deterministic zone verification priorities.
   */
  router.post('/radar', (req: Request, res: Response) => {
    const input = RescueRadarRequestSchema.parse(req.body ?? {});
    const dataset = getSimulatedDataset();
    const result = assessZones(dataset, {
      blocked_edge_keys: input.blocked_edge_keys,
      window_hours: input.window_hours
    });
    res.json({
      is_simulated: true,
      result,
      weights: RADAR_WEIGHTS,
      parameters: RADAR_PARAMETERS
    });
  });

  /**
   * POST /api/rescue/plans
   * FairRescue — the three strategies computed over identical inputs, so the UI
   * can compare them side by side.
   */
  router.post('/plans', (req: Request, res: Response) => {
    const input = RescuePlansRequestSchema.parse(req.body ?? {});
    const dataset = getSimulatedDataset();
    const scenario: PlanScenario = input.scenario ?? {};
    const plans = ALL_STRATEGIES.map((strategy) => computePlan(dataset, strategy, scenario));
    res.json({
      is_simulated: true,
      generated_at: new Date().toISOString(),
      dataset_label: dataset.label,
      notice: SIMULATION_NOTICE,
      plans,
      parameters: ALLOCATION_PARAMETERS
    });
  });

  /**
   * POST /api/rescue/plan
   * RescueBrain — one strategy recomputed under the current event toggles.
   */
  router.post('/plan', (req: Request, res: Response) => {
    const input = RescuePlanRequestSchema.parse(req.body ?? {});
    const dataset = getSimulatedDataset();
    const result = computePlan(dataset, input.strategy, input.scenario ?? {});
    res.json({ is_simulated: true, result, parameters: ALLOCATION_PARAMETERS });
  });

  /**
   * POST /api/rescue/replay
   * CrisisReplay — "what if unit X went to incident B instead?".
   */
  router.post('/replay', (req: Request, res: Response) => {
    const input = RescueReplayRequestSchema.parse(req.body ?? {});
    const dataset = getSimulatedDataset();
    const result = computeReplay(dataset, input.strategy, input.override, { scenario: input.scenario });
    res.json({ is_simulated: true, result });
  });

  /**
   * POST /api/rescue/explain
   * The only route that may call a model. The deterministic result is recomputed
   * here; the model receives it as fixed facts and may only describe it. If the
   * model is unconfigured, slow or invalid, a deterministic template is returned
   * and the provider error is logged server-side only.
   */
  router.post(
    '/explain',
    explainLimiter,
    asyncRoute(async (req: Request, res: Response) => {
      const input = RescueExplainRequestSchema.parse(req.body ?? {});
      const dataset = getSimulatedDataset();

      if (input.kind === 'RADAR') {
        const result = assessZones(dataset, {
          blocked_edge_keys: input.request.blocked_edge_keys,
          window_hours: input.request.window_hours
        });
        const explanation = await narrative.explain(buildRadarNarrative(result));
        res.json({ is_simulated: true, kind: input.kind, result, narrative: explanation });
        return;
      }

      if (input.kind === 'PLAN') {
        const result = computePlan(dataset, input.request.strategy, input.request.scenario ?? {});
        const explanation = await narrative.explain(buildPlanNarrative(result));
        res.json({ is_simulated: true, kind: input.kind, result, narrative: explanation });
        return;
      }

      const result = computeReplay(dataset, input.request.strategy, input.request.override, {
        scenario: input.request.scenario
      });
      const explanation = await narrative.explain(buildReplayNarrative(result));
      res.json({ is_simulated: true, kind: input.kind, result, narrative: explanation });
    })
  );

  /**
   * POST /api/rescue/decision
   * Records a human APPROVE / REJECT / MODIFY. Administrative authorization is
   * required because this writes to the tamper-evident audit trail.
   */
  router.post('/decision', requireAdmin, (req: Request, res: Response) => {
    const input = RescueDecisionRequestSchema.parse(req.body ?? {});

    const rawKey = req.headers['idempotency-key'];
    const idempotencyKey = typeof rawKey === 'string' && rawKey.trim().length > 0 ? rawKey.trim().slice(0, 128) : null;

    if (idempotencyKey) {
      const cached = decisionCache.get(idempotencyKey);
      if (cached && Date.now() - cached.at <= DECISION_TTL_MS) {
        res.status(200).json({ ...cached.body, replayed: true });
        return;
      }
      if (cached) decisionCache.delete(idempotencyKey);
    }

    const entry = activityLog.log(
      DECISION_ACTION[input.decision],
      `Coordinator ${input.decision} the "${STRATEGY_LABELS[input.strategy]}" plan. Note: "${input.coordinator_note}" Plan signature: ${input.plan_signature}`
    );

    const record: RescueDecisionRecord = {
      is_simulated: true,
      decision: input.decision,
      strategy: input.strategy,
      coordinator_note: input.coordinator_note,
      plan_signature: input.plan_signature,
      active_constraints: input.active_constraints ?? [],
      recorded_at: entry.timestamp,
      log_entry_id: entry.id,
      notice:
        'Recorded in the audit log with a timestamp and the coordinator note. This decision is owned by a human, not by the model.'
    };

    if (idempotencyKey) {
      decisionCache.set(idempotencyKey, { body: record, at: Date.now() });
    }

    res.status(201).json(record);
  });

  return router;
}
