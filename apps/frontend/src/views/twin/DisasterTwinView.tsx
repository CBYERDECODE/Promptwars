import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Box, Building2, Crosshair, Map as MapIcon, Plane, PlayCircle, Route as RouteIcon, Square, Waves } from 'lucide-react';
import { Badge, Button, Card, SimulatedNotice, cx } from '../../ui';
import { getCity, MILL_BRIDGE_ID } from './sim/city';
import { computeSimState, SimInputs } from './sim/scenario';
import { aStarRoute, rankAmbulances, Route } from './sim/routing';
import { analyseCoverage, assignResources, recommendations } from './sim/dispatch';
import { DRONE_CRUISE_MPS, dronePoseAt, DronePlan, DronePose, droneStats, planDroneMission } from './sim/drone';
import { buildTimeline, Timeline } from './sim/timeline';
import { answerQuestion, responseSummary } from './sim/copilot';
import type { Vec2 } from './sim/types';
import { CameraCommand, HOME_VIEW, webglAvailable } from './mapConfig';

// MapLibre is loaded on demand so the WebGL-free fallback (and tests) never pull it in.
const TwinMap = lazy(() => import('./TwinMap').then(m => ({ default: m.TwinMap })));
import { TwinFallbackMap } from './TwinFallbackMap';
import { BuildingPanel, DronePanel, FloodPanel, RoutePanel } from './TwinPanels';
import { CopilotMessage, TwinCopilot } from './TwinCopilot';
import { TwinTimeline } from './TwinTimeline';
import { EXPOSURE_COLORS, ROAD_COLORS } from './mapData';

export const DEMO_TITLE = 'Urban Flood Emergency — 3D Simulation';
/** Virtual drone playback runs faster than real time so a mission fits the demo. */
export const DRONE_TIME_SCALE = 12;

type PanelTab = 'flood' | 'route' | 'drone' | 'building' | 'copilot';

interface RouteRequest {
  incidentId: string;
  ambulanceId: string;
}

interface DemoStep {
  at: number;
  caption: string;
  run: () => void;
}

const DEMO_LENGTH_S = 84;

