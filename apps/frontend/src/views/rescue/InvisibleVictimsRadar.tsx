import React from 'react';
import {
  CircleAlert,
  ListTree,
  MapPin,
  Radar,
  Search,
  ShieldAlert,
  Table2,
  TriangleAlert,
  Users
} from 'lucide-react';
import { MILL_BRIDGE_EDGE_KEY, RADAR_FRAMING, RescueExplainRequest } from '@resq-ai/shared';
import { postRadar, RadarResponse } from '../../api/client';
import { useOnlineStatus, useRescueDataset } from '../../hooks/useRescueData';
import {
  Badge,
  Button,
  Card,
  ConfidenceMeter,
  MetricTile,
  UncertaintyNote,
  ZoneMap,
  calloutClasses,
  cx
} from '../../ui';
import { RescueShell } from './RescueShell';
import { ZoneTable } from './ZoneTable';
import { ModelExplanation } from './ModelExplanation';

const WINDOW_OPTIONS = [1, 2, 3, 6, 12] as const;

/**
 * Invisible Victims Radar.
 *
 * Ranks every simulated neighbourhood by how strongly its situation *warrants
 * verification* — never by a claim that people are trapped there. The score,
 * its evidence, the inputs that are missing and the resulting confidence are all
 * shown; nothing is hidden behind a colour.
 *
 * The map is a visual convenience. The sortable table below it carries the same
 * data and is the accessible representation.
 */
