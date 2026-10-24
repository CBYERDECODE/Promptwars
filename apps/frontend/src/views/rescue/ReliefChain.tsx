import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Boxes,
  CircleCheckBig,
  CircleMinus,
  CircleX,
  ClipboardCheck,
  Droplets,
  EyeOff,
  Gauge,
  HeartPulse,
  Home,
  Lock,
  PencilLine,
  Route,
  ShieldAlert,
  SlidersHorizontal,
  TriangleAlert,
  Truck,
  Users,
  Utensils,
  Warehouse
} from 'lucide-react';
import {
  MILL_BRIDGE_EDGE_KEY,
  SIMULATED_DEPOTS,
  SUPPLY_PARAMETERS,
  getSimulatedDataset,
  type CommodityId,
  type NeedBasis,
  type Shipment,
  type SimulationDataset,
  type SupplyPlanDetail,
  type SupplyScenario,
  type UnmetRequirement
} from '@resq-ai/shared';
import {
  ApiError,
  ChainDecision,
  ChainDecisionRecord,
  ChainPlanResponse,
  postChainDecision,
  postChainPlan
} from '../../api/client';
import { useOnlineStatus } from '../../hooks/useRescueData';
import {
  Badge,
  Button,
  Card,
  Dialog,
  MetricTile,
  Tone,
  calloutClasses,
  cx,
  useToast
} from '../../ui';
import { RescueShell } from './RescueShell';

/**
 * ReliefChain — Tier 3 (Chain): relief supply distribution.
 *
 * WHAT THIS VIEW MAY AND MAY NOT SAY
 * ----------------------------------
 *  - Stock is deliberately scarce in the exercise, so the *order* in which
 *    demand is served IS the fairness rule, and it is shown explicitly rather
 *    than buried in a total.
 *  - A zone that produced no reports is treated as a data gap, never as safe.
 *    Its requirement is a population-based estimate, served last, and the plan
 *    states out loud that this under-serves it.
 *  - Nothing is dispatched here. The proposal only becomes an action once a
 *    human records a decision, which is written to the audit trail.
 *
 * Every figure below comes from the deterministic engine; this view only
 * presents it and asks a coordinator to own the choice.
 */

const COMMODITY_ICON: Record<CommodityId, LucideIcon> = {
  WATER: Droplets,
  FOOD: Utensils,
  MEDICAL_KIT: HeartPulse,
  SHELTER_KIT: Home
};

const BASIS_META: Record<NeedBasis, { tone: Tone; icon: LucideIcon; label: string }> = {
  REPORTED: { tone: 'accent', icon: ClipboardCheck, label: 'Reported need' },
  DATA_GAP_ESTIMATE: { tone: 'uncertain', icon: EyeOff, label: 'Data-gap estimate' }
};

/** Deterministic signature of the proposal a coordinator is reviewing. */
function chainSignature(plan: SupplyPlanDetail): string {
  return plan.shipments
    .map(shipment => `${shipment.depot_id}->${shipment.zone_id}|${shipment.commodity_id}:${shipment.quantity}`)
    .slice()
    .sort()
    .join('; ');
}

function nodeLabel(dataset: SimulationDataset, nodeId: string): string {
  return dataset.graph.nodes.find(node => node.id === nodeId)?.label ?? nodeId;
}

/** Renders a route as real place names, so it stays readable without the map. */
function routeLabel(dataset: SimulationDataset, route: string[]): string {
  return route.map(nodeId => nodeLabel(dataset, nodeId)).join(' → ');
}

/* ------------------------------------------------------------------ */
/* Human decision                                                      */
/* ------------------------------------------------------------------ */

const DECISIONS: Array<{ id: ChainDecision; label: string; icon: LucideIcon; tone: Tone }> = [
  { id: 'APPROVED', label: 'Approve', icon: CircleCheckBig, tone: 'success' },
  { id: 'REJECTED', label: 'Reject', icon: CircleX, tone: 'critical' },
  { id: 'MODIFIED', label: 'Modify', icon: PencilLine, tone: 'warning' }
];

