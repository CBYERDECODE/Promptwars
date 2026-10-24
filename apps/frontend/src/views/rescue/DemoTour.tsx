import React from 'react';
import {
  Ambulance,
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  CircleCheckBig,
  ClipboardCheck,
  FlaskConical,
  GitCompareArrows,
  ListTree,
  Milestone,
  OctagonAlert,
  Pause,
  Play,
  Radar,
  Rewind,
  Route,
  Scale,
  SkipForward,
  Target,
  TriangleAlert
} from 'lucide-react';
import {
  CRISIS_REPLAY_BANNER,
  MILL_BRIDGE_EDGE_KEY,
  PlanDetail,
  PlanMetrics,
  RadarDetailResult,
  ReplayDetail
} from '@resq-ai/shared';
import {
  PlanResponse,
  PlansResponse,
  RadarResponse,
  ReplayResponse,
  postPlan,
  postPlans,
  postRadar,
  postReplay
} from '../../api/client';
import { useOnlineStatus, useRescueDataset } from '../../hooks/useRescueData';
import {
  Badge,
  Button,
  Card,
  ConfidenceMeter,
  DiffRow,
  MetricTile,
  Stepper,
  StepDefinition,
  ZoneMap,
  cx,
  calloutClasses
} from '../../ui';
import { RescueShell } from './RescueShell';
import { AssignmentTable, SeverityBadge, planSignature } from './PlanParts';
import { DecisionPanel } from './DecisionPanel';

/** How long each stage is shown while the tour plays. 6 × 14s ≈ 84s, inside the 90s budget. */
const STAGE_MS = 14_000;

const STRATEGY = 'COVERAGE_BALANCED' as const;

const STAGES: StepDefinition[] = [
  { id: 'reports', label: 'Reports arrive', description: 'Five flooded neighbourhoods, uneven reporting.' },
  { id: 'radar', label: 'Radar flags zones', description: 'Two quiet zones warrant verification.' },
  { id: 'fairrescue', label: 'Compare plans', description: 'Fastest, Severity first and Coverage balanced.' },
  { id: 'brain', label: 'Bridge closes', description: 'RescueBrain replans and diffs the result.' },
  { id: 'replay', label: 'Alternative checked', description: 'CrisisReplay tests a forced pairing.' },
  { id: 'approve', label: 'Coordinator approves', description: 'A human owns the final plan.' }
];

interface ClosureDiffSpec {
  label: string;
  key: keyof PlanMetrics;
  unit: string;
  lowerIsBetter: boolean;
}

/** Metrics diffed between the plan before and after the bridge closure. */
const CLOSURE_DIFFS: ClosureDiffSpec[] = [
  { label: 'Average response', key: 'avg_response_minutes', unit: 'min', lowerIsBetter: true },
  { label: 'Worst response', key: 'worst_response_minutes', unit: 'min', lowerIsBetter: true },
  { label: 'Coverage within target', key: 'coverage_pct', unit: '%', lowerIsBetter: false },
  { label: 'Unattended incidents', key: 'unattended_incidents', unit: '', lowerIsBetter: true },
  { label: 'Unattended Critical/High', key: 'unattended_high_severity', unit: '', lowerIsBetter: true },
  { label: 'Hard-to-reach served', key: 'hard_to_reach_served', unit: '', lowerIsBetter: false }
];

