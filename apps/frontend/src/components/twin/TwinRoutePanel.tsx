import React from 'react';
import {
  Ambulance,
  CircleAlert,
  CircleCheckBig,
  GitCompareArrows,
  Milestone,
  Route as RouteIcon,
  ShieldAlert,
  TriangleAlert
} from 'lucide-react';
import {
  compareIds,
  type TwinCity,
  type TwinFloodAssessment,
  type TwinRoute,
  type TwinRouteComparison
} from '@resq-ai/shared';
import { Badge, Button, Card, DiffRow, cx } from '../../ui';

/**
 * Feature 2 — 3D rescue route optimisation.
 *
 * Routes come from Dijkstra over the road graph as the current flood leaves it.
 * Blocked segments are removed *before* the search, so a closed bridge genuinely
 * removes the shortcut instead of being drawn over.
 *
 * ⚠️ SIMULATED: travel times are modelled from synthetic segment times, and a
 * generated route is a proposal for a human — nothing is dispatched.
 */

interface Props {
  city: TwinCity;
  flood: TwinFloodAssessment;
  selectedIncidentId: string;
  selectedUnitId: string;
  onSelectIncident: (incidentId: string) => void;
  onSelectUnit: (unitId: string) => void;
  route: TwinRoute | null;
  baselineRoute: TwinRoute | null;
  comparison: TwinRouteComparison | null;
  /** Edge key the user has chosen to close, before it is applied. */
  closureKey: string;
  onSelectClosure: (edgeKey: string) => void;
  onGenerateRoute: () => void;
  onApplyClosure: () => void;
  onClearClosures: () => void;
  /** Edge keys already removed from the network by the active scenario. */
  activeClosures: string[];
  /** True when no road can be driven in this scenario. */
  allClosed: boolean;
}

function nodeLabel(city: TwinCity, nodeId: string): string {
  return city.graph.nodes.find(node => node.id === nodeId)?.label ?? nodeId;
}

function pathLabel(city: TwinCity, path: readonly string[]): string {
  return path.map(nodeId => nodeLabel(city, nodeId)).join(' → ');
}

