import { Building2, Construction, Droplets, Navigation, Pause, Play, Plane, RotateCcw, Route as RouteIcon, ShieldAlert, ShieldCheck, Waves } from 'lucide-react';
import { Badge, Button, MetricTile, cx } from '../../ui';
import { ROAD_RULES } from './sim/flood';
import type { DronePlan, DroneStats } from './sim/drone';
import { DRONE_WEIGHTS } from './sim/drone';
import { AmbulanceOption, compareRoutes, explainRoute, formatKm, formatMinutes, Route, routeStreetNames, travelTimesFrom } from './sim/routing';
import type { Assignment } from './sim/dispatch';
import type { SimState } from './sim/scenario';
import type { Building } from './sim/types';
import { FLOOR_COLORS, floorRisks } from './mapData';

const label = 'text-[11px] font-semibold uppercase tracking-wide text-ink-muted';

export function FloodPanel({ state, waterLevel, onWaterLevel, disabled }: { state: SimState; waterLevel: number; onWaterLevel: (v: number) => void; disabled?: boolean }) {
  const { flood } = state;
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="twin-water" className={cx(label, 'flex justify-between')}>
          <span>Water level above river datum</span>
          <span className="text-ink tabular-nums">{waterLevel.toFixed(1)} m</span>
        </label>
        <input
          id="twin-water"
          type="range"
          min={0}
          max={5}
          step={0.1}
          value={waterLevel}
          disabled={disabled}
          onChange={e => onWaterLevel(Number(e.target.value))}
          className="mt-2 w-full accent-blue-600"
          aria-valuetext={`${waterLevel.toFixed(1)} metres`}
        />
        <div className="flex justify-between text-[10px] text-ink-subtle"><span>0 m</span><span>2.5 m</span><span>5 m</span></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MetricTile label="Exposed buildings" value={flood.exposedBuildings} icon={Building2} tone={flood.exposedBuildings ? 'critical' : 'success'} help={`${flood.atRiskBuildings} more within 0.5 m`} />
        <MetricTile label="People exposed" value={`~${flood.occupantsExposed}`} icon={ShieldAlert} tone={flood.occupantsExposed ? 'warning' : 'success'} help="synthetic estimate" />
        <MetricTile label="Roads closed" value={state.closedEdges.length} icon={Construction} tone={state.closedEdges.length ? 'critical' : 'success'} help={`${state.cautionEdges.length} caution`} />
        <MetricTile label="Flooded area" value={flood.floodedAreaKm2.toFixed(2)} unit="km²" icon={Waves} tone="accent" help={`${state.closedBridges.length} bridge(s) shut`} />
      </div>
      <details className="rounded-md border border-line bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
        <summary className="cursor-pointer font-semibold text-ink">Explicit simulation rules</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>Water spreads only to cells hydrologically connected to the river (bathtub flood-fill on synthetic terrain).</li>
          <li>Road depth ≥ {ROAD_RULES.closedDepthM} m → <strong>closed</strong>; any depth below that → <strong>caution</strong> at {ROAD_RULES.cautionSpeedFactor * 100}% speed.</li>
          <li>Each bridge closes at its own deck threshold, or when marked inaccessible.</li>
          <li>Building exposure = flood depth at its footprint; floors affected = depth ÷ floor height.</li>
        </ul>
      </details>
    </div>
  );
}

function RouteSummary({ route, title, tone }: { route: Route; title: string; tone: 'accent' | 'neutral' }) {
  return (
    <div className={cx('rounded-md border px-3 py-2 text-xs', tone === 'accent' ? 'border-blue-200 bg-blue-50' : 'border-line bg-surface-sunken')}>
      <p className="font-semibold text-ink">{title}</p>
      {route.found ? (
        <p className="mt-0.5 text-ink-muted">
          <span className="font-semibold text-ink tabular-nums">{formatMinutes(route.timeS)}</span> · {formatKm(route.distanceM)} · {route.nodeIds.length} intersections
        </p>
      ) : (
        <p className="mt-0.5 font-semibold text-red-700">No passable route</p>
      )}
    </div>
  );
}