interface Prepared {
  radar: RadarResponse;
  plans: PlansResponse;
  baseline: PlanResponse;
  withClosure: PlanResponse;
  replay: ReplayResponse;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

interface Props {
  /** Leaves the tour (the "Skip tour" action). */
  onExit: () => void;
}

/**
 * SIMULATED guided demo — "severe flood, five neighbourhoods".
 *
 * A one-click, six-step tour that drives the real deterministic endpoints in
 * order and stops on a human approval step. It is skippable, pausable,
 * restartable and fully keyboard-operable, and it honours
 * `prefers-reduced-motion` by not auto-advancing.
 */
export const DemoTour: React.FC<Props> = ({ onExit }) => {
  const { data: datasetResponse, loading: datasetLoading, error: datasetError, reload } = useRescueDataset();
  const online = useOnlineStatus();
  const dataset = datasetResponse?.dataset ?? null;

  const [prepared, setPrepared] = React.useState<Prepared | null>(null);
  const [preparing, setPreparing] = React.useState(false);
  const [prepareError, setPrepareError] = React.useState<Error | null>(null);

  const [stage, setStage] = React.useState(0);
  const [playing, setPlaying] = React.useState(!prefersReducedMotion());

  const startedRef = React.useRef(false);

  // Prepare every stage's data up front so the tour itself never stalls.
  React.useEffect(() => {
    if (!dataset || startedRef.current) return;
    startedRef.current = true;

    const unitId = dataset.units[0]?.id ?? 'amb-1';
    const incidentId = dataset.incidents[0]?.id ?? 'inc-northgate';
    const closure = { blocked_edge_keys: [MILL_BRIDGE_EDGE_KEY] };

    setPreparing(true);
    setPrepareError(null);

    Promise.all([
      postRadar({ window_hours: 3 }),
      postPlans({}),
      postPlan({ strategy: STRATEGY }),
      postPlan({ strategy: STRATEGY, scenario: closure }),
      postReplay({ strategy: STRATEGY, override: { unit_id: unitId, incident_id: incidentId }, scenario: closure })
    ])
      .then(([radar, plans, baseline, withClosure, replay]) => {
        setPrepared({ radar, plans, baseline, withClosure, replay });
      })
      .catch((err: unknown) => {
        setPrepareError(err instanceof Error ? err : new Error('The demo could not be prepared.'));
      })
      .finally(() => setPreparing(false));
  }, [dataset]);

  // Auto-advance while playing.
  React.useEffect(() => {
    if (!playing || stage >= STAGES.length - 1) return undefined;
    const timer = setTimeout(() => setStage(current => current + 1), STAGE_MS);
    return () => clearTimeout(timer);
  }, [playing, stage]);

  React.useEffect(() => {
    if (stage >= STAGES.length - 1) setPlaying(false);
  }, [stage]);

  const restart = () => {
    setStage(0);
    setPlaying(!prefersReducedMotion());
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setStage(current => Math.min(current + 1, STAGES.length - 1));
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setStage(current => Math.max(current - 1, 0));
    } else if (event.key === ' ') {
      event.preventDefault();
      setPlaying(current => !current);
    }
  };

  const radarResult: RadarDetailResult | null = prepared?.radar.result ?? null;
  const baselinePlan: PlanDetail | null = prepared?.baseline.result ?? null;
  const closurePlan: PlanDetail | null = prepared?.withClosure.result ?? null;
  const replayResult: ReplayDetail | null = prepared?.replay.result ?? null;

  const flaggedZones = radarResult?.zones.filter(zone => zone.priority_score >= 50) ?? [];

  const changedPairings = React.useMemo(() => {
    if (!baselinePlan || !closurePlan) return [];
    const before = new Set(baselinePlan.assignments.map(a => `${a.unit_id}|${a.incident_id}`));
    return closurePlan.assignments.filter(a => !before.has(`${a.unit_id}|${a.incident_id}`));
  }, [baselinePlan, closurePlan]);

  const reportCounts = React.useMemo(() => {
    if (!dataset) return [];
    const counts = new Map<string, number>();
    for (const report of dataset.reports) counts.set(report.zone_id, (counts.get(report.zone_id) ?? 0) + 1);
    return dataset.zones.map(zone => ({ zone, count: counts.get(zone.id) ?? 0 }));
  }, [dataset]);

  const ready = Boolean(prepared) || Boolean(prepareError);

