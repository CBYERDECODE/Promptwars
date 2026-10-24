import React from 'react';
import {
  BadgeCheck,
  CircleCheckBig,
  Clock,
  Gauge,
  GitCompareArrows,
  Route,
  Scale,
  ShieldAlert,
  Target,
  TriangleAlert,
  Users
} from 'lucide-react';
import {
  ALL_STRATEGIES,
  AllocationStrategy,
  PlanDetail,
  PlanMetrics,
  RescueExplainRequest,
  STRATEGY_LABELS
} from '@resq-ai/shared';
import { postPlans, PlansResponse } from '../../api/client';
import { useOnlineStatus, useRescueDataset } from '../../hooks/useRescueData';
import { Badge, Button, Card, MetricTile, cx, calloutClasses } from '../../ui';
import { RescueShell } from './RescueShell';
import { PlanCard, planSignature } from './PlanParts';
import { DecisionPanel } from './DecisionPanel';
import { ModelExplanation } from './ModelExplanation';

interface TradeOffRow {
  key: keyof PlanMetrics;
  label: string;
  unit: string;
  help: string;
  lowerIsBetter: boolean;
}

/**
 * The metrics every plan is judged on, and which direction is an improvement.
 * Kept in the view (rather than imported) so the trade-off table can render a
 * column per strategy without duplicating the engine's own wording.
 */
const TRADE_OFF_ROWS: TradeOffRow[] = [
  { key: 'avg_response_minutes', label: 'Average response', unit: 'min', help: 'Mean modelled travel time to attended incidents.', lowerIsBetter: true },
  { key: 'worst_response_minutes', label: 'Worst response', unit: 'min', help: 'The incident that waited longest.', lowerIsBetter: true },
  { key: 'coverage_pct', label: 'Coverage within target', unit: '%', help: 'Share of incidents reached inside the target time.', lowerIsBetter: false },
  { key: 'unattended_incidents', label: 'Unattended incidents', unit: '', help: 'Incidents that receive no unit at all.', lowerIsBetter: true },
  { key: 'unattended_high_severity', label: 'Unattended Critical/High', unit: '', help: 'The most serious incidents left without a unit.', lowerIsBetter: true },
  { key: 'utilization_pct', label: 'Unit utilisation', unit: '%', help: 'Committed units as a share of available units.', lowerIsBetter: false },
  { key: 'hard_to_reach_served', label: 'Hard-to-reach served', unit: '', help: 'Isolated zones that do receive a unit.', lowerIsBetter: false },
  { key: 'hard_to_reach_unserved', label: 'Hard-to-reach unserved', unit: '', help: 'Isolated zones that do not receive a unit.', lowerIsBetter: true }
];

function formatMetric(value: number | null, unit: string): string {
  if (value === null) return '—';
  return `${value}${unit}`;
}

/**
 * FairRescue — three allocation strategies over identical inputs, compared side
 * by side so the trade-off is explicit rather than hidden inside a single
 * "optimal" answer.
 *
 * Every strategy is produced by the deterministic engine; this view only
 * presents them and asks a human to own the choice.
 */
