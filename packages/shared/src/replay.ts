/**
 * CrisisReplay — "what if unit X went to incident B instead?" (SIMULATED).
 *
 * Runs the exact same deterministic allocation engine twice: once as the
 * baseline, once with a single forced assignment. Nothing is executed and no
 * decision is changed; the result exists purely to make the trade-off legible
 * before a human coordinator decides.
 */

import {
  AllocationStrategy,
  CRISIS_REPLAY_BANNER,
  PlanMetrics,
  PlanScenario,
  ReplayDelta,
  ReplayOverride,
  ReplayResult,
  SimulationDataset
} from './rescue.js';
import { computePlan, STRATEGY_LABELS } from './allocation.js';

/** Metric catalogue: which direction counts as "better". */
const METRIC_CATALOGUE: Array<{ metric: string; key: keyof PlanMetrics; lowerIsBetter: boolean }> = [
  { metric: 'Average response time (min)', key: 'avg_response_minutes', lowerIsBetter: true },
  { metric: 'Worst response time (min)', key: 'worst_response_minutes', lowerIsBetter: true },
  { metric: 'Coverage within target (%)', key: 'coverage_pct', lowerIsBetter: false },
  { metric: 'Unattended incidents', key: 'unattended_incidents', lowerIsBetter: true },
  { metric: 'Unattended high-severity incidents', key: 'unattended_high_severity', lowerIsBetter: true },
  { metric: 'Unit utilisation (%)', key: 'utilization_pct', lowerIsBetter: false },
  { metric: 'Hard-to-reach incidents served', key: 'hard_to_reach_served', lowerIsBetter: false }
];

export interface ReplayOptions {
  /** Scenario toggles applied identically to both plans (road closures, etc.). */
  scenario?: PlanScenario;
}

export interface ReplayDetail extends ReplayResult {
  /** Plain-language description of what was changed. */
  override_summary: string;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeReplay(
  dataset: SimulationDataset,
  strategy: AllocationStrategy,
  override: ReplayOverride,
  options: ReplayOptions = {}
): ReplayDetail {
  const baseScenario: PlanScenario = { ...options.scenario };
  delete baseScenario.forced_assignment;

  const baseline = computePlan(dataset, strategy, baseScenario);
  const hypothetical = computePlan(dataset, strategy, {
    ...baseScenario,
    forced_assignment: { unit_id: override.unit_id, incident_id: override.incident_id }
  });

  const deltas: ReplayDelta[] = METRIC_CATALOGUE.map(({ metric, key, lowerIsBetter }) => {
    const base = baseline.metrics[key];
    const hyp = hypothetical.metrics[key];

    if (base === null || hyp === null) {
      return {
        metric,
        baseline: base,
        hypothetical: hyp,
        delta: null,
        better: null
      };
    }

    const delta = round1(hyp - base);
    return {
      metric,
      baseline: base,
      hypothetical: hyp,
      delta,
      better: delta === 0 ? null : lowerIsBetter ? delta < 0 : delta > 0
    };
  });

  const unitLabel = dataset.units.find((unit) => unit.id === override.unit_id)?.label ?? override.unit_id;
  const incidentTitle =
    dataset.incidents.find((incident) => incident.id === override.incident_id)?.title ?? override.incident_id;

  const assumptions: string[] = [
    `Both plans use the identical "${STRATEGY_LABELS[strategy]}" rule; only the forced pairing changes.`,
    'Unit availability, road closures and hospital status are the same in both plans.',
    'Travel times are modelled from a static road graph, not live traffic or weather.',
    'Response time covers modelled travel only — on-scene handling, handover and queuing are excluded.',
    'The scenario does not consider mutual-aid resources from outside the simulated district.',
    'This comparison is decision support only. A human coordinator must review and approve any change.'
  ];

  return {
    is_simulated: true,
    banner: CRISIS_REPLAY_BANNER,
    strategy,
    baseline,
    hypothetical,
    deltas,
    assumptions,
    override_summary: `What if ${unitLabel} is sent to "${incidentTitle}" instead of following the ${STRATEGY_LABELS[strategy]} rule?`
  };
}