export const TwinRoutePanel: React.FC<Props> = ({
  city,
  flood,
  selectedIncidentId,
  selectedUnitId,
  onSelectIncident,
  onSelectUnit,
  route,
  baselineRoute,
  comparison,
  closureKey,
  onSelectClosure,
  onGenerateRoute,
  onApplyClosure,
  onClearClosures,
  activeClosures,
  allClosed
}) => {
  const incidentSelectId = React.useId();
  const unitSelectId = React.useId();
  const closureSelectId = React.useId();

  // Only segments that are currently drivable can be closed by hand — closing
  // something already under water would not change the network.
  const closableRoads = React.useMemo(
    () =>
      flood.roads
        .filter(road => road.accessible)
        .slice()
        .sort((a, b) => compareIds(a.label, b.label)),
    [flood]
  );

  return (
    <Card
      title="Rescue route optimisation"
      description="Pick an emergency and an ambulance, then generate the fastest modelled road route. Close a segment and watch it re-plan."
      icon={RouteIcon}
      tone={comparison?.degraded ? 'warning' : 'accent'}
      bodyClassName="space-y-3.5"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={incidentSelectId} className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
            Emergency incident
          </label>
          <select
            id={incidentSelectId}
            value={selectedIncidentId}
            onChange={event => onSelectIncident(event.target.value)}
            className="mt-1.5 min-h-tap w-full rounded-control border border-line-strong bg-white px-2.5 py-2 text-xs text-ink"
          >
            {city.incidents.map(incident => (
              <option key={incident.id} value={incident.id}>
                {incident.severity} — {incident.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={unitSelectId} className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
            Responding unit
          </label>
          <select
            id={unitSelectId}
            value={selectedUnitId}
            onChange={event => onSelectUnit(event.target.value)}
            className="mt-1.5 min-h-tap w-full rounded-control border border-line-strong bg-white px-2.5 py-2 text-xs text-ink"
          >
            {city.units.map(unit => (
              <option key={unit.id} value={unit.id}>
                {unit.label} — {unit.type === 'AMBULANCE' ? 'Ambulance' : 'Rescue team'} at{' '}
                {nodeLabel(city, unit.home_node)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={RouteIcon} onClick={onGenerateRoute} disabled={allClosed}>
          Generate optimised route
        </Button>
        <Button variant="ghost" icon={Milestone} onClick={onClearClosures} disabled={activeClosures.length === 0}>
          Clear closures
        </Button>
      </div>

      {route && (
        <div className="rounded-card border border-line bg-surface-muted px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-ink">
              {route.unit_label} → {route.incident_title}
            </span>
            {route.reachable ? (
              <Badge
                tone={route.within_sla ? 'success' : 'warning'}
                icon={route.within_sla ? CircleCheckBig : TriangleAlert}
                srPrefix="Route status"
              >
                {route.minutes} min — {route.within_sla ? 'within the 12 min target' : 'beyond the 12 min target'}
              </Badge>
            ) : (
              <Badge tone="critical" icon={ShieldAlert} srPrefix="Route status">
                No road route — unreachable
              </Badge>
            )}
          </div>

          <dl className="mt-2 space-y-1 text-[11px]">
            <div className="flex items-start gap-2">
              <dt className="w-24 shrink-0 font-semibold text-ink-subtle">Modelled path</dt>
              <dd className="text-ink">
                {route.path.length > 1 ? pathLabel(city, route.path) : 'No route exists under the current closures.'}
              </dd>
            </div>
            <div className="flex items-start gap-2">
              <dt className="w-24 shrink-0 font-semibold text-ink-subtle">Dijkstra input</dt>
              <dd data-metric className="text-ink-muted tabular-nums">
                {city.graph.nodes.length} nodes · {city.graph.edges.length} segments ·{' '}
                {route.blocked_edge_keys.length} removed
              </dd>
            </div>
          </dl>

          <h4 className="mt-2 text-[10px] font-bold uppercase tracking-wide text-ink-subtle">
            Why this route
          </h4>
          <ul className="mt-1 space-y-1">
            {route.reasons.map(reason => (
              <li key={reason} className="flex items-start gap-1.5 text-[11px] text-ink-muted leading-4">
                <CircleAlert className="mt-0.5 h-3 w-3 shrink-0 text-ink-faint" aria-hidden="true" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-card border border-line bg-surface-muted px-3 py-2.5">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <label htmlFor={closureSelectId} className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
              Simulate a road closure
            </label>
            <select
              id={closureSelectId}
              value={closureKey}
              onChange={event => onSelectClosure(event.target.value)}
              disabled={closableRoads.length === 0}
              className="mt-1.5 min-h-tap w-full rounded-control border border-line-strong bg-white px-2.5 py-2 text-xs text-ink disabled:opacity-60"
            >
              {closableRoads.length === 0 && <option value="">No segments are currently drivable</option>}
              {closableRoads.map(road => (
                <option key={road.edge_key} value={road.edge_key}>
                  {road.label}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="secondary"
            icon={Milestone}
            disabled={!closureKey || closableRoads.length === 0}
            onClick={onApplyClosure}
          >
            Close segment &amp; recalculate
          </Button>
        </div>

        {activeClosures.length > 0 && (
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-muted leading-4">
            <Badge tone="critical" icon={Milestone} srPrefix="Closed segments">
              {activeClosures.length} closed by scenario
            </Badge>
            <span className="font-mono text-[10px] text-ink-faint">{activeClosures.join(', ')}</span>
          </p>
        )}
      </div>

      {comparison && (
        <div
          className={cx(
            'rounded-card border px-3 py-2.5',
            comparison.degraded ? 'border-warning-border bg-warning-soft' : 'border-accent-border bg-accent-soft'
          )}
        >
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
            <GitCompareArrows className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
            Previous vs recalculated route
          </p>

          <div className="mt-2">
            <DiffRow
              label="Modelled travel time"
              before={baselineRoute?.minutes === null ? 'unreachable' : `${baselineRoute?.minutes ?? '—'} min`}
              after={comparison.updated.minutes === null ? 'unreachable' : `${comparison.updated.minutes} min`}
              direction={
                comparison.delta_minutes === null || comparison.delta_minutes === 0
                  ? null
                  : comparison.delta_minutes < 0
              }
              detail={
                comparison.delta_minutes === null
                  ? undefined
                  : `${comparison.delta_minutes > 0 ? '+' : ''}${comparison.delta_minutes} min`
              }
            />
          </div>

          <p data-testid="twin-route-comparison-summary" className="mt-2 text-xs text-ink leading-5">
            {comparison.summary}
          </p>

          <ul className="mt-1.5 space-y-1">
            {comparison.changes.map(change => (
              <li key={change.label} className="text-[11px] text-ink-muted leading-4">
                <span className="font-semibold text-ink">{change.label}:</span> {change.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      {allClosed && (
        <p role="alert" className="flex items-start gap-2 rounded-card border border-critical-border bg-critical-soft px-3 py-2.5 text-[11px] text-ink">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-critical" aria-hidden="true" />
          <span>Every modelled segment is impassable at this water level, so no road route can be planned.</span>
        </p>
      )}

      <p className="flex items-start gap-1.5 text-[11px] text-ink-subtle leading-4">
        <Ambulance className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
        <span>
          Generating a route changes nothing outside this exercise. A coordinator still has to approve any movement.
        </span>
      </p>
    </Card>
  );
};
