import React from 'react';
import {
  Ambulance,
  ArrowLeftRight,
  CircleAlert,
  GitCompareArrows,
  ListTree,
  Milestone,
  OctagonAlert,
  Rewind,
  Route,
  Siren,
  TriangleAlert
} from 'lucide-react';
import {
  ALL_STRATEGIES,
  AllocationStrategy,
  CRISIS_REPLAY_BANNER,
  MILL_BRIDGE_EDGE_KEY,
  PlanScenario,
  RescueExplainRequest,
  ReplayDetail,
  STRATEGY_LABELS
} from '@resq-ai/shared';
import { postReplay, ReplayResponse } from '../../api/client';
import { useOnlineStatus, useRescueDataset } from '../../hooks/useRescueData';
import { Badge, Button, Card, DiffRow, ZoneMap, cx, calloutClasses } from '../../ui';
import { RescueShell } from './RescueShell';
import { AssignmentTable, PlanMetricsGrid, planSignature } from './PlanParts';
import { ModelExplanation } from './ModelExplanation';

/**
 * CrisisReplay — "what if unit X went to incident B instead?".
 *
 * Runs the identical deterministic engine twice: once normally, once with a
 * single forced pairing. The permanent banner states plainly that the result is
 * hypothetical, model-dependent and unverified; it is never hidden behind a
 * tooltip or an expander.
 */
