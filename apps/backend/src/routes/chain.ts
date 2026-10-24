/**
 * Chain — relief supply distribution API (SIMULATED), Tier 3.
 *
 * ARCHITECTURE GUARANTEE
 * ----------------------
 * Every requirement, route and allocation on these routes is produced by the
 * deterministic engine in `@resq-ai/shared` (`computeSupplyPlan`). The same
 * inputs always produce byte-identical output, including tie-breaks; no model is
 * involved anywhere on this surface, and no request body can change the plan
 * beyond the documented scenario toggles.
 *
 * SAFETY GUARANTEE
 * ----------------
 * Every response carries `is_simulated: true`. Nothing here dispatches a
 * shipment: a distribution plan is a proposal that only becomes an action once a
 * human coordinator records a decision (`/decision`), which is written to the
 * audit trail with a timestamp and their own note.
 *
 * All request bodies are validated with Zod before use, and every string echoed
 * back or written to the audit log is sanitised by the shared schemas.
 */

import { Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  CHAIN_FRAMING,
  CHAIN_NOTICE,
  COMMODITIES,
  SUPPLY_LABEL,
  SUPPLY_PARAMETERS,
  SupplyDecisionRequestSchema,
  SupplyPlanRequestSchema,
  computeSupplyPlan,
  getSimulatedDataset
} from '@resq-ai/shared';
import { ActivityLogEntry, ActivityLogService } from '../services/activityLog.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

/** Which audit action a coordinator decision maps to. */
const DECISION_ACTION: Record<'APPROVED' | 'REJECTED' | 'MODIFIED', ActivityLogEntry['action_type']> = {
  APPROVED: 'CHAIN_PLAN_APPROVED',
  REJECTED: 'CHAIN_PLAN_REJECTED',
  MODIFIED: 'CHAIN_PLAN_MODIFIED'
};

/** Recorded human decision returned by `/decision`. */
export interface ChainDecisionRecord {
  is_simulated: true;
  decision: 'APPROVED' | 'REJECTED' | 'MODIFIED';
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

export function createChainRouter(activityLog: ActivityLogService): Router {
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
        message: 'Too many relief-supply requests. Please try again later.',
        timestamp: new Date().toISOString()
      }
    }
  });

  // Idempotency cache: replaying the same decision must never write a second
  // audit entry (a double-click must not look like two approvals).
  const decisionCache = new Map<string, { body: ChainDecisionRecord; at: number }>();
  const DECISION_TTL_MS = 15 * 60 * 1000;

  router.use(computeLimiter);

  /**
   * POST /api/chain/plan
   * Computes a distribution proposal for the SIMULATED depots over the modelled
   * road network under the supplied scenario toggles.
   */
  router.post('/plan', (req: Request, res: Response) => {
    const input = SupplyPlanRequestSchema.parse(req.body ?? {});
    const dataset = getSimulatedDataset();
    const result = computeSupplyPlan(dataset, input.scenario ?? {});
    res.json({
      is_simulated: true,
      label: SUPPLY_LABEL,
      notice: CHAIN_NOTICE,
      framing: CHAIN_FRAMING,
      result,
      commodities: COMMODITIES,
      parameters: SUPPLY_PARAMETERS
    });
  });

  /**
   * POST /api/chain/decision
   * Records a human APPROVE / REJECT / MODIFY of a distribution proposal.
   * Administrative authorization is required because this writes to the
   * tamper-evident audit trail.
   */
  router.post('/decision', requireAdmin, (req: Request, res: Response) => {
    const input = SupplyDecisionRequestSchema.parse(req.body ?? {});

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
      `Coordinator ${input.decision} the relief distribution proposal. Note: "${input.coordinator_note}" Plan signature: ${input.plan_signature}`
    );

    const record: ChainDecisionRecord = {
      is_simulated: true,
      decision: input.decision,
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
