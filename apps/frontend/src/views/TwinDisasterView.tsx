import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Building2,
  Droplets,
  History,
  Map,
  Play,
  Route as RouteIcon,
  Satellite,
  Sparkles,
  Square,
  TriangleAlert
} from 'lucide-react';
import {
  TWIN_DEMO_STEPS,
  TWIN_DEMO_TITLE,
  TWIN_LABEL,
  TWIN_NOTICE,
  answerTwinCopilot,
  assessTwinFlood,
  buildTwinTimeline,
  compareTwinRoutes,
  computePlan,
  generateTwinCity,
  getSimulatedDataset,
  getTwinBuildingIntelligence,
  planTwinDroneMission,
  planTwinRoute,
  type TwinCopilotAnswer,
  type TwinRoute
} from '@resq-ai/shared';
import { Badge, Button, Card, SimulatedNotice, cx } from '../ui';
import { TwinFloodPanel } from '../components/twin/TwinFloodPanel';
import { TwinRoutePanel } from '../components/twin/TwinRoutePanel';
import { TwinDronePanel } from '../components/twin/TwinDronePanel';
import { TwinTimelinePanel } from '../components/twin/TwinTimelinePanel';
import { TwinBuildingPanel } from '../components/twin/TwinBuildingPanel';
import { TwinCopilotPanel } from '../components/twin/TwinCopilotPanel';
import { TwinMapBasemap } from '../components/twin/TwinMapBasemap';
import { EXPOSURE_TONE, floodSummary, inspectedPointIds } from '../components/twin/twinLayout';

const TwinScene = React.lazy(() =>
  import('../components/twin/TwinScene').then(module => ({ default: module.TwinScene }))
);

type SideTab = 'flood' | 'routes' | 'drone' | 'timeline' | 'building' | 'copilot';

const SIDE_TABS: Array<{ id: SideTab; label: string; icon: React.FC<{ className?: string }> }> = [
  { id: 'flood', label: 'Flood', icon: Droplets },
  { id: 'routes', label: 'Routes', icon: RouteIcon },
  { id: 'drone', label: 'Drone', icon: Satellite },
  { id: 'timeline', label: 'Timeline', icon: History },
  { id: 'building', label: 'Building', icon: Building2 },
  { id: 'copilot', label: 'Copilot', icon: Sparkles }
];

const DEMO_STEP_MS = 13_000;
const TIMELINE_TICK_MS = 2_500;
const DRONE_TICK_MS = 50;

/**
 * ResQ AI — 3D Disaster Digital Twin command view.
 *
 * Orchestrates the deterministic simulation engines from `@resq-ai/shared` with
 * MapLibre (2D context) and Three.js (primary 3D scene). Nothing on this page
 * dispatches real emergency resources.
 */