const DECISION_LABEL: Record<ChainDecision, string> = {
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  MODIFIED: 'Marked for modification'
};

/**
 * FNV-1a over the decision payload, bounded to 32 bits so the idempotency key
 * stays well inside the server's 128-character limit while still changing
 * whenever the coordinator's intent changes.
 */
function decisionKey(signature: string, decision: string, note: string): string {
  const input = `${signature}|${decision}|${note}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `resq-chain-${hash.toString(16).padStart(8, '0')}`;
}

const ChainDecisionPanel: React.FC<{ planSignature: string; activeConstraints: string[] }> = ({
  planSignature,
  activeConstraints
}) => {
  const toast = useToast();
  const [decision, setDecision] = React.useState<ChainDecision | null>(null);
  const [note, setNote] = React.useState('');
  const [adminToken, setAdminToken] = React.useState('');
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [record, setRecord] = React.useState<ChainDecisionRecord | null>(null);

  // A different proposal invalidates any decision captured against the old one.
  React.useEffect(() => {
    setDecision(null);
    setNote('');
    setError(null);
    setRecord(null);
  }, [planSignature]);

  const trimmedNote = note.trim();
  const canSubmit = decision !== null && trimmedNote.length >= 3 && !submitting;

  const submit = async () => {
    if (decision === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await postChainDecision(
        {
          decision,
          coordinator_note: trimmedNote,
          plan_signature: planSignature,
          active_constraints: activeConstraints
        },
        decisionKey(planSignature, decision, trimmedNote),
        adminToken.trim() || undefined
      );
      setRecord(response);
      setConfirmOpen(false);
      toast.push({
        tone: response.replayed ? 'neutral' : 'success',
        title: response.replayed ? 'Decision already recorded' : `${DECISION_LABEL[response.decision]} recorded`,
        description: response.replayed
          ? 'An identical decision already exists in the audit trail, so no second entry was written.'
          : `Audit entry ${response.log_entry_id} written at ${new Date(response.recorded_at).toLocaleTimeString()}.`
      });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.code === 'UNAUTHORIZED' || err.status === 401 || err.status === 403
            ? 'The server rejected this decision: coordinator authorization is required. Add the coordinator token below and try again.'
            : err.message
          : 'The decision could not be recorded. Nothing was written to the audit trail.';
      setError(message);
      setConfirmOpen(false);
      toast.push({ tone: 'critical', title: 'Decision not recorded', description: message });
    } finally {
      setSubmitting(false);
    }
  };

  const activeMeta = DECISIONS.find(item => item.id === decision);

  return (
    <Card
      title="Coordinator decision"
      description="ResQ AI never dispatches a shipment. This step records the human decision that owns the distribution proposal."
      icon={ClipboardCheck}
      tone={record ? 'success' : 'accent'}
      bodyClassName="space-y-3"
    >
      <fieldset>
        <legend className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">Decision</legend>
        <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Distribution decision">
          {DECISIONS.map(item => {
            const isActive = decision === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => setDecision(item.id)}
                className={cx(
                  'flex min-h-tap items-center justify-center gap-2 rounded-control border px-3 py-2 text-xs font-semibold transition duration-fast',
                  isActive
                    ? 'border-accent bg-accent-soft text-accent-strong'
                    : 'border-line-strong bg-white text-ink-muted hover:bg-surface-sunken'
                )}
              >
                <item.icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor="chain-note" className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
          Coordinator note (required)
        </label>
        <textarea
          id="chain-note"
          value={note}
          onChange={event => setNote(event.target.value)}
          maxLength={500}
          rows={3}
          aria-describedby="chain-note-help"
          placeholder="Why did you accept, reject or change this distribution?"
          className="mt-1.5 w-full rounded-control border border-line-strong bg-white px-3 py-2 text-xs text-ink placeholder:text-ink-faint"
        />
        <div id="chain-note-help" className="mt-1 flex items-center justify-between gap-2">
          <span className="text-[11px] text-ink-subtle">
            {trimmedNote.length < 3 ? 'At least 3 characters are required.' : 'Recorded verbatim in the audit log.'}
          </span>
          <span data-metric className="text-[11px] tabular-nums text-ink-subtle">
            {trimmedNote.length}/500
          </span>
        </div>
      </div>

      <details className="rounded-card border border-line bg-surface-muted px-3 py-2">
        <summary className="flex cursor-pointer items-center gap-2 text-[11px] font-semibold text-ink-muted">
          <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
          Coordinator authorization (only needed when the server enforces it)
        </summary>
        <label htmlFor="chain-admin-token" className="mt-2 block text-[11px] font-semibold text-ink-subtle">
          Coordinator token
        </label>
        <input
          id="chain-admin-token"
          type="password"
          autoComplete="off"
          value={adminToken}
          onChange={event => setAdminToken(event.target.value)}
          className="mt-1 w-full rounded-control border border-line-strong bg-white px-3 py-2 text-xs text-ink"
        />
        <p className="mt-1 text-[11px] text-ink-subtle">
          Sent as the <code className="font-mono">X-Admin-Token</code> header. It is never stored in the browser or in
          client code.
        </p>
      </details>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-card border border-critical-border bg-critical-soft px-3 py-2.5 text-[11px] text-ink">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-critical" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={ClipboardCheck} disabled={!canSubmit} onClick={() => setConfirmOpen(true)}>
          Review and record decision
        </Button>
        {activeMeta && (
          <Badge tone={activeMeta.tone} icon={activeMeta.icon}>
            {activeMeta.label} selected
          </Badge>
        )}
      </div>

      {record && (
        <div role="status" className="rounded-card border border-success-border bg-success-soft px-3 py-2.5">
          <p className="text-xs font-semibold text-ink">
            {DECISION_LABEL[record.decision]} — written to the audit trail
          </p>
          <p className="mt-1 text-[11px] text-ink-muted leading-4">
            Recorded at {new Date(record.recorded_at).toLocaleString()} as entry{' '}
            <span className="font-mono">{record.log_entry_id}</span>. {record.notice}
          </p>
          {record.replayed && (
            <p className="mt-1 text-[11px] text-ink-muted leading-4">
              This response was replayed from the server cache, so no duplicate audit entry exists.
            </p>
          )}
        </div>
      )}

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Confirm ${decision ? DECISION_LABEL[decision].toLowerCase() : 'decision'}`}
        description="This writes a permanent entry to the audit trail. It cannot be edited afterwards."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="primary" icon={ClipboardCheck} loading={submitting} loadingLabel="Recording decision" onClick={() => void submit()}>
              Record decision
            </Button>
          </>
        }
      >
        <dl className="space-y-2 text-xs">
          <div className="flex flex-wrap items-baseline gap-2">
            <dt className="font-semibold text-ink-subtle">Proposal</dt>
            <dd className="text-ink">Relief supply distribution</dd>
          </div>
          <div className="flex flex-wrap items-baseline gap-2">
            <dt className="font-semibold text-ink-subtle">Decision</dt>
            <dd>
              {activeMeta && (
                <Badge tone={activeMeta.tone} icon={activeMeta.icon} size="md">
                  {activeMeta.label}
                </Badge>
              )}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink-subtle">Note</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-ink-muted">{trimmedNote}</dd>
          </div>
          {activeConstraints.length > 0 && (
            <div>
              <dt className="font-semibold text-ink-subtle">Constraints in force</dt>
              <dd className="mt-0.5 text-ink-muted">{activeConstraints.join(' ')}</dd>
            </div>
          )}
          <div>
            <dt className="font-semibold text-ink-subtle">Proposal signature</dt>
            <dd className="mt-0.5 break-words font-mono text-[11px] text-ink-muted">
              {planSignature || 'no shipments'}
            </dd>
          </div>
        </dl>
      </Dialog>
    </Card>
  );
};