export interface RoutePanelProps {
  state: SimState;
  incidentId: string | null;
  ambulanceId: string | null;
  ranking: AmbulanceOption[];
  route: Route | null;
  previousRoute: Route | null;
  closureMode: boolean;
  millBridgeClosed: boolean;
  onIncident: (id: string) => void;
  onAmbulance: (id: string) => void;
  onGenerate: () => void;
  onToggleClosureMode: () => void;
  onToggleBridge: () => void;
  onClearClosures: () => void;
}

export function RoutePanel(p: RoutePanelProps) {
  const { state } = p;
  const cmp = p.route && p.previousRoute && p.route.found && p.previousRoute.found ? compareRoutes(state.city, p.previousRoute, p.route) : null;
  const manualCount = state.inputs.manualEdgeIds.length + state.inputs.manualBridgeIds.length;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs">
          <span className={label}>Incident</span>
          <select className="mt-1 w-full rounded-md border border-line-strong bg-white px-2 py-1.5 text-sm" value={p.incidentId ?? ''} onChange={e => p.onIncident(e.target.value)}>
            <option value="" disabled>Select…</option>
            {state.activeIncidents.map(i => <option key={i.id} value={i.id}>{`${i.label} · ${i.title}`}</option>)}
          </select>
        </label>
        <label className="text-xs">
          <span className={label}>Ambulance</span>
          <select className="mt-1 w-full rounded-md border border-line-strong bg-white px-2 py-1.5 text-sm" value={p.ambulanceId ?? ''} onChange={e => p.onAmbulance(e.target.value)}>
            <option value="" disabled>Select…</option>
            {p.ranking.map(o => (
              <option key={o.ambulance.id} value={o.ambulance.id}>
                {`${o.ambulance.callSign} · ${o.route.found ? formatMinutes(o.route.timeS) : 'no route'}`}
              </option>
            ))}
            {state.city.ambulances.filter(a => a.status !== 'available').map(a => <option key={a.id} value={a.id} disabled>{`${a.callSign} · unavailable`}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" icon={RouteIcon} onClick={p.onGenerate} disabled={!p.incidentId || !p.ambulanceId}>Generate optimised route</Button>
        <Button size="sm" variant={p.millBridgeClosed ? 'danger' : 'secondary'} icon={Construction} onClick={p.onToggleBridge} aria-pressed={p.millBridgeClosed}>
          {p.millBridgeClosed ? 'Reopen Mill Bridge' : 'Close Mill Bridge'}
        </Button>
        <Button size="sm" variant={p.closureMode ? 'primary' : 'secondary'} onClick={p.onToggleClosureMode} aria-pressed={p.closureMode}>
          {p.closureMode ? 'Click roads to close… (done)' : 'Close a road on map'}
        </Button>
        {manualCount ? <Button size="sm" variant="ghost" icon={RotateCcw} onClick={p.onClearClosures}>Clear {manualCount} closure(s)</Button> : null}
      </div>
      {p.route ? (
        <div className="space-y-2">
          <div className={cx('grid gap-2', p.previousRoute ? 'grid-cols-2' : 'grid-cols-1')}>
            {p.previousRoute ? <RouteSummary route={p.previousRoute} title="Previous route (dashed)" tone="neutral" /> : null}
            <RouteSummary route={p.route} title={p.previousRoute ? 'Updated route (blue)' : 'Optimised route (blue)'} tone="accent" />
          </div>
          {cmp ? (
            <p className="text-xs text-ink-muted" data-testid="route-compare">
              Change: <strong className={cmp.deltaTimeS > 0 ? 'text-red-700' : 'text-green-700'}>{cmp.deltaTimeS >= 0 ? '+' : '−'}{formatMinutes(Math.abs(cmp.deltaTimeS))}</strong>, {cmp.deltaDistanceM >= 0 ? '+' : '−'}{formatKm(Math.abs(cmp.deltaDistanceM))}
              {cmp.removedStreets.length ? <> · avoids {cmp.removedStreets.join(', ')}</> : null}
              {cmp.addedStreets.length ? <> · now uses {cmp.addedStreets.join(', ')}</> : null}
            </p>
          ) : null}
          {p.route.found ? (
            <div className="rounded-md border border-line px-3 py-2 text-xs">
              <p className="font-semibold text-ink">Why this route (A* on the road graph)</p>
              <p className="mt-1 text-ink-muted">Via {routeStreetNames(state.city, p.route).join(' → ')}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-ink-muted">
                {explainRoute(state.city, state.roads, p.route).map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-ink-muted">Pick an incident (or click a red marker) and an ambulance. The list is ranked by simulated travel time under current flood conditions.</p>
      )}
    </div>
  );
}

export interface DronePanelProps {
  plan: DronePlan | null;
  stats: DroneStats | null;
  running: boolean;
  follow: boolean;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onFollow: (v: boolean) => void;
}

export function DronePanel(p: DronePanelProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-muted">Virtual reconnaissance only — this simulation does not connect to or control any real aircraft.</p>
      <div className="flex flex-wrap gap-2">
        {p.running ? (
          <Button size="sm" variant="secondary" icon={Pause} onClick={p.onPause}>Pause mission</Button>
        ) : (
          <Button size="sm" variant="primary" icon={p.plan ? Play : Plane} onClick={p.onStart}>{p.plan && p.stats && p.stats.remainingM > 0 && p.stats.distanceFlownM > 0 ? 'Resume mission' : 'Start mission'}</Button>
        )}
        <Button size="sm" variant="ghost" icon={RotateCcw} onClick={p.onReset} disabled={!p.plan}>Reset</Button>
        <label className="flex items-center gap-2 text-xs font-medium text-ink">
          <input type="checkbox" checked={p.follow} onChange={e => p.onFollow(e.target.checked)} className="accent-blue-600" /> Camera follow
        </label>
      </div>
      {p.stats && p.plan ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <MetricTile label="Points inspected" value={`${p.stats.inspectedPoints}/${p.stats.totalPoints}`} icon={Navigation} tone="accent" />
            <MetricTile label="Exposed bldgs covered" value={`${Math.round(p.stats.exposedCoveragePct)}%`} help={`${p.stats.exposedCovered}/${p.stats.exposedTotal}`} icon={Building2} tone={p.stats.exposedCoveragePct >= 80 ? 'success' : 'warning'} />
            <MetricTile label="City coverage" value={`${p.stats.coveragePct.toFixed(1)}%`} help={`${p.stats.buildingsCovered} buildings`} icon={ShieldCheck} tone="neutral" />
            <MetricTile label="Flight remaining" value={formatKm(p.stats.remainingM)} help={`~${formatMinutes(p.stats.etaRemainingS)} sim time`} icon={Plane} tone="neutral" />
          </div>
          <ol className="max-h-40 space-y-1 overflow-auto text-xs">
            {p.plan.points.map(pt => {
              const done = p.stats!.distanceFlownM >= pt.atDistanceM;
              return (
                <li key={pt.id} className="flex items-start gap-2">
                  <Badge tone={done ? 'success' : 'neutral'} icon={done ? ShieldCheck : Navigation}>{done ? 'Inspected' : `#${pt.order}`}</Badge>
                  <span className="text-ink">{pt.label} <span className="text-ink-subtle">· score {pt.score.toFixed(2)} when chosen</span></span>
                </li>
              );
            })}
          </ol>
        </>
      ) : null}
      <p className="text-[11px] text-ink-subtle">
        Priority score = {DRONE_WEIGHTS.severity}·severity + {DRONE_WEIGHTS.coverage}·new coverage + {DRONE_WEIGHTS.distance}·proximity, chosen greedily from the drone's current position.
      </p>
    </div>
  );
}

export function BuildingPanel({ state, building, assignments, droneCoveredAtM, droneFlownM, onClose }: { state: SimState; building: Building; assignments: Assignment[]; droneCoveredAtM: number | undefined; droneFlownM: number; onClose: () => void }) {
  const ex = state.flood.exposure.get(building.id)!;
  const reports = state.activeIncidents.filter(i => i.buildingId === building.id);
  const risks = floorRisks(state, building);
  const times = travelTimesFrom(state.city, state.roads, building.nodeId);
  const nearby = state.city.facilities
    .map(f => ({ f, t: times.get(f.nodeId) }))
    .sort((a, b) => (a.t ?? Infinity) - (b.t ?? Infinity))
    .slice(0, 4);
  const assignment = assignments.find(a => a.incident.buildingId === building.id);
  const inspected = droneCoveredAtM !== undefined && droneCoveredAtM <= droneFlownM;
  let status: { tone: 'critical' | 'warning' | 'success' | 'accent' | 'neutral'; text: string };
  if (assignment?.status === 'assigned') status = { tone: 'accent', text: `${assignment.ambulance!.callSign} assigned — ETA ${formatMinutes(assignment.route!.timeS)} (simulated)` };
  else if (assignment?.status === 'unreachable') status = { tone: 'critical', text: 'No passable road — boat/air rescue team required (simulated)' };
  else if (reports.length) status = { tone: 'warning', text: 'Reported — awaiting resource' };
  else if (ex.level === 'at_risk') status = { tone: 'warning', text: 'Dry but within 0.5 m of the water line — monitor' };
  else if (ex.level !== 'none' && inspected) status = { tone: 'warning', text: 'Exposed — inspected by virtual drone, no report filed' };
  else if (ex.level !== 'none') status = { tone: 'warning', text: 'Exposed — not yet assessed' };
  else status = { tone: 'success', text: 'No action required' };

  return (
    <div className="space-y-3 text-xs" data-testid="building-panel">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-bold text-ink">{building.name ?? building.id}</p>
          <p className="text-ink-muted">ID {building.id} · {building.use.replace('_', ' ')} · ground {building.elevation.toFixed(1)} m</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <MetricTile label="Floors" value={building.floors} />
        <MetricTile label="Occupants" value={`~${building.occupants}`} help="synthetic" />
        <MetricTile label="Flood depth" value={ex.depthM.toFixed(2)} unit="m" tone={ex.depthM > 0 ? 'critical' : 'success'} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge tone={ex.level === 'none' ? 'success' : ex.level === 'at_risk' || ex.level === 'low' ? 'warning' : 'critical'} icon={Droplets} srPrefix="Exposure">
          {ex.level === 'none' ? 'Not exposed' : `${ex.level.replace('_', ' ')} exposure`}
        </Badge>
        {ex.floorsAffected ? <Badge tone="critical" icon={ShieldAlert}>{ex.floorsAffected} floor(s) affected · ~{ex.occupantsExposed} people</Badge> : null}
      </div>
      <div>
        <p className={label}>Floor-level risk</p>
        <div className="mt-1 flex flex-col-reverse gap-0.5" aria-label="Floor risk stack">
          {risks.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-8 text-right tabular-nums text-ink-subtle">F{i}</span>
              <span className="h-3 flex-1 rounded-sm" style={{ background: FLOOR_COLORS[r] }} />
              <span className="w-16 text-ink-muted">{r === 'flooded' ? 'Flooded' : r === 'at_risk' ? 'At risk' : 'Safe'}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className={label}>Rescue status</p>
        <Badge tone={status.tone} icon={status.tone === 'success' ? ShieldCheck : ShieldAlert} className="mt-1">{status.text}</Badge>
      </div>
      <div>
        <p className={label}>Emergency reports</p>
        {reports.length ? (
          <ul className="mt-1 space-y-1">
            {reports.map(r => <li key={r.id} className="text-ink"><strong>Incident {r.label}</strong> · severity {r.severity}/5 · {r.description}</li>)}
          </ul>
        ) : (
          <p className="mt-1 text-ink-muted">No simulated reports for this building.</p>
        )}
      </div>
      <div>
        <p className={label}>Nearby resources (simulated drive time)</p>
        <ul className="mt-1 space-y-0.5">
          {nearby.map(({ f, t }) => (
            <li key={f.id} className="flex justify-between text-ink">
              <span>{f.name}</span>
              <span className="tabular-nums text-ink-muted">{t === undefined ? 'cut off' : formatMinutes(t)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