export const TwinDisasterView: React.FC = () => {
  const city = useMemo(() => generateTwinCity(), []);
  const timeline = useMemo(() => buildTwinTimeline(city), [city]);

  const defaultIncident = city.incidents[0]?.id ?? '';
  const defaultUnit = city.units.find(unit => unit.type === 'AMBULANCE')?.id ?? city.units[0]?.id ?? '';

  const [waterLevel, setWaterLevel] = useState(0);
  const [extraBlocked, setExtraBlocked] = useState<string[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState(defaultIncident);
  const [selectedUnitId, setSelectedUnitId] = useState(defaultUnit);
  const [closureKey, setClosureKey] = useState('');
  const [route, setRoute] = useState<TwinRoute | null>(null);
  const [baselineRoute, setBaselineRoute] = useState<TwinRoute | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [sideTab, setSideTab] = useState<SideTab>('flood');
  const [viewMode, setViewMode] = useState<'3d' | 'split'>('3d');

  const [timelineIndex, setTimelineIndex] = useState(0);
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  const [timelineLocked, setTimelineLocked] = useState(false);

  const [droneProgress, setDroneProgress] = useState(0);
  const [droneRunning, setDroneRunning] = useState(false);
  const [cameraFollow, setCameraFollow] = useState(false);

  const [copilotAnswer, setCopilotAnswer] = useState<TwinCopilotAnswer | null>(null);
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoStepIndex, setDemoStepIndex] = useState(0);
  const [demoSummary, setDemoSummary] = useState<string | null>(null);
  const [controlsLocked, setControlsLocked] = useState(false);

  const demoTimerRef = useRef<number | null>(null);

  const flood = useMemo(
    () => assessTwinFlood(city, waterLevel, extraBlocked),
    [city, waterLevel, extraBlocked]
  );

  const allocationPlan = useMemo(
    () =>
      computePlan(getSimulatedDataset(), 'SEVERITY_FIRST', {
        blocked_edge_keys: flood.blocked_edge_keys
      }),
    [flood.blocked_edge_keys]
  );

  const mission = useMemo(() => planTwinDroneMission(city, flood), [city, flood]);

  const comparison = useMemo(() => {
    if (!baselineRoute || !route) return null;
    if (baselineRoute.signature === route.signature) return null;
    return compareTwinRoutes(baselineRoute, route);
  }, [baselineRoute, route]);

  const routesForScene = useMemo(() => (route ? [route] : []), [route]);

  const buildingIntelligence = useMemo(() => {
    if (!selectedBuildingId) return null;
    return getTwinBuildingIntelligence(city, flood, selectedBuildingId, { plan: allocationPlan });
  }, [city, flood, selectedBuildingId, allocationPlan]);

  const inspectedIds = useMemo(
    () => inspectedPointIds(city, mission, droneProgress),
    [city, mission, droneProgress]
  );

  const copilotContext = useMemo(
    () => ({
      city,
      flood,
      timeline,
      routes: routesForScene,
      mission,
      selectedBuildingId,
      baselineRoute,
      updatedRoute: route
    }),
    [city, flood, timeline, routesForScene, mission, selectedBuildingId, baselineRoute, route]
  );

  const askCopilot = useCallback(
    (question: string) => {
      setCopilotAnswer(answerTwinCopilot(question, copilotContext));
    },
    [copilotContext]
  );

  const applyDemoStep = useCallback(
    (index: number) => {
      const step = TWIN_DEMO_STEPS[index];
      if (!step) return;

      setWaterLevel(step.water_level_m);
      setExtraBlocked(step.extra_blocked);
      setTimelineLocked(true);

      if (step.focus === 'FLOOD' || step.focus === 'BRIDGE') {
        setSideTab('flood');
      }
      if (step.focus === 'ROUTES') {
        setSideTab('routes');
        setSelectedUnitId('amb-2');
        setSelectedIncidentId('inc-riverside');
        const baseline = planTwinRoute(city, assessTwinFlood(city, 2.4, []), 'amb-2', 'inc-riverside');
        const updated = planTwinRoute(
          city,
          assessTwinFlood(city, step.water_level_m, step.extra_blocked),
          'amb-2',
          'inc-riverside'
        );
        if (baseline) setBaselineRoute(baseline);
        if (updated) setRoute(updated);
      }
      if (step.focus === 'DRONE') {
        setSideTab('drone');
        setDroneRunning(true);
        setCameraFollow(true);
      }
      if (step.focus === 'SUMMARY') {
        setSideTab('copilot');
        setDroneRunning(false);
        const stepFlood = assessTwinFlood(city, step.water_level_m, step.extra_blocked);
        const stepMission = planTwinDroneMission(city, stepFlood);
        const summary = answerTwinCopilot('Give me an overall situation summary for human review', {
          city,
          flood: stepFlood,
          timeline,
          routes: routesForScene,
          mission: stepMission,
          selectedBuildingId,
          baselineRoute,
          updatedRoute: route
        });
        setDemoSummary(summary.answer);
        setCopilotAnswer(summary);
      }
    },
    [city, timeline, routesForScene, selectedBuildingId, baselineRoute, route]
  );

  const startDemo = () => {
    if (demoTimerRef.current !== null) {
      window.clearTimeout(demoTimerRef.current);
    }
    setDemoRunning(true);
    setDemoStepIndex(0);
    setDemoSummary(null);
    setControlsLocked(true);
    setBaselineRoute(null);
    setRoute(null);
    setDroneProgress(0);
    setDroneRunning(false);
    setCameraFollow(false);
    setExtraBlocked([]);
    applyDemoStep(0);
  };

  const stopDemo = () => {
    setDemoRunning(false);
    setControlsLocked(false);
    setTimelineLocked(false);
    if (demoTimerRef.current !== null) {
      window.clearTimeout(demoTimerRef.current);
      demoTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (!demoRunning) return;

    demoTimerRef.current = window.setTimeout(() => {
      const next = demoStepIndex + 1;
      if (next >= TWIN_DEMO_STEPS.length) {
        stopDemo();
        return;
      }
      setDemoStepIndex(next);
      applyDemoStep(next);
    }, DEMO_STEP_MS);

    return () => {
      if (demoTimerRef.current !== null) {
        window.clearTimeout(demoTimerRef.current);
      }
    };
  }, [demoRunning, demoStepIndex, applyDemoStep]);

  useEffect(() => {
    if (!timelinePlaying || timelineLocked) return;
    const handle = window.setInterval(() => {
      setTimelineIndex(current => {
        const next = current + 1;
        if (next >= timeline.frames.length) {
          setTimelinePlaying(false);
          return current;
        }
        const frame = timeline.frames[next];
        setWaterLevel(frame.water_level_m);
        setExtraBlocked([]);
        return next;
      });
    }, TIMELINE_TICK_MS);
    return () => window.clearInterval(handle);
  }, [timelinePlaying, timelineLocked, timeline.frames.length]);

  useEffect(() => {
    if (!droneRunning) return;
    const handle = window.setInterval(() => {
      setDroneProgress(current => {
        const next = current + DRONE_TICK_MS / 30_000;
        if (next >= 1) {
          setDroneRunning(false);
          return 1;
        }
        return next;
      });
    }, DRONE_TICK_MS);
    return () => window.clearInterval(handle);
  }, [droneRunning]);

  const handleWaterLevelChange = (level: number) => {
    if (controlsLocked) return;
    setWaterLevel(level);
    setTimelineLocked(false);
  };

  const handleTimelineIndexChange = (index: number) => {
    if (controlsLocked) return;
    setTimelineIndex(index);
    const frame = timeline.frames[index];
    setWaterLevel(frame.water_level_m);
    setExtraBlocked([]);
    setTimelineLocked(false);
  };

  const handleGenerateRoute = () => {
    const next = planTwinRoute(city, flood, selectedUnitId, selectedIncidentId);
    setRoute(next);
    if (!baselineRoute && next) {
      setBaselineRoute(next);
    }
  };

  const handleApplyClosure = () => {
    if (!closureKey) return;
    const before = route ?? planTwinRoute(city, flood, selectedUnitId, selectedIncidentId);
    if (before) setBaselineRoute(before);

    const nextBlocked = extraBlocked.includes(closureKey) ? extraBlocked : [...extraBlocked, closureKey];
    setExtraBlocked(nextBlocked);

    const nextFlood = assessTwinFlood(city, waterLevel, nextBlocked);
    const nextRoute = planTwinRoute(city, nextFlood, selectedUnitId, selectedIncidentId);
    setRoute(nextRoute);
  };

  const handleClearClosures = () => {
    setExtraBlocked([]);
    const nextFlood = assessTwinFlood(city, waterLevel, []);
    const nextRoute = planTwinRoute(city, nextFlood, selectedUnitId, selectedIncidentId);
    setRoute(nextRoute);
  };

  const summary = floodSummary(flood);
  const demoStep = TWIN_DEMO_STEPS[demoStepIndex];
  const exposedBuildings = flood.buildings
    .filter(state => state.flooded_floors > 0)
    .slice()
    .sort((a, b) => b.exposed_occupants - a.exposed_occupants)
    .slice(0, 8);

  return (
    <div className="space-y-4" data-testid="twin-disaster-view">
      <SimulatedNotice label={city.city} notice={TWIN_NOTICE} />

      <header className="flex flex-col gap-3 rounded-card border border-line bg-white px-4 py-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-accent">Emergency command center</p>
          <h1 className="text-xl font-bold text-ink sm:text-2xl">{TWIN_LABEL}</h1>
          <p className="mt-1 max-w-3xl text-xs text-ink-muted leading-5">
            Interactive 3D disaster intelligence for rehearsal and explainable routing. All figures are synthetic and
            nothing here triggers real dispatch.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={demoRunning ? 'secondary' : 'primary'}
            icon={demoRunning ? Square : Play}
            onClick={demoRunning ? stopDemo : startDemo}
            data-testid="twin-demo-button"
          >
            {demoRunning ? 'Stop demo' : TWIN_DEMO_TITLE}
          </Button>
          {demoRunning && demoStep && (
            <Badge tone="accent" icon={TriangleAlert} srPrefix="Demo step">
              Step {demoStepIndex + 1}/{TWIN_DEMO_STEPS.length}: {demoStep.title}
            </Badge>
          )}
        </div>
      </header>

      {demoSummary && (
        <div
          role="status"
          className="rounded-card border border-accent-border bg-accent-soft px-4 py-3 text-sm text-ink leading-6"
          data-testid="twin-demo-summary"
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-accent">Demo response summary (SIMULATED)</p>
          <p className="mt-1">{demoSummary}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {[
          { label: 'Buildings exposed', value: summary.exposed, tone: 'warning' as const },
          { label: 'Occupants (modelled)', value: summary.occupants, tone: 'warning' as const },
          { label: 'Roads impassable', value: `${summary.roadsImpassable}/${summary.roadsTotal}`, tone: 'critical' as const },
          { label: 'Incidents', value: city.incidents.length, tone: 'critical' as const },
          { label: 'Units', value: city.units.length, tone: 'accent' as const },
          { label: 'Water level', value: `${waterLevel.toFixed(1)} m`, tone: 'accent' as const }
        ].map(tile => (
          <div
            key={tile.label}
            className="rounded-card border border-line bg-white px-3 py-2.5 text-center shadow-xs"
          >
            <p className="text-[10px] font-bold uppercase tracking-wide text-ink-subtle">{tile.label}</p>
            <p data-metric className="mt-0.5 text-lg font-bold tabular-nums text-ink">
              {tile.value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={viewMode === '3d' ? 'primary' : 'secondary'}
          icon={Box}
          size="sm"
          onClick={() => setViewMode('3d')}
          aria-pressed={viewMode === '3d'}
        >
          3D focus
        </Button>
        <Button
          variant={viewMode === 'split' ? 'primary' : 'secondary'}
          icon={Map}
          size="sm"
          onClick={() => setViewMode('split')}
          aria-pressed={viewMode === 'split'}
        >
          3D + MapLibre
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <Card
            title="3D disaster scene"
            description="Primary simulation view — drag to orbit, scroll to zoom, click a block for intelligence."
            icon={Box}
            tone="accent"
            bodyClassName="p-0 overflow-hidden"
          >
            <div
              className={cx(
                'relative w-full bg-[#F8FAFC]',
                viewMode === '3d' ? 'h-[min(560px,65vh)]' : 'h-[min(420px,50vh)]'
              )}
              aria-hidden="true"
            >
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center text-sm text-ink-subtle">
                    Loading 3D scene…
                  </div>
                }
              >
                <TwinScene
                  city={city}
                  flood={flood}
                  routes={routesForScene}
                  baselineRoute={baselineRoute}
                  mission={mission}
                  droneProgress={droneProgress}
                  droneRunning={droneRunning}
                  cameraFollow={cameraFollow}
                  selectedBuildingId={selectedBuildingId}
                  onSelectBuilding={id => {
                    setSelectedBuildingId(id);
                    if (id) setSideTab('building');
                  }}
                />
              </Suspense>
            </div>
            <p className="border-t border-line px-3 py-2 text-[10px] text-ink-faint">
              WebGL scene is decorative for assistive technology — exposure counts and building details are duplicated in
              the table below and in the side panels.
            </p>
          </Card>

          {viewMode === 'split' && (
            <TwinMapBasemap
              city={city}
              flood={flood}
              routes={routesForScene}
              className="overflow-hidden rounded-card border border-line bg-white shadow-xs"
            />
          )}

          <Card
            title="Exposed buildings (accessible table)"
            description="Same flood engine as the 3D scene — sorted by modelled occupants on flooded floors."
            icon={Building2}
            bodyClassName="p-0"
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <caption className="sr-only">
                  Modelled building flood exposure at {waterLevel.toFixed(1)} metres water level
                </caption>
                <thead>
                  <tr className="border-b border-line bg-surface-muted">
                    {['Building', 'Exposure', 'Floors flooded', 'Occupants (modelled)', 'Water depth'].map(col => (
                      <th
                        key={col}
                        scope="col"
                        className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-ink-subtle whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {exposedBuildings.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-ink-subtle">
                        No modelled buildings have water over the ground floor at this level.
                      </td>
                    </tr>
                  ) : (
                    exposedBuildings.map(state => {
                      const building = city.buildings.find(candidate => candidate.id === state.building_id);
                      return (
                        <tr key={state.building_id} className="border-b border-line last:border-b-0">
                          <th scope="row" className="px-3 py-2 font-semibold text-ink">
                            {building?.label ?? state.building_id}
                          </th>
                          <td className="px-3 py-2">
                            <Badge tone={EXPOSURE_TONE[state.exposure]} icon={Droplets} srPrefix="Exposure">
                              {state.exposure}
                            </Badge>
                          </td>
                          <td data-metric className="px-3 py-2 tabular-nums text-ink">
                            {state.flooded_floors}
                          </td>
                          <td data-metric className="px-3 py-2 tabular-nums text-ink">
                            {state.exposed_occupants}
                          </td>
                          <td data-metric className="px-3 py-2 tabular-nums text-ink">
                            {state.water_depth_m.toFixed(1)} m
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-3">
          <nav aria-label="Twin feature panels" className="flex flex-wrap gap-1 rounded-card border border-line bg-white p-1">
            {SIDE_TABS.map(tab => {
              const Icon = tab.icon;
              const active = sideTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSideTab(tab.id)}
                  className={cx(
                    'flex min-h-tap flex-1 items-center justify-center gap-1.5 rounded-control px-2 py-2 text-[11px] font-semibold transition sm:flex-none sm:px-3',
                    active
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'text-slate-600 hover:bg-slate-100'
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <div className="max-h-[calc(100vh-12rem)] overflow-y-auto space-y-3 pr-0.5">
            {sideTab === 'flood' && (
              <TwinFloodPanel
                waterLevel={waterLevel}
                onWaterLevelChange={handleWaterLevelChange}
                flood={flood}
                locked={controlsLocked}
              />
            )}

            {sideTab === 'routes' && (
              <TwinRoutePanel
                city={city}
                flood={flood}
                selectedIncidentId={selectedIncidentId}
                selectedUnitId={selectedUnitId}
                onSelectIncident={setSelectedIncidentId}
                onSelectUnit={setSelectedUnitId}
                route={route}
                baselineRoute={baselineRoute}
                comparison={comparison}
                closureKey={closureKey}
                onSelectClosure={setClosureKey}
                onGenerateRoute={handleGenerateRoute}
                onApplyClosure={handleApplyClosure}
                onClearClosures={handleClearClosures}
                activeClosures={extraBlocked}
                allClosed={flood.roads.every(road => !road.accessible)}
              />
            )}

            {sideTab === 'drone' && (
              <TwinDronePanel
                mission={mission}
                progress={droneProgress}
                running={droneRunning}
                cameraFollow={cameraFollow}
                inspectedIds={inspectedIds}
                onStart={() => setDroneRunning(true)}
                onPause={() => setDroneRunning(false)}
                onReset={() => {
                  setDroneProgress(0);
                  setDroneRunning(false);
                }}
                onToggleFollow={() => setCameraFollow(current => !current)}
              />
            )}

            {sideTab === 'timeline' && (
              <TwinTimelinePanel
                timeline={timeline}
                index={timelineIndex}
                playing={timelinePlaying}
                onIndexChange={handleTimelineIndexChange}
                onTogglePlay={() => setTimelinePlaying(current => !current)}
                onRestart={() => {
                  setTimelineIndex(0);
                  setTimelinePlaying(false);
                  handleTimelineIndexChange(0);
                }}
                locked={controlsLocked || timelineLocked}
              />
            )}

            {sideTab === 'building' && (
              <TwinBuildingPanel
                intelligence={buildingIntelligence}
                onClear={() => setSelectedBuildingId(null)}
              />
            )}

            {sideTab === 'copilot' && (
              <TwinCopilotPanel
                answer={copilotAnswer}
                onAsk={askCopilot}
                locked={controlsLocked}
                selectedBuildingLabel={buildingIntelligence?.building.label ?? null}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