/* ------------------------------------------------------------------ */
/* View                                                                */
/* ------------------------------------------------------------------ */

export const ReliefChain: React.FC = () => {
  const online = useOnlineStatus();
  const dataset = React.useMemo(() => getSimulatedDataset(), []);

  const [blockedBridge, setBlockedBridge] = React.useState(false);
  const [unavailableDepots, setUnavailableDepots] = React.useState<string[]>([]);
  const [horizonDays, setHorizonDays] = React.useState<number>(SUPPLY_PARAMETERS.planningHorizonDays);

  const scenario: SupplyScenario = React.useMemo(
    () => ({
      blocked_edge_keys: blockedBridge ? [MILL_BRIDGE_EDGE_KEY] : [],
      unavailable_depot_ids: unavailableDepots,
      planning_horizon_days: horizonDays
    }),
    [blockedBridge, unavailableDepots, horizonDays]
  );

  const [response, setResponse] = React.useState<ChainPlanResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResponse(await postChainPlan({ scenario }));
    } catch (err) {
      setError(err instanceof Error ? err : new Error('The distribution proposal could not be computed.'));
    } finally {
      setLoading(false);
    }
  }, [scenario]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const plan = response?.result ?? null;

  const toggleDepot = (depotId: string) => {
    setUnavailableDepots(current =>
      current.includes(depotId) ? current.filter(id => id !== depotId) : [...current, depotId]
    );
  };

  const signature = plan ? chainSignature(plan) : '';

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-lg font-bold text-ink">
          <Truck className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
          ReliefChain
        </h1>
        <p className="mt-1 max-w-3xl text-xs text-ink-muted leading-5">
          A deterministic distribution plan for the simulated relief depots. Stock is deliberately scarce, so the order
          in which zones are served — and who is left short — is the whole point of this view.
        </p>
      </header>

      <RescueShell
        notice={response?.notice}
        loading={loading}
        loadingLabel="Computing the simulated distribution proposal"
        error={error}
        onRetry={load}
        offline={!online}
      >
        {plan && (
          <div className="space-y-4">
            <div className={cx(calloutClasses('accent'), 'text-xs text-ink-muted leading-5')}>{response?.framing}</div>

            <Card
              title="Scenario toggles"
              description="Change the modelled conditions and the proposal is recomputed from scratch."
              icon={SlidersHorizontal}
              bodyClassName="space-y-3"
            >
              <div className="flex items-start gap-3 rounded-control border border-line bg-surface-muted px-3 py-2.5">
                <input
                  id="chain-bridge"
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-line-strong text-accent focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent"
                  checked={blockedBridge}
                  onChange={event => setBlockedBridge(event.target.checked)}
                />
                <label className="text-xs text-ink leading-5" htmlFor="chain-bridge">
                  Close the Mill Bridge
                  <span className="block text-ink-subtle">
                    The only link from the west bank. Closing it strands West Depot, Riverside Flats and Cedar Hollow.
                  </span>
                </label>
              </div>

              <fieldset>
                <legend className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
                  Depot availability
                </legend>
                <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {SIMULATED_DEPOTS.map(depot => {
                    const unavailable = unavailableDepots.includes(depot.id);
                    return (
                      <label
                        key={depot.id}
                        className={cx(
                          'flex min-h-tap cursor-pointer items-center gap-2 rounded-control border px-3 py-2 text-xs font-semibold',
                          unavailable
                            ? 'border-critical-border bg-critical-soft text-ink'
                            : 'border-line-strong bg-white text-ink-muted'
                        )}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 rounded border-line-strong text-accent"
                          checked={unavailable}
                          onChange={() => toggleDepot(depot.id)}
                        />
                        <Warehouse className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>
                          {depot.label}
                          <span className="block text-[10px] font-normal text-ink-subtle">
                            {unavailable ? 'Unavailable' : 'Available'}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs font-semibold text-ink-muted" htmlFor="chain-horizon">
                  Planning horizon (days)
                </label>
                <input
                  id="chain-horizon"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={SUPPLY_PARAMETERS.maxPlanningHorizonDays}
                  value={horizonDays}
                  onChange={event => setHorizonDays(Number(event.target.value) || 1)}
                  className="w-20 rounded-control border border-line-strong bg-white px-2 py-1.5 text-sm text-ink tabular-nums"
                />
                <span className="text-[11px] text-ink-subtle">
                  Days of relief a single distribution round is planned to cover.
                </span>
              </div>
            </Card>

            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
              <MetricTile
                label="Requirement covered"
                value={plan.metrics.fulfilment_pct}
                unit="%"
                icon={Gauge}
                tone={plan.metrics.fulfilment_pct >= 80 ? 'success' : plan.metrics.fulfilment_pct >= 50 ? 'warning' : 'critical'}
                help="Share of every demand line served"
              />
              <MetricTile
                label="Shipments"
                value={plan.metrics.shipments}
                icon={Truck}
                tone="accent"
                help="Depot → zone drops in the proposal"
              />
              <MetricTile
                label="Zones reached"
                value={plan.metrics.zones_reached}
                icon={Users}
                tone="neutral"
              />
              <MetricTile
                label="Zones isolated"
                value={plan.metrics.zones_isolated}
                icon={Route}
                tone={plan.metrics.zones_isolated > 0 ? 'critical' : 'success'}
                status={
                  plan.metrics.zones_isolated > 0
                    ? { tone: 'critical', icon: TriangleAlert, label: 'Nothing reaches them' }
                    : { tone: 'success', icon: CircleCheckBig, label: 'All reachable' }
                }
              />
              <MetricTile
                label="Unmet lines"
                value={plan.metrics.unmet_lines}
                icon={ShieldAlert}
                tone={plan.metrics.unmet_lines > 0 ? 'warning' : 'success'}
                help={`${plan.metrics.partially_met_lines} partly served`}
              />
            </div>

            <Card
              title="Who this plan leaves short"
              description="Stated in plain language. Confirmed reported need is served first; a data gap is served last."
              icon={EyeOff}
              tone="uncertain"
              accentRail
            >
              <p data-testid="chain-disadvantaged" className="text-xs text-ink-muted leading-5">
                {plan.disadvantaged_summary}
              </p>
              <ul className="mt-3 space-y-1.5">
                {plan.active_constraints.map(constraint => (
                  <li key={constraint} className="flex items-start gap-1.5 text-[11px] text-ink-muted leading-4">
                    <CircleMinus className="mt-0.5 h-3 w-3 shrink-0 text-ink-faint" aria-hidden="true" />
                    <span>{constraint}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card
              title="Commodity position"
              description="What was planned, what the depots could actually supply, and what is left over."
              icon={Boxes}
              bodyClassName="p-0"
            >
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <caption className="sr-only">
                    Planned requirement, allocated stock and shortfall for each relief commodity
                  </caption>
                  <thead>
                    <tr className="border-b border-line bg-surface-muted">
                      {['Commodity', 'Required', 'Allocated', 'Shortfall', 'Covered'].map(column => (
                        <th
                          key={column}
                          scope="col"
                          className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-ink-subtle whitespace-nowrap"
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {plan.commodity_summary.map(row => {
                      const Icon = COMMODITY_ICON[row.commodity_id];
                      return (
                        <tr key={row.commodity_id} className="border-b border-line last:border-b-0">
                          <th scope="row" className="px-3 py-2.5">
                            <span className="flex items-center gap-2 text-xs font-semibold text-ink">
                              <Icon className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                              {row.label}
                            </span>
                            <span className="mt-0.5 block text-[10px] text-ink-faint">{row.unit}</span>
                          </th>
                          <td data-metric className="px-3 py-2.5 text-xs font-semibold tabular-nums text-ink">
                            {row.required}
                          </td>
                          <td data-metric className="px-3 py-2.5 text-xs font-semibold tabular-nums text-ink">
                            {row.allocated}
                          </td>
                          <td
                            data-metric
                            className={cx(
                              'px-3 py-2.5 text-xs font-semibold tabular-nums',
                              row.shortfall > 0 ? 'text-critical' : 'text-success'
                            )}
                          >
                            {row.shortfall}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-sunken">
                                <span
                                  className={cx(
                                    'block h-full rounded-full',
                                    row.fulfilment_pct >= 80
                                      ? 'bg-success'
                                      : row.fulfilment_pct >= 50
                                        ? 'bg-warning'
                                        : 'bg-critical'
                                  )}
                                  style={{ width: `${Math.min(100, row.fulfilment_pct)}%` }}
                                />
                              </span>
                              <span data-metric className="text-[11px] font-semibold tabular-nums text-ink-muted">
                                {row.fulfilment_pct}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card
              title={`Distribution proposal (${plan.shipments.length})`}
              description="Each drop names the depot it leaves from, the route it takes and why it was served in that order."
              icon={Truck}
              bodyClassName={plan.shipments.length === 0 ? undefined : 'p-0'}
            >
              {plan.shipments.length === 0 ? (
                <p className="rounded-card border border-dashed border-line-strong bg-surface-muted px-3 py-4 text-center text-xs text-ink-subtle">
                  No depot can make a shipment under this scenario.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <caption className="sr-only">
                      Depot to zone shipments, with the commodity, quantity, modelled travel time and the reason
                    </caption>
                    <thead>
                      <tr className="border-b border-line bg-surface-muted">
                        {['From', 'To', 'Commodity', 'Quantity', 'Travel', 'Why'].map(column => (
                          <th
                            key={column}
                            scope="col"
                            className="px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-ink-subtle whitespace-nowrap"
                          >
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {plan.shipments.map((shipment, index) => (
                        <ShipmentRow
                          key={`${shipment.depot_id}-${shipment.zone_id}-${shipment.commodity_id}-${index}`}
                          shipment={shipment}
                          dataset={dataset}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card
              title={`Unmet need (${plan.unmet.length})`}
              description="Every requirement the depots could not cover, and the reason on each."
              icon={TriangleAlert}
              tone={plan.unmet.length > 0 ? 'warning' : 'success'}
            >
              {plan.unmet.length === 0 ? (
                <p className="flex items-center gap-2 rounded-card border border-success-border bg-success-soft px-3 py-2.5 text-xs font-semibold text-ink">
                  <CircleCheckBig className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
                  Every modelled requirement is fully covered.
                </p>
              ) : (
                <ul className="space-y-2">
                  {plan.unmet.map(row => (
                    <UnmetRow key={`${row.zone_id}-${row.commodity_id}`} row={row} />
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Who is counted, and how" description="Exposure is derived from the dataset; silence is a data gap, never safety." icon={Users} bodyClassName="p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <caption className="sr-only">Population, reported people and the planning basis for each zone</caption>
                  <thead>
                    <tr className="border-b border-line bg-surface-muted">
                      {['Zone', 'Population', 'Reported', 'Planned for', 'Basis'].map(column => (
                        <th
                          key={column}
                          scope="col"
                          className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-ink-subtle whitespace-nowrap"
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {plan.exposure.map(zone => {
                      const meta = BASIS_META[zone.basis];
                      return (
                        <tr key={zone.zone_id} className="border-b border-line last:border-b-0 align-top">
                          <th scope="row" className="px-3 py-2.5 text-xs font-semibold text-ink">
                            {zone.zone_name}
                            <span className="mt-0.5 block max-w-[22rem] text-[10px] font-normal text-ink-subtle leading-4">
                              {zone.detail}
                            </span>
                          </th>
                          <td data-metric className="px-3 py-2.5 text-xs tabular-nums text-ink-muted">
                            {zone.population}
                          </td>
                          <td data-metric className="px-3 py-2.5 text-xs tabular-nums text-ink-muted">
                            {zone.reported_people}
                          </td>
                          <td data-metric className="px-3 py-2.5 text-xs font-semibold tabular-nums text-ink">
                            {zone.planned_people}
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge tone={meta.tone} icon={meta.icon} srPrefix="Need basis">
                              {meta.label}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <ChainDecisionPanel planSignature={signature} activeConstraints={plan.active_constraints} />

              <Card
                title="How this proposal is produced"
                description="Parameters are shown so the plan can be audited."
                icon={Route}
                tone="neutral"
              >
                <dl className="space-y-1.5 text-[11px]">
                  {response &&
                    Object.entries(response.parameters).map(([key, value]) => (
                      <div key={key} className="flex items-baseline justify-between gap-2">
                        <dt className="text-ink-subtle">{key.replace(/([A-Z])/g, ' $1').toLowerCase()}</dt>
                        <dd data-metric className="font-semibold tabular-nums text-ink">
                          {value}
                        </dd>
                      </div>
                    ))}
                </dl>
                <p className="mt-2 flex items-start gap-1.5 text-[11px] text-ink-subtle leading-4">
                  <CircleMinus className="mt-0.5 h-3 w-3 shrink-0 text-ink-faint" aria-hidden="true" />
                  <span>
                    Demand is derived with fixed arithmetic, then served in a single pass over a fully ordered list.
                    Ties break deterministically, so the same scenario always yields the same plan.
                  </span>
                </p>
              </Card>
            </div>

            <p className="text-[11px] text-ink-faint leading-5">
              Planning horizon: {plan.planning_horizon_days} day(s). {plan.total_incidents} simulated incidents feed this
              proposal, and {plan.metrics.estimated_need_lines} demand line(s) rest on a data-gap estimate rather than a
              report — so the real shortfall is probably larger than this plan can show.
            </p>
          </div>
        )}
      </RescueShell>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

const ShipmentRow: React.FC<{ shipment: Shipment; dataset: SimulationDataset }> = ({ shipment, dataset }) => {
  const Icon = COMMODITY_ICON[shipment.commodity_id];
  return (
    <tr className="border-b border-line last:border-b-0 align-top">
      <td className="px-2 py-2 text-xs font-semibold text-ink whitespace-nowrap">{shipment.depot_label}</td>
      <td className="px-2 py-2 text-xs text-ink-muted min-w-[9rem]">
        <span className="flex flex-wrap items-center gap-1.5">
          <ArrowRight className="h-3 w-3 shrink-0 text-ink-faint" aria-hidden="true" />
          {shipment.zone_name}
          {shipment.estimated && (
            <Badge tone="uncertain" icon={EyeOff}>
              Estimated
            </Badge>
          )}
        </span>
      </td>
      <td className="px-2 py-2 whitespace-nowrap">
        <span className="flex items-center gap-1.5 text-xs text-ink">
          <Icon className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
          {shipment.commodity_label}
        </span>
      </td>
      <td data-metric className="px-2 py-2 text-xs font-semibold tabular-nums text-ink whitespace-nowrap">
        {shipment.quantity} <span className="font-normal text-ink-subtle">{shipment.unit}</span>
      </td>
      <td data-metric className="px-2 py-2 text-xs tabular-nums text-ink-muted whitespace-nowrap">
        {shipment.travel_minutes} min
      </td>
      <td className="px-2 py-2 min-w-[16rem]">
        <details className="group">
          <summary className="cursor-pointer list-none text-[11px] font-semibold text-accent underline-offset-2 hover:underline">
            Route and reason
          </summary>
          <p className="mt-1.5 text-[11px] text-ink-subtle leading-4">{routeLabel(dataset, shipment.route)}</p>
          <ul className="mt-1.5 space-y-1">
            {shipment.reasons.map(reason => (
              <li key={reason} className="text-[11px] text-ink-muted leading-4">
                • {reason}
              </li>
            ))}
          </ul>
        </details>
      </td>
    </tr>
  );
};

const UnmetRow: React.FC<{ row: UnmetRequirement }> = ({ row }) => {
  const meta = BASIS_META[row.basis];
  return (
    <li
      className={cx(
        'rounded-card border px-3 py-2.5',
        row.basis === 'DATA_GAP_ESTIMATE' ? 'border-uncertain-border bg-uncertain-soft' : 'border-warning-border bg-warning-soft'
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-ink">{row.zone_name}</span>
        <Badge tone={meta.tone} icon={meta.icon} srPrefix="Need basis">
          {meta.label}
        </Badge>
        <span data-metric className="text-[11px] font-semibold tabular-nums text-critical">
          {row.allocated} / {row.required} {row.unit}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-ink-muted leading-4">{row.reason}</p>
    </li>
  );
};
