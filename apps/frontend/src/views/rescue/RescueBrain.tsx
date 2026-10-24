import React from 'react';
import {
  Ambulance,
  BedDouble,
  Brain,
  CircleAlert,
  GitCompareArrows,
  Milestone,
  Route,
  Siren,
  TriangleAlert
} from 'lucide-react';
import {
  ALL_STRATEGIES,
  AllocationStrategy,
  MILL_BRIDGE_EDGE_KEY,
  PlanDetail,
  PlanMetrics,
  PlanScenario,
  RescueExplainRequest,
  STRATEGY_LABELS,
  SimIncident
} from '@resq-ai/shared';
import { postPlan } from '../../api/client';
import { useOnlineStatus, useRescueDataset } from '../../hooks/useRescueData';
import { Badge, Button, Card, DiffRow, DiffDirection, MetricTile, ZoneMap, cx, calloutClasses } from '../../ui';
import { RescueShell } from './RescueShell';
import { AssignmentTable, ConstraintList, PlanMetricsGrid, SeverityBadge, UnassignedList } from './PlanParts';
import { ModelExplanation } from './ModelExplanation';

/**
 * SIMULATED event injected by the "new critical incident" toggle. Held in code
 * (not entered by the user) so the scenario stays reproducible and the demo
 * tour can rely on it.
 */
const EXTRA_CRITICAL_INCIDENT: SimIncident = {
  id: 'inc-demo-collapse',
  zone_id: 'z-marketrow',
  node_id: 'marketrow',
  severity: 'Critical',
  title: 'Retaining wall collapse traps shoppers beside Market Row',
  people_at_risk: 9,
  reported_at: '2026-09-12T07:05:00.000Z'
};

interface DiffSpec {
  key: keyof PlanMetrics;
  label: string;
  unit: string;
  lowerIsBetter: boolean;
}

const DIFF_SPECS: DiffSpec[] = [
  { key: 'avg_response_minutes', label: 'Average response', unit: 'min', lowerIsBetter: true },
  { key: 'worst_response_minutes', label: 'Worst response', unit: 'min', lowerIsBetter: true },
  { key: 'coverage_pct', label: 'Coverage within target', unit: '%', lowerIsBetter: false },
  { key: 'unattended_incidents', label: 'Unattended incidents', unit: '', lowerIsBetter: true },
  { key: 'unattended_high_severity', label: 'Unattended Critical/High', unit: '', lowerIsBetter: true },
  { key: 'utilization_pct', label: 'Unit utilisation', unit: '%', lowerIsBetter: false },
  { key: 'hard_to_reach_served', label: 'Hard-to-reach served', unit: '', lowerIsBetter: false },
  { key: 'hard_to_reach_unserved', label: 'Hard-to-reach unserved', unit: '', lowerIsBetter: true }
];

function format(value: number | null, unit: string): string {
  return value === null ? '—' : `${value}${unit}`;
}

/** Pushes an update into a `Set` without mutating in place. */
function withToggled(list: string[], id: string, enabled: boolean): string[] {
  if (enabled) return list.includes(id) ? list : [...list, id];
  return list.filter(entry => entry !== id);
}

/**
 * RescueBrain — the live replanning workspace.
 *
 * Four event toggles (unit unavailable, road blocked, new critical incident,
 * hospital at capacity) recompute the same deterministic engine instantly. The
 * view then shows the previous plan against the updated one, what changed, the
 * response-time deltas and the constraints now in force — so a coordinator can
 * see the cost of an event, not just its result.
 */