export const CrisisReplay: React.FC = () => {
  const { data: datasetResponse, loading: datasetLoading, error: datasetError, reload } = useRescueDataset();
  const online = useOnlineStatus();
  const dataset = datasetResponse?.dataset ?? null;

  const [strategy, setStrategy] = React.useState<AllocationStrategy>('COVERAGE_BALANCED');
  const [unitId, setUnitId] = React.useState('');
  const [incidentId, setIncidentId] = React.useState('');
  const [bridgeClosed, setBridgeClosed] = React.useState(false);
  const [response, setResponse] = React.useState<ReplayResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  // Seed a sensible default pairing once the dataset arrives.
  React.useEffect(() => {
    if (!dataset) return;
    setUnitId(current => (current && dataset.units.some(unit => unit.id === current) ? current : dataset.units[0]?.id ?? ''));
    setIncidentId(current =>
      current && dataset.incidents.some(incident => incident.id === current)
        ? current
        : dataset.incidents[dataset.incidents.length - 1]?.id ?? ''
    );
  }, [dataset]);

  const scenario: PlanScenario = React.useMemo(
    () => (bridgeClosed ? { blocked_edge_keys: [MILL_BRIDGE_EDGE_KEY] } : {}),
    [bridgeClosed]
  );

  const run = React.useCallback(async () => {
    if (!unitId || !incidentId) return;
    setLoading(true);
    setError(null);
    try {
      const next = await postReplay({ strategy, override: { unit_id: unitId, incident_id: incidentId }, scenario });
      setResponse(next);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('The comparison could not be computed.'));
    } finally {
      setLoading(false);
    }
  }, [strategy, unitId, incidentId, scenario]);

  // Recompute whenever the question changes; the user is always looking at the
  // comparison for the selections currently on screen.
  React.useEffect(() => {
    if (!dataset) return;
    void run();
  }, [dataset, run]);

  const result: ReplayDetail | null = response?.result ?? null;
  const explanationRequest: RescueExplainRequest | null =
    result && unitId && incidentId
      ? { kind: 'REPLAY', request: { strategy, override: { unit_id: unitId, incident_id: incidentId }, scenario } }
      : null;

  const baselineSignatures = React.useMemo(
    () => (result ? new Set(result.baseline.assignments.map(a => `${a.unit_id}|${a.incident_id}`)) : null),
    [result]
  );

  const unitLabel = dataset?.units.find(unit => unit.id === unitId)?.label ?? unitId;
  const incidentTitle = dataset?.incidents.find(incident => incident.id === incidentId)?.title ?? incidentId;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-lg font-bold text-ink">
          <Rewind className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
          CrisisReplay
        </h1>
        <p className="mt-1 max-w-3xl text-xs text-ink-muted leading-5">
          Ask a hypothetical: send one unit to one incident by hand and see what the same deterministic rule would have
          done differently. The comparison is decision support only — nothing is dispatched and nothing is changed.
        </p>
      </header>

      {/* Permanent, non-dismissible banner. */}
      <div className={cx(calloutClasses('critical'), 'flex items-start gap-2.5')} role="note">
        <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0 text-critical" aria-hidden="true" />
        <p className="text-xs font-semibold text-ink leading-5">{result?.banner ?? CRISIS_REPLAY_BANNER}</p>
      </div>

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
            <Card
              title="Frame the hypothetical"
              description="Both runs use the identical strategy; only the forced pairing changes."
              icon={ArrowLeftRight}
              tone="accent"
              bodyClassName="space-y-3.5"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="replay-strategy" className="block text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
                    Strategy
                  </label>
                  <select
                    id="replay-strategy"
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

                <div>
                  <label htmlFor="replay-unit" className="block text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
                    Send unit
                  </label>
                  <select
                    id="replay-unit"
                    value={unitId}
                    onChange={event => setUnitId(event.target.value)}
                    className="mt-1 min-h-tap w-full rounded-control border border-line-strong bg-white px-2.5 text-xs text-ink"
                  >
                    {dataset.units.map(unit => (
                      <option key={unit.id} value={unit.id}>
                        {unit.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="replay-incident" className="block text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
                    To incident
                  </label>
                  <select
                    id="replay-incident"
                    value={incidentId}
                    onChange={event => setIncidentId(event.target.value)}
                    className="mt-1 min-h-tap w-full rounded-control border border-line-strong bg-white px-2.5 text-xs text-ink"
                  >
                    {dataset.incidents.map(incident => (
                      <option key={incident.id} value={incident.id}>
                        {incident.severity} — {incident.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label
                  htmlFor="replay-bridge"
                  className="flex min-h-tap cursor-pointer items-center gap-2 rounded-control px-1 text-xs text-ink"
                >
                  <input
                    id="replay-bridge"
                    type="checkbox"
                    checked={bridgeClosed}
                    onChange={event => setBridgeClosed(event.target.checked)}
                    className="h-4 w-4 shrink-0"
                  />
                  <Milestone className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
                  Apply the Mill Bridge closure to both runs
                </label>

                <Button variant="secondary" icon={GitCompareArrows} loading={loading} loadingLabel="Comparing plans" onClick={() => void run()}>
                  Recompute comparison
                </Button>
              </div>

              {unitId && incidentId && (
                <p className="text-[11px] text-ink-subtle leading-4">
                  Question under test: what if <span className="font-semibold text-ink">{unitLabel}</span> is sent to{' '}
                  <span className="font-semibold text-ink">{incidentTitle}</span> instead of following the{' '}
                  {STRATEGY_LABELS[strategy]} rule?
                </p>
              )}
            </Card>

            {loading && !result && <Card className="text-xs text-ink-subtle">Running both allocations…</Card>}

            {error && (
              <Card
                tone="critical"
                title="The comparison could not be computed"
                description={error.message}
                icon={TriangleAlert}
                actions={
                  <Button variant="secondary" size="sm" onClick={() => void run()}>
                    Retry
                  </Button>
                }
              >
                <p className="text-xs text-ink-muted leading-5">Nothing was changed and no decision was affected.</p>
              </Card>
            )}

            {result && (
              <>
                <Card
                  title="What was tested"
                  description="A single change to exactly one pairing."
                  icon={ArrowLeftRight}
                  tone="uncertain"
                  accentRail
                >
                  <p className="text-xs text-ink leading-5">{result.override_summary}</p>
                  {loading && <p className="mt-1.5 text-[11px] text-ink-subtle">Recomputing…</p>}
                </Card>

                <Card
                  title="Trade-off of the hypothetical"
                  description="Baseline plan versus the forced pairing, metric by metric."
                  icon={GitCompareArrows}
                  tone="accent"
                  bodyClassName="pt-1"
                >
                  {result.deltas.map(delta => (
                    <DiffRow
                      key={delta.metric}
                      label={delta.metric}
                      before={delta.baseline === null ? '—' : delta.baseline}
                      after={delta.hypothetical === null ? '—' : delta.hypothetical}
                      direction={delta.better}
                      detail={delta.delta === null ? undefined : `${delta.delta > 0 ? '+' : ''}${delta.delta}`}
                    />
                  ))}

                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                    {result.deltas.every(delta => delta.better === null) ? (
                      <Badge tone="neutral" icon={CircleAlert} srPrefix="Result">
                        No measurable difference
                      </Badge>
                    ) : (
                      <Badge
                        tone={result.deltas.some(delta => delta.better === false) ? 'critical' : 'success'}
                        icon={result.deltas.some(delta => delta.better === false) ? TriangleAlert : CircleAlert}
                        srPrefix="Result"
                      >
                        {result.deltas.some(delta => delta.better === false)
                          ? 'The hypothetical is worse on at least one metric'
                          : 'The hypothetical is no worse on any metric'}
                      </Badge>
                    )}
                    <span className="text-[11px] text-ink-subtle">
                      Direction words and icons are shown for every row; colour is never the only signal.
                    </span>
                  </div>
                </Card>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                  <div className="space-y-4">
                    <Card
                      title="Hypothetical plan"
                      description={`Forced pairing applied on top of the ${result.hypothetical.strategy_label} rule.`}
                      icon={Route}
                      tone="uncertain"
                      bodyClassName="space-y-3.5"
                    >
                      <PlanMetricsGrid metrics={result.hypothetical.metrics} slaMinutes={dataset.sla_minutes} />
                      <AssignmentTable
                        assignments={result.hypothetical.assignments}
                        previousSignatures={baselineSignatures}
                      />
                      <p className="text-[11px] text-ink-subtle leading-4">
                        {result.hypothetical.disadvantaged_summary}
                      </p>
                    </Card>

                    <Card
                      title="District map (hypothetical)"
                      description="Routes reflect the forced pairing."
                      icon={Milestone}
                      bodyClassName="space-y-3"
                    >
                      <ZoneMap
                        dataset={dataset}
                        assessments={[]}
                        blockedEdgeKeys={bridgeClosed ? [MILL_BRIDGE_EDGE_KEY] : []}
                        plan={result.hypothetical}
                      />
                    </Card>
                  </div>

                  <div className="space-y-4">
                    <Card
                      title="Baseline for reference"
                      description={`The unmodified ${result.baseline.strategy_label} plan.`}
                      icon={ListTree}
                      tone="neutral"
                      bodyClassName="space-y-3"
                    >
                      <PlanMetricsGrid metrics={result.baseline.metrics} slaMinutes={dataset.sla_minutes} />
                      <div className="rounded-card border border-line bg-surface-muted px-3 py-2.5">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">Baseline signature</p>
                        <p className="mt-1 break-words font-mono text-[10px] text-ink-muted">
                          {planSignature(result.baseline) || 'no assignments'}
                        </p>
                      </div>
                      <div className="rounded-card border border-line bg-surface-muted px-3 py-2.5">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">Hypothetical signature</p>
                        <p className="mt-1 break-words font-mono text-[10px] text-ink-muted">
                          {planSignature(result.hypothetical) || 'no assignments'}
                        </p>
                      </div>
                    </Card>

                    <Card
                      title="Assumptions"
                      description="What this comparison does and does not account for."
                      icon={Siren}
                      tone="neutral"
                      bodyClassName="space-y-1.5"
                    >
                      <ul className="space-y-1.5">
                        {result.assumptions.map(assumption => (
                          <li key={assumption} className="flex items-start gap-1.5 text-[11px] text-ink-muted leading-4">
                            <CircleAlert className="mt-0.5 h-3 w-3 shrink-0 text-ink-faint" aria-hidden="true" />
                            <span>{assumption}</span>
                          </li>
                        ))}
                      </ul>
                    </Card>

                    {explanationRequest && (
                      <ModelExplanation
                        request={explanationRequest}
                        title="Plain-language explanation"
                        description="Descriptive only — the comparison itself is computed by the deterministic engine."
                      />
                    )}

                    <Card
                      title="Ambulance context"
                      description="Units in the simulated district."
                      icon={Ambulance}
                      tone="neutral"
                    >
                      <ul className="space-y-1">
                        {dataset.units.map(unit => (
                          <li key={unit.id} className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-ink-muted">{unit.label}</span>
                            <span className="text-ink-faint">
                              {unit.type === 'AMBULANCE' ? 'Ambulance' : 'Rescue team'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </RescueShell>
    </div>
  );
};