  return (
    <div className="space-y-4" onKeyDown={onKeyDown}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-bold text-ink">
            <FlaskConical className="h-5 w-5 shrink-0 text-uncertain" aria-hidden="true" />
            Guided demo — severe flood, five neighbourhoods
          </h1>
          <p className="mt-1 max-w-3xl text-xs text-ink-muted leading-5">
            A six-step walkthrough of the rescue-intelligence workflow, from incoming reports to a recorded human
            decision. Use Next / Back, the step list, or the arrow keys. Press Space to pause.
          </p>
        </div>
        <Button variant="ghost" icon={SkipForward} onClick={onExit}>
          Skip tour
        </Button>
      </header>

      <RescueShell
        scenario={datasetResponse?.city}
        notice={datasetResponse?.notice}
        loading={datasetLoading}
        loadingLabel="Preparing the guided demo"
        error={datasetError}
        onRetry={reload}
        offline={!online}
      >
        {dataset && (
          <div className="space-y-4">
            <Card
              title="Tour"
              description="Each step runs the real deterministic endpoints — nothing on this screen is a mock-up."
              icon={Play}
              tone="accent"
              bodyClassName="space-y-3.5"
            >
              <div className="overflow-x-auto pb-1">
                <Stepper steps={STAGES} current={stage} ariaLabel="Guided demo steps" onSelect={setStage} maxReachable={STAGES.length - 1} />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  icon={ArrowLeft}
                  disabled={stage === 0}
                  onClick={() => setStage(current => Math.max(current - 1, 0))}
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  icon={ArrowRight}
                  disabled={stage >= STAGES.length - 1}
                  onClick={() => setStage(current => Math.min(current + 1, STAGES.length - 1))}
                >
                  Next
                </Button>
                <Button
                  variant={playing ? 'secondary' : 'primary'}
                  icon={playing ? Pause : Play}
                  onClick={() => setPlaying(current => !current)}
                  aria-pressed={playing}
                >
                  {playing ? 'Pause' : 'Play'}
                </Button>
                <Button variant="ghost" icon={Rewind} onClick={restart}>
                  Restart
                </Button>

                <span className="ml-auto flex items-center gap-2">
                  <span className="text-[11px] text-ink-subtle">
                    Step {stage + 1} of {STAGES.length}
                  </span>
                  <span aria-hidden="true" className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-sunken">
                    <span
                      className="block h-full rounded-full bg-accent transition-[width] duration-slow"
                      style={{ width: `${((stage + 1) / STAGES.length) * 100}%` }}
                    />
                  </span>
                </span>
              </div>

              <p aria-live="polite" className="sr-only">
                Step {stage + 1} of {STAGES.length}: {STAGES[stage].label}. {STAGES[stage].description}
              </p>
            </Card>

            {preparing && !ready && <Card className="text-xs text-ink-subtle">Computing every step of the demo…</Card>}

            {prepareError && (
              <Card
                tone="critical"
                title="The demo could not be prepared"
                description={prepareError.message}
                icon={TriangleAlert}
                actions={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      startedRef.current = false;
                      setPrepared(null);
                      setPrepareError(null);
                      setStage(0);
                    }}
                  >
                    Try again
                  </Button>
                }
              >
                <p className="text-xs text-ink-muted leading-5">
                  Every step of the tour needs the deterministic engines. Nothing has been changed.
                </p>
              </Card>
            )}

            {prepared && (
              <div className="space-y-4">
                {stage === 0 && (
                  <Card
                    title="1. Reports arrive"
                    description="Severe flood across five neighbourhoods. Reporting is uneven — that is the whole problem."
                    icon={ListTree}
                    tone="accent"
                    bodyClassName="space-y-3"
                  >
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                      {reportCounts.map(({ zone, count }) => (
                        <MetricTile
                          key={zone.id}
                          label={zone.name}
                          value={count}
                          icon={count === 0 ? CircleAlert : ListTree}
                          tone={count === 0 ? 'uncertain' : 'accent'}
                          status={
                            count === 0
                              ? { tone: 'uncertain', icon: CircleAlert, label: 'No reports' }
                              : undefined
                          }
                          help={`Simulated population ${zone.population.toLocaleString('en-US')}`}
                        />
                      ))}
                    </div>
                    <div className={cx(calloutClasses('uncertain'), 'text-xs text-ink-muted leading-5')}>
                      Reports cluster in three neighbourhoods. Two are quiet. A quiet zone is a data gap, not a safe
                      zone — the radar exists to keep that difference visible.
                    </div>
                  </Card>
                )}

                {stage === 1 && radarResult && (
                  <Card
                    title="2. Invisible Victims Radar flags zones"
                    description="Scored on population exposure, incident proximity, reporting gap, connectivity, road access and severity."
                    icon={Radar}
                    tone="uncertain"
                    accentRail
                    bodyClassName="space-y-3.5"
                  >
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <ZoneMap dataset={dataset} assessments={radarResult.zones} />
                      <div className="space-y-3">
                        <p className="text-xs text-ink-muted leading-5">{radarResult.framing}</p>
                        <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
                          Zones warranting verification ({flaggedZones.length})
                        </h3>
                        <ul className="space-y-2.5">
                          {flaggedZones.map(zone => (
                            <li key={zone.zone_id} className="rounded-card border border-uncertain-border bg-uncertain-soft px-3 py-2.5">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-ink">{zone.zone_name}</span>
                                <Badge tone="uncertain" icon={CircleAlert}>
                                  {zone.priority_score}/100 — warrants verification
                                </Badge>
                              </div>
                              <div className="mt-1.5">
                                <ConfidenceMeter confidence={zone.confidence} label="Evidence confidence" />
                              </div>
                              <p className="mt-1.5 text-[11px] text-ink-muted leading-4">
                                {zone.recommended_verification_actions[0] ?? 'Add to the next verification sweep.'}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </Card>
                )}

                {stage === 2 && prepared && (
                  <Card
                    title="3. FairRescue compares three plans"
                    description="The same five emergencies allocated three ways, so the trade-off is explicit."
                    icon={Scale}
                    tone="accent"
                    bodyClassName="space-y-3"
                  >
                    <div className={cx(calloutClasses('accent'), 'text-xs text-ink-muted leading-5')}>
                      No plan is dispatched automatically. Compare the three before choosing — and note who each one
                      disadvantages.
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      {prepared.plans.plans.map(plan => (
                        <div key={plan.strategy} className="rounded-card border border-line bg-surface px-3 py-3">
                          <div className="flex items-center gap-2">
                            <Route className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                            <span className="text-xs font-semibold text-ink">{plan.strategy_label}</span>
                          </div>
                          <dl className="mt-2 space-y-1 text-[11px]">
                            <MetricRow label="Average response" value={`${plan.metrics.avg_response_minutes ?? '—'} min`} />
                            <MetricRow label="Worst response" value={`${plan.metrics.worst_response_minutes ?? '—'} min`} />
                            <MetricRow label="Coverage" value={`${plan.metrics.coverage_pct}%`} />
                            <MetricRow label="Unattended" value={String(plan.metrics.unattended_incidents)} />
                            <MetricRow label="Critical/High unattended" value={String(plan.metrics.unattended_high_severity)} />
                            <MetricRow label="Hard-to-reach unserved" value={String(plan.metrics.hard_to_reach_unserved)} />
                          </dl>
                          <p className="mt-2 border-t border-line pt-2 text-[11px] text-ink-subtle leading-4">
                            {plan.disadvantaged_summary}
                          </p>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {stage === 3 && baselinePlan && closurePlan && (
                  <Card
                    title="4. Bridge closes — RescueBrain recomputes"
                    description="Mill Bridge is the only link from the west bank. Closing it changes the plan immediately."
                    icon={GitCompareArrows}
                    tone="warning"
                    accentRail
                    bodyClassName="space-y-3.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="critical" icon={Milestone}>
                        Mill Bridge closed: West Depot ↔ Midtown Junction
                      </Badge>
                      <span className="text-[11px] text-ink-subtle">
                        Comparing the {closurePlan.strategy_label} plan before and after the closure.
                      </span>
                    </div>

                    <div>
                      {CLOSURE_DIFFS.map(spec => {
                        const before = baselinePlan.metrics[spec.key];
                        const after = closurePlan.metrics[spec.key];
                        const direction =
                          before === null || after === null || before === after
                            ? null
                            : spec.lowerIsBetter
                              ? after < before
                              : after > before;
                        const detail =
                          before !== null && after !== null && before !== after
                            ? `${after - before > 0 ? '+' : ''}${Math.round((after - before) * 10) / 10}${spec.unit}`
                            : undefined;
                        return (
                          <DiffRow
                            key={spec.key}
                            label={spec.label}
                            before={`${before ?? '—'}${spec.unit}`}
                            after={`${after ?? '—'}${spec.unit}`}
                            direction={direction}
                            detail={detail}
                          />
                        );
                      })}
                    </div>

                    <div>
                      <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
                        Pairings that changed ({changedPairings.length})
                      </h3>
                      <div className="mt-1.5">
                        <AssignmentTable
                          assignments={closurePlan.assignments}
                          previousSignatures={new Set(baselinePlan.assignments.map(a => `${a.unit_id}|${a.incident_id}`))}
                        />
                      </div>
                    </div>

                    <ul className="space-y-1">
                      {closurePlan.active_constraints.map(constraint => (
                        <li key={constraint} className="flex items-start gap-1.5 text-[11px] text-ink-muted leading-4">
                          <CircleAlert className="mt-0.5 h-3 w-3 shrink-0 text-ink-faint" aria-hidden="true" />
                          <span>{constraint}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

                {stage === 4 && replayResult && (
                  <Card
                    title="5. CrisisReplay checks an alternative"
                    description="One unit sent somewhere by hand, compared against what the rule would have done."
                    icon={Rewind}
                    tone="uncertain"
                    bodyClassName="space-y-3.5"
                  >
                    <div className={cx(calloutClasses('critical'), 'flex items-start gap-2.5')} role="note">
                      <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0 text-critical" aria-hidden="true" />
                      <p className="text-xs font-semibold text-ink leading-5">{replayResult.banner || CRISIS_REPLAY_BANNER}</p>
                    </div>

                    <p className="text-xs text-ink leading-5">{replayResult.override_summary}</p>

                    <div>
                      {replayResult.deltas.map(delta => (
                        <DiffRow
                          key={delta.metric}
                          label={delta.metric}
                          before={delta.baseline === null ? '—' : delta.baseline}
                          after={delta.hypothetical === null ? '—' : delta.hypothetical}
                          direction={delta.better}
                          detail={delta.delta === null ? undefined : `${delta.delta > 0 ? '+' : ''}${delta.delta}`}
                        />
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      <MetricTile
                        label="Baseline coverage"
                        value={replayResult.baseline.metrics.coverage_pct}
                        unit="%"
                        icon={Target}
                        tone="neutral"
                      />
                      <MetricTile
                        label="Hypothetical coverage"
                        value={replayResult.hypothetical.metrics.coverage_pct}
                        unit="%"
                        icon={Target}
                        tone="uncertain"
                      />
                      <MetricTile
                        label="Baseline unattended"
                        value={replayResult.baseline.metrics.unattended_incidents}
                        icon={CircleAlert}
                        tone="neutral"
                      />
                      <MetricTile
                        label="Hypothetical unattended"
                        value={replayResult.hypothetical.metrics.unattended_incidents}
                        icon={CircleAlert}
                        tone="uncertain"
                      />
                    </div>

                    <div>
                      <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">Assumptions</h3>
                      <ul className="mt-1.5 space-y-1">
                        {replayResult.assumptions.map(assumption => (
                          <li key={assumption} className="text-[11px] text-ink-muted leading-4">
                            • {assumption}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </Card>
                )}

                {stage === 5 && closurePlan && (
                  <div className="space-y-4">
                    <Card
                      title="6. Coordinator approves the final plan"
                      description="The last step of the workflow is always a human one."
                      icon={ClipboardCheck}
                      tone="success"
                      bodyClassName="space-y-3"
                    >
                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                        <MetricTile
                          label="Strategy"
                          value={closurePlan.strategy_label}
                          icon={Ambulance}
                          tone="accent"
                        />
                        <MetricTile
                          label="Assignments"
                          value={`${closurePlan.assignments.length}/${closurePlan.total_incidents}`}
                          icon={Route}
                          tone="neutral"
                        />
                        <MetricTile
                          label="Worst response"
                          value={closurePlan.metrics.worst_response_minutes ?? '—'}
                          unit="min"
                          icon={TriangleAlert}
                          tone="neutral"
                        />
                        <MetricTile
                          label="Unattended"
                          value={closurePlan.metrics.unattended_incidents}
                          icon={CircleAlert}
                          tone={closurePlan.metrics.unattended_incidents > 0 ? 'warning' : 'success'}
                        />
                      </div>

                      <p className="text-xs text-ink-muted leading-5">
                        This is the plan a coordinator would sign off: the coverage-balanced allocation recomputed after
                        the bridge closure. Approving it writes a permanent, timestamped audit entry — nothing is
                        dispatched by ResQ AI itself.
                      </p>

                      {closurePlan.unassigned.length > 0 && (
                        <div className="rounded-card border border-warning-border bg-warning-soft px-3 py-2.5">
                          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
                            <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
                            Incidents still unattended in this plan
                          </p>
                          <ul className="mt-1.5 space-y-1">
                            {closurePlan.unassigned.map(incident => (
                              <li key={incident.incident_id} className="flex items-center gap-2">
                                <SeverityBadge severity={incident.severity} />
                                <span className="text-[11px] text-ink-muted">{incident.incident_title}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </Card>

                    <DecisionPanel
                      strategy={closurePlan.strategy}
                      strategyLabel={closurePlan.strategy_label}
                      planSignature={planSignature(closurePlan)}
                      activeConstraints={closurePlan.active_constraints}
                    />

                    <Card title="Tour complete" icon={CircleCheckBig} tone="success">
                      <p className="text-xs text-ink-muted leading-5">
                        Reports → radar → fair comparison → replan → alternative checked → human decision. Every number
                        you saw came from the deterministic engine; the only model involvement available anywhere in
                        this flow is the optional plain-language explanation, which cannot change a plan.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button variant="secondary" icon={Rewind} onClick={restart}>
                          Run the tour again
                        </Button>
                        <Button variant="ghost" icon={SkipForward} onClick={onExit}>
                          Exit the tour
                        </Button>
                      </div>
                    </Card>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </RescueShell>
    </div>
  );
};

const MetricRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-2">
    <dt className="text-ink-subtle">{label}</dt>
    <dd data-metric className="font-semibold tabular-nums text-ink">
      {value}
    </dd>
  </div>
);