export const RescueBrain: React.FC = () => {
  const { data: datasetResponse, loading: datasetLoading, error: datasetError, reload } = useRescueDataset();
  const online = useOnlineStatus();
  const dataset = datasetResponse?.dataset ?? null;

  const [strategy, setStrategy] = React.useState<AllocationStrategy>('COVERAGE_BALANCED');
  const [unavailableUnits, setUnavailableUnits] = React.useState<string[]>([]);
  const [bridgeClosed, setBridgeClosed] = React.useState(false);
  const [hospitalAtCapacity, setHospitalAtCapacity] = React.useState(false);
  const [injectCritical, setInjectCritical] = React.useState(false);

  const [plan, setPlan] = React.useState<PlanDetail | null>(null);
  const [previousPlan, setPreviousPlan] = React.useState<PlanDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  const planRef = React.useRef<PlanDetail | null>(null);

  const scenario: PlanScenario = React.useMemo(
    () => ({
      unavailable_unit_ids: unavailableUnits,
      blocked_edge_keys: bridgeClosed ? [MILL_BRIDGE_EDGE_KEY] : [],
      extra_incidents: injectCritical ? [EXTRA_CRITICAL_INCIDENT] : [],
      hospital_at_capacity: hospitalAtCapacity
    }),
    [unavailableUnits, bridgeClosed, injectCritical, hospitalAtCapacity]
  );

  // A plain string key keeps the effect from re-running on every render while
  // still reacting to any real change to the scenario.
  const scenarioKey = JSON.stringify(scenario);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    postPlan({ strategy, scenario })
      .then(response => {
        if (cancelled) return;
        const next = response.result;
        const previous = planRef.current;
        // Only diff plans produced by the same strategy; otherwise the
        // comparison would be meaningless.
        setPreviousPlan(previous && previous.strategy === next.strategy ? previous : null);
        planRef.current = next;
        setPlan(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error('The plan could not be recomputed.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategy, scenarioKey]);

  const explanationRequest: RescueExplainRequest = React.useMemo(
    () => ({ kind: 'PLAN', request: { strategy, scenario } }),
    [strategy, scenario]
  );

  const previousSignatures = React.useMemo(
    () => (previousPlan ? new Set(previousPlan.assignments.map(a => `${a.unit_id}|${a.incident_id}`)) : null),
    [previousPlan]
  );

  const activeEvents = [
    unavailableUnits.length > 0,
    bridgeClosed,
    hospitalAtCapacity,
    injectCritical
  ].filter(Boolean).length;

  const directionFor = (spec: DiffSpec, before: number | null, after: number | null): DiffDirection => {
    if (before === null || after === null) return null;
    if (before === after) return null;
    const improvement = spec.lowerIsBetter ? after < before : after > before;
    return improvement;
  };

  const resetScenario = () => {
    setUnavailableUnits([]);
    setBridgeClosed(false);
    setHospitalAtCapacity(false);
    setInjectCritical(false);
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-lg font-bold text-ink">
          <Brain className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
          RescueBrain
        </h1>
        <p className="mt-1 max-w-3xl text-xs text-ink-muted leading-5">
          Scenario: three ambulances, two rescue teams, five emergencies. Switch an event on and the deterministic
          engine replans immediately; the previous plan stays on screen so you can see exactly what the event cost.
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
            <div className={cx(calloutClasses('accent'), 'flex flex-wrap items-center gap-2 text-xs text-ink-muted leading-5')}>
              <span>
                Replanning is deterministic and instant. Nothing is dispatched — the updated plan still requires a
                recorded human decision.
              </span>
              <Badge tone={activeEvents > 0 ? 'warning' : 'neutral'} icon={CircleAlert} srPrefix="Scenario state">
                {activeEvents > 0 ? `${activeEvents} event(s) active` : 'Baseline scenario'}
              </Badge>
              {activeEvents > 0 && (
                <Button variant="ghost" size="sm" onClick={resetScenario}>
                  Reset scenario
                </Button>
              )}
            </div>

            {error && (
              <Card
                tone="critical"
                title="The plan could not be recomputed"
                description={error.message}
                icon={TriangleAlert}
                actions={
                  <Button variant="secondary" size="sm" onClick={() => setStrategy(current => current)}>
                    Retry
                  </Button>
                }
              >
                <p className="text-xs text-ink-muted leading-5">
                  The last valid plan is still displayed. Toggling any event will try again.
                </p>
              </Card>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              <Card
                title="Event toggles"
                description="Each toggle changes the inputs to the same deterministic engine."
                icon={Siren}
                tone={activeEvents > 0 ? 'warning' : 'neutral'}
                bodyClassName="space-y-4"
              >
                <div>
                  <label htmlFor="brain-strategy" className="block text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
                    Allocation strategy
                  </label>
                  <select
                    id="brain-strategy"
                    value={strategy}
                    onChange={event => setStrategy(event.target.value as AllocationStrategy)}
                    className="mt-1 min-h-tap w-full rounded-control border border-line-strong bg-white px-2.5 text-xs text-ink"
                  >
                    {ALL_STRATEGIES.map(candidate => (
                      <option key={candidate} value={candidate}>
                        {STRATEGY_LABELS[candidate]}
                      </option>
                    ))}
                  </select>
                </div>

                <fieldset>
                  <legend className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
                    <Ambulance className="h-3 w-3 shrink-0" aria-hidden="true" />
                    Unit unavailable
                  </legend>
                  <ul className="mt-1.5 space-y-1">
                    {dataset.units.map(unit => {
                      const checked = unavailableUnits.includes(unit.id);
                      return (
                        <li key={unit.id}>
                          <label
                            htmlFor={`brain-unit-${unit.id}`}
                            className="flex min-h-tap cursor-pointer items-center gap-2 rounded-control px-1.5 py-1.5 text-xs text-ink hover:bg-surface-sunken"
                          >
                            <input
                              id={`brain-unit-${unit.id}`}
                              type="checkbox"
                              checked={checked}
                              onChange={event => setUnavailableUnits(current => withToggled(current, unit.id, event.target.checked))}
                              className="h-4 w-4 shrink-0"
                            />
                            <span className="min-w-0 flex-1">{unit.label}</span>
                            <span className="text-[10px] uppercase tracking-wide text-ink-faint">
                              {unit.type === 'AMBULANCE' ? 'Ambulance' : 'Rescue team'}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>

                <ToggleRow
                  id="brain-bridge"
                  icon={Milestone}
                  label="Close Mill Bridge"
                  hint="West Depot ↔ Midtown Junction. This is the only link from the west bank to the rest of the city."
                  checked={bridgeClosed}
                  onChange={setBridgeClosed}
                />

                <ToggleRow
                  id="brain-hospital"
                  icon={BedDouble}
                  label="Hospital at capacity"
                  hint="Adds modelled diversion time to every transport, tightening the target response time."
                  checked={hospitalAtCapacity}
                  onChange={setHospitalAtCapacity}
                />

                <ToggleRow
                  id="brain-incident"
                  icon={Siren}
                  label="New critical incident"
                  hint={`Injects "${EXTRA_CRITICAL_INCIDENT.title}" (Severity: Critical, ${EXTRA_CRITICAL_INCIDENT.people_at_risk} people modelled at risk).`}
                  checked={injectCritical}
                  onChange={setInjectCritical}
                />

                {loading && <p className="text-[11px] text-ink-subtle">Recomputing the plan…</p>}
              </Card>

              <div className="space-y-4">
                <Card
                  title="What changed"
                  description={
                    previousPlan
                      ? "Previous plan versus the plan after the events above were applied."
                      : 'Switch an event on to see a before/after comparison.'
                  }
                  icon={GitCompareArrows}
                  tone="accent"
                  bodyClassName="space-y-3"
                >
                  {previousPlan && plan ? (
                    <div>
                      {DIFF_SPECS.map(spec => {
                        const before = previousPlan.metrics[spec.key];
                        const after = plan.metrics[spec.key];
                        const direction = directionFor(spec, before, after);
                        const detail =
                          before !== null && after !== null && before !== after
                            ? `${after - before > 0 ? '+' : ''}${Math.round((after - before) * 10) / 10}${spec.unit}`
                            : undefined;
                        return (
                          <DiffRow
                            key={spec.key}
                            label={spec.label}
                            before={format(before, spec.unit)}
                            after={format(after, spec.unit)}
                            direction={direction}
                            detail={detail}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-ink-subtle leading-5">
                      No previous plan to compare against yet. Turn on an event toggle — the engine recomputes instantly
                      and this panel becomes a before/after diff.
                    </p>
                  )}

                  <ConstraintList constraints={plan?.active_constraints ?? []} />
                </Card>

                <Card
                  title="District map (updated plan)"
                  description="Routes show the current assignments; a closed segment is drawn as a red dashed line."
                  icon={Route}
                  bodyClassName="space-y-3"
                >
                  <ZoneMap
                    dataset={dataset}
                    assessments={[]}
                    blockedEdgeKeys={bridgeClosed ? [MILL_BRIDGE_EDGE_KEY] : []}
                    plan={plan}
                  />
                </Card>
              </div>
            </div>

            {plan && (
              <>
                <PlanMetricsGrid metrics={plan.metrics} slaMinutes={dataset.sla_minutes} />

                <Card
                  title={`Updated plan — ${plan.strategy_label}`}
                  description={
                    previousSignatures
                      ? 'Pairings that changed since the previous plan are marked "Changed".'
                      : 'Deterministic proposal. Each assignment carries its own reason.'
                  }
                  icon={Route}
                  tone="accent"
                  bodyClassName="space-y-3.5"
                >
                  <AssignmentTable assignments={plan.assignments} previousSignatures={previousSignatures} />

                  <div>
                    <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
                      Unattended incidents ({plan.unassigned.length})
                    </h3>
                    <div className="mt-1.5">
                      <UnassignedList unassigned={plan.unassigned} />
                    </div>
                  </div>

                  {(plan.unassigned.length > 0 || plan.metrics.hard_to_reach_unserved > 0) && (
                    <div className="grid grid-cols-2 gap-2.5">
                      {plan.unassigned.length > 0 && (
                        <MetricTile
                          label="Highest unattended severity"
                          value={plan.unassigned.reduce(
                            (worst, incident) =>
                              severityWeight(incident.severity) > severityWeight(worst) ? incident.severity : worst,
                            plan.unassigned[0].severity
                          )}
                          icon={TriangleAlert}
                          tone={plan.metrics.unattended_high_severity > 0 ? 'critical' : 'neutral'}
                          status={
                            plan.metrics.unattended_high_severity > 0
                              ? { tone: 'critical', icon: TriangleAlert, label: 'Needs attention' }
                              : { tone: 'warning', icon: CircleAlert, label: 'Lower severity only' }
                          }
                        />
                      )}
                      <MetricTile
                        label="Hard-to-reach unserved"
                        value={plan.metrics.hard_to_reach_unserved}
                        icon={CircleAlert}
                        tone={plan.metrics.hard_to_reach_unserved > 0 ? 'critical' : 'success'}
                        help="Isolated zones that receive no unit."
                      />
                    </div>
                  )}
                </Card>
              </>
            )}

            {plan && (
              <Card title="Current plan snapshot" icon={Brain} tone="neutral" bodyClassName="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-ink">{plan.strategy_label}</span>
                  {plan.unassigned.length > 0 && (
                    <>
                      <Badge tone="critical" icon={TriangleAlert}>
                        {plan.unassigned.length} unattended
                      </Badge>
                      {plan.unassigned.slice(0, 3).map(incident => (
                        <span key={incident.incident_id} className="inline-flex items-center gap-1.5">
                          <SeverityBadge severity={incident.severity} />
                          <span className="text-[11px] text-ink-muted">{incident.incident_title}</span>
                        </span>
                      ))}
                    </>
                  )}
                </div>
                <p className="text-[11px] text-ink-subtle leading-4">{plan.disadvantaged_summary}</p>
              </Card>
            )}

            <ModelExplanation request={explanationRequest} />
          </div>
        )}
      </RescueShell>
    </div>
  );
};

const SEVERITY_WEIGHT: Record<string, number> = { Critical: 4, High: 3, Moderate: 2, Low: 1 };

function severityWeight(severity: string): number {
  return SEVERITY_WEIGHT[severity] ?? 0;
}

interface ToggleRowProps {
  id: string;
  icon: typeof Milestone;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ id, icon: Icon, label, hint, checked, onChange }) => (
  <div className="border-t border-line pt-3">
    <label htmlFor={id} className="flex min-h-tap cursor-pointer items-start gap-2 rounded-control py-1">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          <Icon className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
          {label}
        </span>
        <span className="mt-0.5 block text-[11px] text-ink-subtle leading-4">{hint}</span>
      </span>
    </label>
  </div>
);