export const InvisibleVictimsRadar: React.FC = () => {
  const { data: datasetResponse, loading: datasetLoading, error: datasetError, reload } = useRescueDataset();
  const online = useOnlineStatus();
  const dataset = datasetResponse?.dataset ?? null;

  const [windowHours, setWindowHours] = React.useState<number>(3);
  const [bridgeClosed, setBridgeClosed] = React.useState(false);
  const [radar, setRadar] = React.useState<RadarResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);
  const [selectedZoneId, setSelectedZoneId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await postRadar({
        window_hours: windowHours,
        blocked_edge_keys: bridgeClosed ? [MILL_BRIDGE_EDGE_KEY] : []
      });
      setRadar(response);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('The radar could not be computed.'));
    } finally {
      setLoading(false);
    }
  }, [windowHours, bridgeClosed]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const zones = radar?.result.zones ?? [];

  // Keep a sensible selection after every recompute.
  React.useEffect(() => {
    setSelectedZoneId(current =>
      current && zones.some(zone => zone.zone_id === current) ? current : zones[0]?.zone_id ?? null
    );
  }, [zones]);

  const selected = zones.find(zone => zone.zone_id === selectedZoneId) ?? zones[0] ?? null;
  const threshold = radar?.parameters.highPriorityThreshold ?? 50;
  const flaggedCount = zones.filter(zone => zone.priority_score >= threshold).length;
  const silentCount = zones.filter(zone => zone.reports_observed === 0).length;

  const explanationRequest: RescueExplainRequest = React.useMemo(
    () => ({
      kind: 'RADAR',
      request: { window_hours: windowHours, blocked_edge_keys: bridgeClosed ? [MILL_BRIDGE_EDGE_KEY] : [] }
    }),
    [windowHours, bridgeClosed]
  );

  const controls = (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="radar-window" className="block text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
          Analysis window
        </label>
        <select
          id="radar-window"
          value={windowHours}
          onChange={event => setWindowHours(Number(event.target.value))}
          className="mt-1 min-h-tap rounded-control border border-line-strong bg-white px-2.5 text-xs text-ink"
        >
          {WINDOW_OPTIONS.map(hours => (
            <option key={hours} value={hours}>
              Last {hours} hour{hours === 1 ? '' : 's'}
            </option>
          ))}
        </select>
      </div>

      <Button
        variant={bridgeClosed ? 'danger' : 'secondary'}
        icon={bridgeClosed ? TriangleAlert : ShieldAlert}
        aria-pressed={bridgeClosed}
        onClick={() => setBridgeClosed(current => !current)}
      >
        {bridgeClosed ? 'Mill Bridge closed' : 'Simulate Mill Bridge closure'}
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-bold text-ink">
            <Radar className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
            Invisible Victims Radar
          </h1>
          <p className="mt-1 max-w-3xl text-xs text-ink-muted leading-5">
            Ranks each simulated neighbourhood by how strongly its situation warrants verification. A high score is a
            reason to check, never a statement that people are trapped. Missing reports raise uncertainty and priority
            together.
          </p>
        </div>
        {controls}
      </header>

      <RescueShell
        scenario={datasetResponse?.city}
        notice={datasetResponse?.notice}
        loading={datasetLoading}
        loadingLabel="Loading the simulated dataset and algorithm parameters"
        error={datasetError}
        onRetry={reload}
        offline={!online}
      >
        {dataset && (
          <div className="space-y-4">
            <div className={cx(calloutClasses('uncertain'), 'flex items-start gap-2.5')}>
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-uncertain" aria-hidden="true" />
              <p className="text-xs text-ink-muted leading-5">{datasetResponse?.framing ?? RADAR_FRAMING}</p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              <MetricTile
                label="Zones assessed"
                value={zones.length}
                icon={MapPin}
                tone="neutral"
                help={datasetResponse?.city}
              />
              <MetricTile
                label="Warrant verification"
                value={flaggedCount}
                icon={Search}
                tone={flaggedCount > 0 ? 'uncertain' : 'success'}
                status={
                  flaggedCount > 0
                    ? { tone: 'uncertain', icon: CircleAlert, label: `≥ ${threshold} points` }
                    : { tone: 'success', icon: Search, label: 'None flagged' }
                }
              />
              <MetricTile
                label="Zones with no reports"
                value={silentCount}
                icon={Users}
                tone={silentCount > 0 ? 'uncertain' : 'neutral'}
                help="Silence is treated as a data gap, never as safety."
              />
              <MetricTile
                label="Largest reporting gap"
                value={
                  zones.length === 0
                    ? '—'
                    : `${Math.max(...zones.map(zone => Math.max(0, zone.reports_expected - zone.reports_observed))).toFixed(1)}`
                }
                icon={ListTree}
                tone="accent"
                unit="reports below expectation"
              />
            </div>

            {loading && <Card className="text-xs text-ink-subtle">Recomputing verification priorities…</Card>}

            {!loading && error && (
              <Card
                tone="critical"
                title="The radar could not be recomputed"
                description={error.message}
                icon={TriangleAlert}
                actions={
                  <Button variant="secondary" size="sm" onClick={() => void load()}>
                    Retry
                  </Button>
                }
              >
                <p className="text-xs text-ink-muted leading-5">
                  The last successful result is still shown below. Nothing has been dispatched and no decision has been
                  affected.
                </p>
              </Card>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              <Card
                title="District map"
                description="Flagged zones are hatched when confidence is Low or Medium. Select a zone for its evidence."
                icon={MapPin}
                tone="accent"
                bodyClassName="space-y-3"
              >
                <ZoneMap
                  dataset={dataset}
                  assessments={zones}
                  blockedEdgeKeys={bridgeClosed ? [MILL_BRIDGE_EDGE_KEY] : []}
                  selectedZoneId={selected?.zone_id ?? null}
                  onSelectZone={setSelectedZoneId}
                />
                <UncertaintyNote>
                  Hatching marks uncertainty, not danger. The map itself is decorative; every figure on it is also
                  listed in the table below.
                </UncertaintyNote>
              </Card>

              <Card
                title={selected ? `Evidence — ${selected.zone_name}` : 'Evidence'}
                description="Why this zone ranks where it does, what is missing, and what to check first."
                icon={Search}
                tone={selected && selected.priority_score >= threshold ? 'uncertain' : 'neutral'}
                accentRail={Boolean(selected && selected.priority_score >= threshold)}
                bodyClassName="space-y-3.5"
              >
                {selected ? (
                  <>
                    <div className="grid grid-cols-2 gap-2.5">
                      <MetricTile
                        label="Verification priority"
                        value={selected.priority_score}
                        unit="/ 100"
                        icon={Search}
                        tone={selected.priority_score >= threshold ? 'uncertain' : 'neutral'}
                        status={
                          selected.priority_score >= threshold
                            ? { tone: 'uncertain', icon: CircleAlert, label: 'Warrants verification' }
                            : { tone: 'neutral', icon: Search, label: 'Below threshold' }
                        }
                      />
                      <MetricTile
                        label="Reports"
                        value={`${selected.reports_observed} / ${selected.reports_expected}`}
                        icon={ListTree}
                        tone={selected.reports_observed === 0 ? 'uncertain' : 'neutral'}
                        help={`Expected over ${windowHours}h`}
                      />
                    </div>

                    <ConfidenceMeter confidence={selected.confidence} label="Evidence confidence" showHint />

                    <div>
                      <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
                        Evidence (weighted contributions)
                      </h3>
                      <ul className="mt-1.5 space-y-2">
                        {selected.evidence
                          .slice()
                          .sort((a, b) => b.contribution - a.contribution)
                          .map(item => (
                            <li key={item.factor} className="border-t border-line pt-2 first:border-t-0 first:pt-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                                  {item.factor.replace(/_/g, ' ')}
                                </span>
                                <span className="flex items-center gap-1.5">
                                  {item.unobserved && (
                                    <Badge tone="uncertain" size="sm">
                                      Unobserved
                                    </Badge>
                                  )}
                                  <span data-metric className="text-[11px] font-bold tabular-nums text-ink">
                                    +{item.contribution.toFixed(1)}
                                  </span>
                                </span>
                              </div>
                              <p className="mt-0.5 text-[11px] text-ink-subtle leading-4">{item.detail}</p>
                              <p className="mt-0.5 text-[10px] text-ink-faint">
                                Weight {item.weight.toFixed(2)} of the priority score
                              </p>
                            </li>
                          ))}
                      </ul>
                    </div>

                    {selected.missing_data.length > 0 && (
                      <div>
                        <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
                          Missing inputs ({selected.missing_data.length})
                        </h3>
                        <ul className="mt-1.5 space-y-1">
                          {selected.missing_data.map(item => (
                            <li key={item} className="text-[11px] text-uncertain leading-4">
                              • {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div>
                      <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
                        Recommended verification
                      </h3>
                      <ul className="mt-1.5 space-y-1.5">
                        {selected.recommended_verification_actions.map(action => (
                          <li
                            key={action}
                            className="flex items-start gap-2 rounded-control border border-uncertain-border bg-uncertain-soft px-2.5 py-2 text-[11px] text-ink leading-4"
                          >
                            <Search className="mt-0.5 h-3 w-3 shrink-0 text-uncertain" aria-hidden="true" />
                            <span>{action}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1.5 text-[10px] text-ink-faint leading-4">
                        Verification prompts only. A coordinator must confirm conditions before any resource moves.
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-ink-subtle">No zone assessment is available for this window.</p>
                )}
              </Card>
            </div>

            <Card
              title="All zones (accessible table)"
              description="The same data as the map, sortable by any column with the keyboard or a screen reader."
              icon={Table2}
              bodyClassName="p-0"
            >
              <div className="px-4 pt-3.5">
                <ZoneTable
                  zones={zones}
                  dataset={dataset}
                  selectedZoneId={selected?.zone_id ?? null}
                  onSelectZone={setSelectedZoneId}
                />
              </div>
            </Card>

            {selected && (
              <Card
                title="Observations from this snapshot"
                description="Deterministic statements produced by the radar, in plain language."
                icon={ListTree}
                bodyClassName="space-y-1.5"
              >
                <ul className="space-y-1.5">
                  {radar?.result.observations.map(observation => (
                    <li key={observation} className="flex items-start gap-1.5 text-xs text-ink-muted leading-5">
                      <CircleAlert className="mt-0.5 h-3 w-3 shrink-0 text-ink-faint" aria-hidden="true" />
                      <span>{observation}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <ModelExplanation request={explanationRequest} />
          </div>
        )}
      </RescueShell>
    </div>
  );
};