export const FairRescue: React.FC = () => {
  const { data: datasetResponse, loading: datasetLoading, error: datasetError, reload } = useRescueDataset();
  const online = useOnlineStatus();
  const dataset = datasetResponse?.dataset ?? null;

  const [response, setResponse] = React.useState<PlansResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);
  const [selectedStrategy, setSelectedStrategy] = React.useState<AllocationStrategy>('COVERAGE_BALANCED');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResponse(await postPlans({}));
    } catch (err) {
      setError(err instanceof Error ? err : new Error('The plans could not be computed.'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const plans = response?.plans ?? [];
  const selectedPlan: PlanDetail | undefined = plans.find(plan => plan.strategy === selectedStrategy) ?? plans[0];

  const explanationRequest: RescueExplainRequest | null = selectedPlan
    ? { kind: 'PLAN', request: { strategy: selectedPlan.strategy } }
    : null;

  /** Best plan per metric, used to annotate — never to decide — the comparison. */
  const bestByKey = React.useMemo(() => {
    const best = new Map<keyof PlanMetrics, AllocationStrategy | null>();
    for (const row of TRADE_OFF_ROWS) {
      const candidates = plans
        .map(plan => ({ strategy: plan.strategy, value: plan.metrics[row.key] }))
        .filter((entry): entry is { strategy: AllocationStrategy; value: number } => entry.value !== null);
      if (candidates.length === 0) {
        best.set(row.key, null);
        continue;
      }
      const winner = candidates.reduce((accumulator, entry) =>
        row.lowerIsBetter
          ? entry.value < accumulator.value
            ? entry
            : accumulator
          : entry.value > accumulator.value
            ? entry
            : accumulator
      );
      // A tie is not a win: only annotate when a strategy is strictly best.
      const tied = candidates.filter(entry => entry.value === winner.value).length > 1;
      best.set(row.key, tied ? null : winner.strategy);
    }
    return best;
  }, [plans]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-lg font-bold text-ink">
          <Scale className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
          FairRescue
        </h1>
        <p className="mt-1 max-w-3xl text-xs text-ink-muted leading-5">
          The same five emergencies and five units, allocated three different ways. Nothing is fair by default — the
          point of this view is to make the trade-off, and who pays for it, visible before a human chooses.
        </p>
      </header>

      <RescueShell
        scenario={datasetResponse?.city}
        notice={datasetResponse?.notice}
        loading={datasetLoading}
        loadingLabel="Loading the simulated dataset and allocation parameters"
        error={datasetError}
        onRetry={reload}
        offline={!online}
      >
        {dataset && (
          <div className="space-y-4">
            <div className={cx(calloutClasses('accent'), 'text-xs text-ink-muted leading-5')}>
              All three plans are deterministic: the same inputs always produce the same result. ResQ AI proposes; a
              coordinator decides. No unit moves until the decision below is recorded.
            </div>

            {loading && <Card className="text-xs text-ink-subtle">Computing the three allocation strategies…</Card>}

            {!loading && error && (
              <Card
                tone="critical"
                title="The plans could not be computed"
                description={error.message}
                icon={TriangleAlert}
                actions={
                  <Button variant="secondary" size="sm" onClick={() => void load()}>
                    Retry
                  </Button>
                }
              >
                <p className="text-xs text-ink-muted leading-5">
                  No plan is shown rather than a stale one, so nothing can be approved by accident.
                </p>
              </Card>
            )}

            {!loading && !error && plans.length > 0 && (
              <>
                <Card
                  title="Trade-off comparison"
                  description={`Target response time: ${dataset.sla_minutes} minutes. "Best" marks the strictly better value for that metric.`}
                  icon={GitCompareArrows}
                  bodyClassName="p-0"
                >
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                      <caption className="sr-only">
                        Metric-by-metric comparison of the Fastest, Severity first and Coverage balanced allocation
                        strategies
                      </caption>
                      <thead>
                        <tr className="border-b border-line bg-surface-muted">
                          <th scope="col" className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-ink-subtle">
                            Metric
                          </th>
                          {plans.map(plan => (
                            <th
                              key={plan.strategy}
                              scope="col"
                              className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-ink-subtle"
                            >
                              {plan.strategy_label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {TRADE_OFF_ROWS.map(row => {
                          const best = bestByKey.get(row.key) ?? null;
                          return (
                            <tr key={row.key} className="border-b border-line last:border-b-0 align-top">
                              <th scope="row" className="min-w-[13rem] px-3 py-2.5">
                                <span className="block text-xs font-semibold text-ink">{row.label}</span>
                                <span className="mt-0.5 block text-[10px] text-ink-faint leading-4">{row.help}</span>
                              </th>
                              {plans.map(plan => (
                                <td key={plan.strategy} className="px-3 py-2.5">
                                  <span className="flex items-center gap-1.5">
                                    <span
                                      data-metric
                                      className={cx(
                                        'text-sm font-bold tabular-nums',
                                        best === plan.strategy ? 'text-success' : 'text-ink'
                                      )}
                                    >
                                      {formatMetric(plan.metrics[row.key], row.unit)}
                                    </span>
                                    {best === plan.strategy && (
                                      <Badge tone="success" icon={BadgeCheck} srPrefix="Comparison">
                                        Best
                                      </Badge>
                                    )}
                                  </span>
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card
                  title="Who is disadvantaged"
                  description="Each plan serves some incidents better and others worse. Stated in plain language, per plan."
                  icon={Users}
                  bodyClassName="grid grid-cols-1 gap-3 md:grid-cols-3"
                >
                  {plans.map(plan => (
                    <div key={plan.strategy} className="rounded-card border border-line bg-surface-muted px-3 py-3">
                      <p className="text-xs font-semibold text-ink">{plan.strategy_label}</p>
                      <p className="mt-1 text-[11px] text-ink-muted leading-4">{plan.disadvantaged_summary}</p>
                    </div>
                  ))}
                </Card>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                  <div className="space-y-4">
                    <Card title="Select the plan under review" icon={Scale} bodyClassName="space-y-3">
                      <div role="radiogroup" aria-label="Strategy under review" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {ALL_STRATEGIES.map(strategy => {
                          const plan = plans.find(candidate => candidate.strategy === strategy);
                          if (!plan) return null;
                          const isActive = selectedPlan?.strategy === strategy;
                          return (
                            <button
                              key={strategy}
                              type="button"
                              role="radio"
                              aria-checked={isActive}
                              onClick={() => setSelectedStrategy(strategy)}
                              className={cx(
                                'flex min-h-tap items-center justify-center gap-2 rounded-control border px-3 py-2 text-xs font-semibold transition duration-fast',
                                isActive
                                  ? 'border-accent bg-accent-soft text-accent-strong'
                                  : 'border-line-strong bg-white text-ink-muted hover:bg-surface-sunken'
                              )}
                            >
                              <Scale className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span>{plan.strategy_label}</span>
                            </button>
                          );
                        })}
                      </div>

                      {selectedPlan && (
                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                          <MetricTile
                            label="Avg response"
                            value={formatMetric(selectedPlan.metrics.avg_response_minutes, '')}
                            unit="min"
                            icon={Clock}
                            tone="accent"
                          />
                          <MetricTile
                            label="Worst response"
                            value={formatMetric(selectedPlan.metrics.worst_response_minutes, '')}
                            unit="min"
                            icon={ShieldAlert}
                            tone="neutral"
                          />
                          <MetricTile
                            label="Coverage"
                            value={selectedPlan.metrics.coverage_pct}
                            unit="%"
                            icon={Target}
                            tone="neutral"
                          />
                          <MetricTile
                            label="Utilisation"
                            value={selectedPlan.metrics.utilization_pct}
                            unit="%"
                            icon={Gauge}
                            tone="neutral"
                          />
                        </div>
                      )}
                    </Card>

                    {selectedPlan && (
                      <PlanCard
                        plan={selectedPlan}
                        slaMinutes={dataset.sla_minutes}
                        tone={selectedPlan.unassigned.length > 0 ? 'warning' : 'accent'}
                        accentRail
                      />
                    )}
                  </div>

                  <div className="space-y-4">
                    {selectedPlan && (
                      <DecisionPanel
                        strategy={selectedPlan.strategy}
                        strategyLabel={STRATEGY_LABELS[selectedPlan.strategy]}
                        planSignature={planSignature(selectedPlan)}
                        activeConstraints={selectedPlan.active_constraints}
                      />
                    )}

                    {selectedPlan && explanationRequest && <ModelExplanation request={explanationRequest} />}

                    <Card
                      title="How these plans are produced"
                      description="Algorithm parameters are shown so the comparison can be audited."
                      icon={Route}
                      tone="neutral"
                    >
                      {response && (
                        <dl className="space-y-1.5 text-[11px]">
                          {Object.entries(response.parameters).map(([key, value]) => (
                            <div key={key} className="flex items-baseline justify-between gap-2">
                              <dt className="text-ink-subtle">{key.replace(/([A-Z])/g, ' $1').toLowerCase()}</dt>
                              <dd data-metric className="font-semibold tabular-nums text-ink">
                                {value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      <p className="mt-2 flex items-start gap-1.5 text-[11px] text-ink-subtle leading-4">
                        <CircleCheckBig className="mt-0.5 h-3 w-3 shrink-0 text-ink-faint" aria-hidden="true" />
                        <span>
                          Assignments use a greedy algorithm over fully ordered candidate pairs. Ties break
                          deterministically, so the same scenario always yields the same plan.
                        </span>
                      </p>
                    </Card>
                  </div>
                </div>
              </>
            )}

            {!loading && !error && plans.length === 0 && (
              <Card className="text-xs text-ink-subtle">No plans were returned for this dataset.</Card>
            )}
          </div>
        )}
      </RescueShell>
    </div>
  );
};