export function DisasterTwinView() {
  const city = useMemo(() => getCity(), []);
  const allIncidentIds = useMemo(() => city.incidents.map(i => i.id), [city]);
  const [webgl] = useState(() => webglAvailable());
  const [mapFailure, setMapFailure] = useState<string | null>(webgl ? null : 'WebGL is not available in this browser');

  // Live (interactive) inputs.
  const [waterLevel, setWaterLevel] = useState(1.2);
  const [manualEdgeIds, setManualEdgeIds] = useState<string[]>([]);
  const [manualBridgeIds, setManualBridgeIds] = useState<string[]>([]);
  const [liveIncidentIds, setLiveIncidentIds] = useState<string[]>(allIncidentIds);

  // Replay.
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [replayActive, setReplayActive] = useState(false);
  const [minute, setMinute] = useState(0);
  const [playing, setPlaying] = useState(false);

  const liveInputs: SimInputs = useMemo(
    () => ({ waterLevelM: waterLevel, manualEdgeIds, manualBridgeIds, activeIncidentIds: liveIncidentIds }),
    [waterLevel, manualEdgeIds, manualBridgeIds, liveIncidentIds]
  );
  const liveState = useMemo(() => computeSimState(city, liveInputs), [city, liveInputs]);
  const liveAssignments = useMemo(() => (replayActive ? [] : assignResources(liveState)), [liveState, replayActive]);
  const snapshot = replayActive && timeline ? timeline.snapshots[Math.min(minute, timeline.snapshots.length - 1)] : null;
  const state = snapshot ? snapshot.state : liveState;
  const assignments = snapshot ? snapshot.assignments : liveAssignments;
  const recs = useMemo(() => recommendations(state, assignments, analyseCoverage(state)), [state, assignments]);

  // UI selection.
  const [tab, setTab] = useState<PanelTab>('flood');
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [incidentId, setIncidentId] = useState<string | null>(city.incidents[0]?.id ?? null);
  const [ambulanceId, setAmbulanceId] = useState<string | null>(null);
  const [request, setRequest] = useState<RouteRequest | null>(null);
  const [closureMode, setClosureMode] = useState(false);
  const [showAssignments, setShowAssignments] = useState(true);
  const [camera, setCamera] = useState<CameraCommand | null>(null);
  const flyTo = useCallback((target: Vec2, zoom = 16, pitch = 60, bearing = -20) => {
    setCamera({ target, zoom, pitch, bearing, nonce: Date.now() + Math.random() });
  }, []);
  const overview = useCallback(() => flyTo({ x: 0, y: 0 }, HOME_VIEW.zoom, HOME_VIEW.pitch, HOME_VIEW.bearing), [flyTo]);

  const incident = state.activeIncidents.find(i => i.id === incidentId) ?? null;
  const ranking = useMemo(() => (incident ? rankAmbulances(city, state.roads, incident) : []), [city, state.roads, incident]);

  // Route recomputed against the current state whenever conditions change.
  const route: Route | null = useMemo(() => {
    if (!request) return null;
    const inc = state.activeIncidents.find(i => i.id === request.incidentId);
    const amb = city.ambulances.find(a => a.id === request.ambulanceId);
    return inc && amb ? aStarRoute(city, state.roads, amb.nodeId, inc.nodeId) : null;
  }, [request, state, city]);
  const [previousRoute, setPreviousRoute] = useState<Route | null>(null);
  const lastRoute = useRef<{ key: string; route: Route } | null>(null);
  useEffect(() => {
    if (!route || !request) {
      lastRoute.current = null;
      setPreviousRoute(null);
      return;
    }
    const key = `${request.incidentId}|${request.ambulanceId}`;
    const last = lastRoute.current;
    if (last && last.key !== key) setPreviousRoute(null);
    else if (last && (last.route.edgeIds.join() !== route.edgeIds.join() || last.route.found !== route.found)) setPreviousRoute(last.route);
    lastRoute.current = { key, route };
  }, [route, request]);

  const selectIncident = useCallback(
    (id: string) => {
      setIncidentId(id);
      const inc = state.activeIncidents.find(i => i.id === id);
      if (!inc) return;
      const best = rankAmbulances(city, state.roads, inc).find(o => o.route.found);
      setAmbulanceId(best?.ambulance.id ?? null);
      setTab('route');
      flyTo(inc.position, 15.6, 55);
    },
    [city, state, flyTo]
  );
  useEffect(() => {
    if (!ambulanceId && ranking.length) setAmbulanceId(ranking.find(o => o.route.found)?.ambulance.id ?? null);
  }, [ranking, ambulanceId]);

  const selectBuilding = useCallback(
    (id: string) => {
      setSelectedBuildingId(id);
      setTab('building');
      const b = city.buildings.find(x => x.id === id);
      if (b) flyTo(b.centroid, 16.8, 62);
    },
    [city, flyTo]
  );

  const toggleEdge = useCallback((edgeId: string) => {
    const edge = city.edges.find(e => e.id === edgeId);
    if (edge?.bridge) {
      const bid = edge.bridge.id;
      setManualBridgeIds(ids => (ids.includes(bid) ? ids.filter(x => x !== bid) : [...ids, bid]));
    } else {
      setManualEdgeIds(ids => (ids.includes(edgeId) ? ids.filter(x => x !== edgeId) : [...ids, edgeId]));
    }
  }, [city]);
  const millManual = manualBridgeIds.includes(MILL_BRIDGE_ID);
  const millEdge = city.edges.find(e => e.bridge?.id === MILL_BRIDGE_ID);
  const millRuleClosed = Boolean(millEdge && state.roads.get(millEdge.id)?.cause === 'bridge_rule');
  const toggleMill = useCallback(() => {
    setManualBridgeIds(ids => (ids.includes(MILL_BRIDGE_ID) ? ids.filter(x => x !== MILL_BRIDGE_ID) : [...ids, MILL_BRIDGE_ID]));
    if (millEdge) {
      const a = city.nodes.find(n => n.id === millEdge.from)!;
      const b = city.nodes.find(n => n.id === millEdge.to)!;
      flyTo({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 15.4, 60, 15);
    }
  }, [city, millEdge, flyTo]);

  // Virtual drone.
  const [dronePlan, setDronePlan] = useState<DronePlan | null>(null);
  const [droneRunning, setDroneRunning] = useState(false);
  const [droneFlown, setDroneFlown] = useState(0);
  const [follow, setFollow] = useState(false);
  const flownRef = useRef(0);
  const poseRef = useRef<DronePose | null>(null);
  const droneHome = useMemo(() => city.facilities.find(f => f.kind === 'fire_station')?.position ?? { x: 0, y: 0 }, [city]);
  const startDrone = useCallback(() => {
    let plan = dronePlan;
    if (!plan || flownRef.current >= plan.totalDistanceM) {
      plan = planDroneMission(state, droneHome);
      flownRef.current = 0;
      setDroneFlown(0);
      setDronePlan(plan);
      poseRef.current = dronePoseAt(plan, 0);
    }
    setDroneRunning(true);
    setTab('drone');
  }, [dronePlan, state, droneHome]);
  const resetDrone = useCallback(() => {
    setDroneRunning(false);
    setDronePlan(null);
    setFollow(false);
    flownRef.current = 0;
    poseRef.current = null;
    setDroneFlown(0);
  }, []);
  useEffect(() => {
    if (!droneRunning || !dronePlan) return;
    let raf = 0;
    let last = performance.now();
    let lastCommit = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      flownRef.current = Math.min(dronePlan.totalDistanceM, flownRef.current + dt * DRONE_CRUISE_MPS * DRONE_TIME_SCALE);
      poseRef.current = dronePoseAt(dronePlan, flownRef.current);
      const done = flownRef.current >= dronePlan.totalDistanceM;
      if (now - lastCommit > 150 || done) {
        lastCommit = now;
        setDroneFlown(flownRef.current);
      }
      if (done) setDroneRunning(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [droneRunning, dronePlan]);
  const stats = useMemo(() => (dronePlan ? droneStats(dronePlan, state, droneFlown) : null), [dronePlan, state, droneFlown]);

  // Copilot.
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const ctxRef = useRef({ state, drone: stats });
  ctxRef.current = { state, drone: stats };
  const ask = useCallback((q: string) => {
    setMessages(m => [...m, { id: Date.now() + m.length, question: q, answer: answerQuestion(q, ctxRef.current) }]);
  }, []);
  const askSummary = useCallback(() => {
    setMessages(m => [...m, { id: Date.now() + m.length, question: 'Give me a response summary', answer: responseSummary(ctxRef.current) }]);
    setTab('copilot');
  }, []);

  // Replay controls.
  const startReplay = useCallback(() => {
    setTimelineLoading(true);
    // Defer so the loading state paints before the 91 snapshots are computed.
    setTimeout(() => {
      setTimeline(t => t ?? buildTimeline(city));
      setTimelineLoading(false);
      setReplayActive(true);
      setMinute(0);
      setPlaying(true);
      setClosureMode(false);
    }, 30);
  }, [city]);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setMinute(m => {
        if (m >= 90) {
          setPlaying(false);
          return m;
        }
        return m + 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [playing]);

  // One-click demo.
  const [demoCaption, setDemoCaption] = useState<string | null>(null);
  const [demoStartedAt, setDemoStartedAt] = useState<number | null>(null);
  const [demoElapsed, setDemoElapsed] = useState(0);
  const demoTimers = useRef<number[]>([]);
  const stopDemo = useCallback(() => {
    demoTimers.current.forEach(t => window.clearTimeout(t));
    demoTimers.current = [];
    setDemoStartedAt(null);
    setDemoCaption(null);
  }, []);
  useEffect(() => stopDemo, [stopDemo]);
  useEffect(() => {
    if (demoStartedAt === null) return;
    const id = window.setInterval(() => setDemoElapsed((Date.now() - demoStartedAt) / 1000), 500);
    return () => window.clearInterval(id);
  }, [demoStartedAt]);

  const runDemo = useCallback(() => {
    stopDemo();
    const incA = city.incidents.find(i => i.label === 'A') ?? city.incidents[0];
    const demoWater = 2.2;
    const steps: DemoStep[] = [
      {
        at: 0,
        caption: `1/7 · Synthetic city loaded — ${city.name}: ${city.buildings.length} buildings, ${city.edges.length} road segments, 3 bridges.`,
        run: () => {
          setReplayActive(false);
          setPlaying(false);
          setWaterLevel(0);
          setManualEdgeIds([]);
          setManualBridgeIds([]);
          setLiveIncidentIds([]);
          setRequest(null);
          setSelectedBuildingId(null);
          setClosureMode(false);
          resetDrone();
          setMessages([]);
          setTab('flood');
          overview();
        }
      },
      { at: 5, caption: `2/7 · ${city.incidents.length} simulated emergency reports arrive (red markers).`, run: () => setLiveIncidentIds(allIncidentIds) },
      {
        at: 10,
        caption: `3/7 · Flood rises to ${demoWater} m — exposed buildings turn amber/red, flooded roads close.`,
        run: () => {
          for (let i = 1; i <= 22; i++) demoTimers.current.push(window.setTimeout(() => setWaterLevel(Math.round((demoWater * i) / 22 * 10) / 10), i * 520));
        }
      },
      {
        at: 24,
        caption: `4/7 · A* finds the fastest available ambulance to Incident ${incA.label} under current flood conditions.`,
        run: () => {
          const s = computeSimState(city, { waterLevelM: demoWater, manualEdgeIds: [], manualBridgeIds: [], activeIncidentIds: allIncidentIds });
          const best = rankAmbulances(city, s.roads, incA).find(o => o.route.found);
          setIncidentId(incA.id);
          if (best) {
            setAmbulanceId(best.ambulance.id);
            setRequest({ incidentId: incA.id, ambulanceId: best.ambulance.id });
          }
          setTab('route');
          flyTo(incA.position, 15.2, 58, 10);
        }
      },
      {
        at: 34,
        caption: '5/7 · Mill Bridge marked inaccessible — route recalculated. Dashed = previous route, blue = new route.',
        run: () => {
          setManualBridgeIds([MILL_BRIDGE_ID]);
          flyTo(incA.position, 14.9, 55, 30);
        }
      },
      {
        at: 45,
        caption: '6/7 · Virtual drone inspects priority points ranked by severity, new coverage and distance (simulation only).',
        run: () => {
          const s = computeSimState(city, { waterLevelM: demoWater, manualEdgeIds: [], manualBridgeIds: [MILL_BRIDGE_ID], activeIncidentIds: allIncidentIds });
          const plan = planDroneMission(s, droneHome);
          flownRef.current = 0;
          poseRef.current = dronePoseAt(plan, 0);
          setDroneFlown(0);
          setDronePlan(plan);
          setDroneRunning(true);
          setFollow(true);
          setTab('drone');
          flyTo(droneHome, 15.6, 62);
        }
      },
      {
        at: 70,
        caption: '7/7 · Response summary generated from the simulation results (see copilot).',
        run: () => {
          setFollow(false);
          overview();
          askSummary();
        }
      },
      { at: DEMO_LENGTH_S, caption: 'Demo complete — everything stays interactive. Try the copilot or close another road.', run: () => setDemoStartedAt(null) }
    ];
    setDemoStartedAt(Date.now());
    setDemoElapsed(0);
    for (const step of steps) {
      demoTimers.current.push(
        window.setTimeout(() => {
          setDemoCaption(step.caption);
          step.run();
        }, step.at * 1000)
      );
    }
    demoTimers.current.push(window.setTimeout(() => setDemoCaption(null), (DEMO_LENGTH_S + 8) * 1000));
  }, [city, allIncidentIds, stopDemo, resetDrone, overview, flyTo, droneHome, askSummary]);

  const assignmentRoutes = useMemo(
    () => (showAssignments ? assignments.filter(a => a.route && a.route.found).map(a => a.route!) : []),
    [assignments, showAssignments]
  );
  const selectedBuilding = city.buildings.find(b => b.id === selectedBuildingId) ?? null;
  const demoRunning = demoStartedAt !== null;

  const tabs: Array<{ id: PanelTab; label: string; icon: typeof Waves }> = [
    { id: 'flood', label: 'Flood', icon: Waves },
    { id: 'route', label: 'Route', icon: RouteIcon },
    { id: 'drone', label: 'Drone', icon: Plane },
    { id: 'building', label: 'Building', icon: Building2 },
    { id: 'copilot', label: 'Copilot', icon: Bot }
  ];

  return (
    <div className="space-y-4" data-testid="disaster-twin">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-ink">
            <Box className="h-5 w-5 text-blue-600" aria-hidden="true" /> 3D Disaster Twin
          </h1>
          <p className="text-sm text-ink-muted">Flood modelling, graph routing, virtual drone reconnaissance and explainable recommendations on a synthetic city.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {demoRunning ? (
            <Button variant="secondary" icon={Square} onClick={stopDemo}>Stop demo</Button>
          ) : (
            <Button variant="primary" icon={PlayCircle} onClick={runDemo}>{DEMO_TITLE}</Button>
          )}
        </div>
      </div>

      <SimulatedNotice
        label={`${city.name} synthetic city`}
        notice="Terrain, buildings, occupants, incidents and resources are generated from a fixed seed. Nothing here dispatches real responders or controls a real drone."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="relative h-[520px] overflow-hidden rounded-card border border-line bg-white shadow-sm lg:h-[690px]">
            {mapFailure ? (
              <TwinFallbackMap
                state={state}
                currentRoute={route}
                previousRoute={previousRoute}
                selectedBuildingId={selectedBuildingId}
                selectedIncidentId={incidentId}
                closureMode={closureMode}
                dronePlan={dronePlan}
                dronePose={dronePlan ? dronePoseAt(dronePlan, droneFlown) : null}
                reason={mapFailure}
                onSelectBuilding={selectBuilding}
                onSelectIncident={selectIncident}
                onToggleEdge={toggleEdge}
              />
            ) : (
              <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-ink-muted">Loading 3D city…</div>}>
              <TwinMap
                state={state}
                currentRoute={route}
                previousRoute={previousRoute}
                assignmentRoutes={assignmentRoutes}
                selectedBuildingId={selectedBuildingId}
                selectedIncidentId={incidentId}
                selectedAmbulanceId={request?.ambulanceId ?? ambulanceId}
                closureMode={closureMode}
                dronePlan={dronePlan}
                droneFlownM={droneFlown}
                dronePoseRef={poseRef}
                followDrone={follow}
                camera={camera}
                onSelectBuilding={selectBuilding}
                onSelectIncident={selectIncident}
                onSelectAmbulance={id => {
                  setAmbulanceId(id);
                  setTab('route');
                }}
                onToggleEdge={toggleEdge}
                onUnavailable={setMapFailure}
              />
              </Suspense>
            )}
            <div className="pointer-events-none absolute left-3 top-3 flex max-w-[70%] flex-col gap-2">
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="uncertain" icon={Box} size="md">SIMULATED</Badge>
                <Badge tone="accent" icon={Waves} size="md">Water {state.inputs.waterLevelM.toFixed(1)} m</Badge>
                <Badge tone={state.flood.exposedBuildings ? 'critical' : 'success'} icon={Building2} size="md">{state.flood.exposedBuildings} exposed</Badge>
                {replayActive ? <Badge tone="warning" icon={PlayCircle} size="md">Replay T+{minute} min</Badge> : null}
                {closureMode ? <Badge tone="warning" icon={Crosshair} size="md">Click a road to toggle closure</Badge> : null}
              </div>
              {demoCaption ? (
                <div className="rounded-lg border border-blue-200 bg-white/95 px-3 py-2 text-sm font-medium text-ink shadow-md" role="status" aria-live="polite" data-testid="demo-caption">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-blue-700">{DEMO_TITLE}</p>
                  <p>{demoCaption}</p>
                  {demoRunning ? (
                    <div className="mt-1.5 h-1 overflow-hidden rounded bg-blue-100">
                      <div className="h-full bg-blue-600 transition-all" style={{ width: `${Math.min(100, (demoElapsed / DEMO_LENGTH_S) * 100)}%` }} />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="absolute bottom-3 right-3 flex flex-col items-end gap-2">
              <Button size="sm" variant="secondary" icon={MapIcon} onClick={overview}>Overview</Button>
              <div className="pointer-events-none rounded-lg border border-line bg-white/95 px-3 py-2 text-[11px] text-ink shadow-sm" aria-label="Map legend">
                <p className="mb-1 font-semibold">Legend</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  <Swatch color={EXPOSURE_COLORS.high} label="High exposure" />
                  <Swatch color={EXPOSURE_COLORS.at_risk} label="At risk (<0.5 m)" />
                  <Swatch color={ROAD_COLORS.closed} label="Road closed" line />
                  <Swatch color={ROAD_COLORS.caution} label="Road caution" line />
                  <Swatch color="#2563EB" label="Route" line />
                  <Swatch color="#475569" label="Previous route" line />
                  <Swatch color="#7C3AED" label="Drone path" line />
                  <Swatch color="#60A5FA" label="Flood water" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <Card as="section" title="Simulation controls & copilot" bodyClassName="flex flex-col gap-3 lg:h-[600px]">
          <div role="tablist" aria-label="Twin panels" className="grid grid-cols-5 gap-1 rounded-lg bg-surface-sunken p-1">
            {tabs.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  role="tab"
                  type="button"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={cx('flex flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[11px] font-semibold', tab === t.id ? 'bg-white text-blue-700 shadow-sm' : 'text-ink-muted hover:text-ink')}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {t.label}
                </button>
              );
            })}
          </div>
          <div role="tabpanel" className={cx("min-h-0 flex-1", tab === "copilot" ? "flex flex-col" : "overflow-auto pr-1")}>
            {tab === 'flood' ? (
              <>
                <FloodPanel state={state} waterLevel={replayActive ? state.inputs.waterLevelM : waterLevel} onWaterLevel={setWaterLevel} disabled={replayActive} />
                {replayActive ? <p className="mt-2 text-xs text-amber-700">Water level is driven by the replay. Exit replay to adjust it.</p> : null}
              </>
            ) : null}
            {tab === 'route' ? (
              <>
                <RoutePanel
                  state={state}
                  incidentId={incident ? incidentId : null}
                  ambulanceId={ambulanceId}
                  ranking={ranking}
                  route={route}
                  previousRoute={previousRoute}
                  closureMode={closureMode}
                  millBridgeClosed={millManual}
                  onIncident={selectIncident}
                  onAmbulance={setAmbulanceId}
                  onGenerate={() => incidentId && ambulanceId && setRequest({ incidentId, ambulanceId })}
                  onToggleClosureMode={() => setClosureMode(v => !v)}
                  onToggleBridge={toggleMill}
                  onClearClosures={() => {
                    setManualEdgeIds([]);
                    setManualBridgeIds([]);
                  }}
                />
                {millRuleClosed ? <p className="mt-2 text-xs text-amber-700">Mill Bridge is already closed by the flood rule at this water level.</p> : null}
                <label className="mt-3 flex items-center gap-2 text-xs text-ink">
                  <input type="checkbox" checked={showAssignments} onChange={e => setShowAssignments(e.target.checked)} className="accent-blue-600" />
                  Show all simulated assignments ({assignments.filter(a => a.status === 'assigned').length} assigned, {assignments.filter(a => a.status === 'unreachable').length} unreachable)
                </label>
              </>
            ) : null}
            {tab === 'drone' ? (
              <DronePanel plan={dronePlan} stats={stats} running={droneRunning} follow={follow} onStart={startDrone} onPause={() => setDroneRunning(false)} onReset={resetDrone} onFollow={setFollow} />
            ) : null}
            {tab === 'building' ? (
              selectedBuilding ? (
                <BuildingPanel
                  state={state}
                  building={selectedBuilding}
                  assignments={assignments}
                  droneCoveredAtM={dronePlan?.buildingCoverageAtM.get(selectedBuilding.id)}
                  droneFlownM={droneFlown}
                  onClose={() => setSelectedBuildingId(null)}
                />
              ) : (
                <p className="text-xs text-ink-muted">Click any building on the map to inspect its floors, exposure, reports, rescue status and nearby resources.</p>
              )
            ) : null}
            {tab === 'copilot' ? <TwinCopilot messages={messages} onAsk={ask} /> : null}
          </div>
        </Card>

      </div>

      <Card as="section" title="Disaster Time Machine" description="Deterministic replay of a 90-minute synthetic flood.">
        <TwinTimeline
          timeline={timeline}
          active={replayActive}
          loading={timelineLoading}
          minute={minute}
          playing={playing}
          recommendations={recs}
          onStart={startReplay}
          onExit={() => {
            setReplayActive(false);
            setPlaying(false);
          }}
          onPlay={() => {
            if (minute >= 90) setMinute(0);
            setPlaying(true);
          }}
          onPause={() => setPlaying(false)}
          onRestart={() => {
            setMinute(0);
            setPlaying(true);
          }}
          onSeek={m => {
            setMinute(m);
            setPlaying(false);
          }}
        />
      </Card>
    </div>
  );
}

function Swatch({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={line ? 'h-1 w-4 rounded' : 'h-3 w-3 rounded-sm'} style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}
