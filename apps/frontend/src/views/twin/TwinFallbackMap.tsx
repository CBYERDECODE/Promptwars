import type { DronePlan, DronePose } from './sim/drone';
import type { Route } from './sim/routing';
import type { SimState } from './sim/scenario';
import { EXPOSURE_COLORS, ROAD_COLORS } from './mapData';

interface Props {
  state: SimState;
  currentRoute: Route | null;
  previousRoute: Route | null;
  selectedBuildingId: string | null;
  selectedIncidentId: string | null;
  closureMode: boolean;
  dronePlan: DronePlan | null;
  dronePose: DronePose | null;
  reason: string;
  onSelectBuilding: (id: string) => void;
  onSelectIncident: (id: string) => void;
  onToggleEdge: (edgeId: string) => void;
}

/**
 * 2D plan-view fallback used when WebGL / MapLibre is unavailable. It renders
 * the same simulation state so every feature keeps working.
 */
export function TwinFallbackMap(props: Props) {
  const { state, currentRoute, previousRoute, selectedBuildingId, selectedIncidentId, closureMode, dronePlan, dronePose } = props;
  const { city } = state;
  const { minX, maxX, minY, maxY } = city.extent;
  const nodes = new Map(city.nodes.map(n => [n.id, n]));
  const pt = (p: { x: number; y: number }) => `${p.x},${-p.y}`;
  const routePts = (r: Route | null) => (r && r.found ? r.nodeIds.map(id => pt(nodes.get(id)!)).join(' ') : '');
  const runs = state.flood;
  const cells: JSX.Element[] = [];
  for (let i = 0; i < runs.depth.length; i++) {
    const d = runs.depth[i];
    if (d <= 0) continue;
    const gx = i % runs.grid.cols;
    const gy = Math.floor(i / runs.grid.cols);
    const x = runs.grid.minX + gx * runs.grid.cellSizeM;
    const y = runs.grid.minY + gy * runs.grid.cellSizeM;
    cells.push(<rect key={i} x={x} y={-(y + runs.grid.cellSizeM)} width={runs.grid.cellSizeM} height={runs.grid.cellSizeM} fill="#3B82F6" opacity={Math.min(0.75, 0.2 + d / 4)} />);
  }

  return (
    <div className="relative h-full w-full bg-slate-50" data-testid="twin-fallback-map">
      <svg viewBox={`${minX} ${-maxY} ${maxX - minX} ${maxY - minY}`} className="h-full w-full" role="img" aria-label="2D plan view of the synthetic city (fallback)">
        <rect x={minX} y={-maxY} width={maxX - minX} height={maxY - minY} fill="#EEF2F7" />
        {city.parks.map((p, i) => <polygon key={i} points={p.map(pt).join(' ')} fill="#DCFCE7" />)}
        <polygon points={city.river.map(pt).join(' ')} fill="#93C5FD" />
        {cells}
        {city.edges.map(e => {
          const a = nodes.get(e.from)!;
          const b = nodes.get(e.to)!;
          const status = state.roads.get(e.id)!.status;
          return (
            <line
              key={e.id}
              x1={a.x} y1={-a.y} x2={b.x} y2={-b.y}
              stroke={ROAD_COLORS[status]}
              strokeWidth={e.bridge ? 12 : 7}
              strokeLinecap="round"
              style={{ cursor: closureMode ? 'pointer' : undefined }}
              onClick={closureMode ? () => props.onToggleEdge(e.id) : undefined}
            >
              <title>{`${e.name}: ${status}`}</title>
            </line>
          );
        })}
        {city.buildings.map(b => {
          const ex = state.flood.exposure.get(b.id)!;
          return (
            <polygon
              key={b.id}
              points={b.footprint.map(pt).join(' ')}
              fill={EXPOSURE_COLORS[ex.level]}
              stroke={b.id === selectedBuildingId ? '#2563EB' : '#94A3B8'}
              strokeWidth={b.id === selectedBuildingId ? 5 : 1}
              style={{ cursor: closureMode ? undefined : 'pointer' }}
              onClick={closureMode ? undefined : () => props.onSelectBuilding(b.id)}
            >
              <title>{`${b.id} · ${b.floors} floors`}</title>
            </polygon>
          );
        })}
        {previousRoute ? <polyline points={routePts(previousRoute)} fill="none" stroke="#475569" strokeWidth={8} strokeDasharray="20 16" /> : null}
        {currentRoute ? <polyline points={routePts(currentRoute)} fill="none" stroke="#2563EB" strokeWidth={10} strokeLinejoin="round" /> : null}
        {dronePlan ? <polyline points={dronePlan.path.map(pt).join(' ')} fill="none" stroke="#7C3AED" strokeWidth={5} strokeDasharray="14 10" /> : null}
        {city.facilities.map(f => (
          <g key={f.id} transform={`translate(${f.position.x},${-f.position.y})`}>
            <circle r={22} fill={f.kind === 'hospital' ? '#DC2626' : f.kind === 'shelter' ? '#16A34A' : '#D97706'} />
            <text textAnchor="middle" dy={8} fontSize={24} fill="#fff" fontWeight={700}>{f.kind === 'hospital' ? 'H' : f.kind === 'shelter' ? 'S' : 'F'}</text>
          </g>
        ))}
        {city.ambulances.map(a => (
          <g key={a.id} transform={`translate(${a.position.x},${-a.position.y})`}>
            <rect x={-38} y={-16} width={76} height={32} rx={8} fill={a.status === 'available' ? '#1D4ED8' : '#94A3B8'} />
            <text textAnchor="middle" dy={7} fontSize={17} fill="#fff" fontWeight={700}>{a.callSign}</text>
          </g>
        ))}
        {state.activeIncidents.map(inc => (
          <g key={inc.id} transform={`translate(${inc.position.x},${-inc.position.y})`} style={{ cursor: 'pointer' }} onClick={() => props.onSelectIncident(inc.id)}>
            <circle r={inc.id === selectedIncidentId ? 34 : 26} fill="#DC2626" stroke="#fff" strokeWidth={5} />
            <text textAnchor="middle" dy={9} fontSize={26} fill="#fff" fontWeight={700}>{inc.label}</text>
          </g>
        ))}
        {dronePose ? <circle cx={dronePose.position.x} cy={-dronePose.position.y} r={20} fill="#7C3AED" stroke="#fff" strokeWidth={5} /> : null}
      </svg>
      <div className="absolute left-3 bottom-3 max-w-sm rounded-md bg-white/95 px-3 py-2 text-xs text-amber-800 shadow">
        3D view unavailable ({props.reason}). Showing the same simulation in 2D plan view.
      </div>
    </div>
  );
}
