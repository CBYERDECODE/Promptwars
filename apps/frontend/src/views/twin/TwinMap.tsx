import { useEffect, useRef, useState } from 'react';
import maplibregl, { GeoJSONSource, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection } from 'geojson';
import type { DronePlan, DronePose } from './sim/drone';
import type { Route } from './sim/routing';
import type { SimState } from './sim/scenario';
import { fromLngLat, pointInPolygon, toLngLat } from './geo';
import {
  buildingFeatures,
  dronePathFeatures,
  floodFeatures,
  floorFeatures,
  roadFeatures,
  routeFeature,
  staticFeatures
} from './mapData';
import { createDroneLayer } from './droneLayer';
import { CameraCommand, HOME_VIEW } from './mapConfig';

export interface TwinMapProps {
  state: SimState;
  currentRoute: Route | null;
  previousRoute: Route | null;
  assignmentRoutes: Route[];
  selectedBuildingId: string | null;
  selectedIncidentId: string | null;
  selectedAmbulanceId: string | null;
  closureMode: boolean;
  dronePlan: DronePlan | null;
  droneFlownM: number;
  dronePoseRef: React.MutableRefObject<DronePose | null>;
  followDrone: boolean;
  camera: CameraCommand | null;
  onSelectBuilding: (id: string) => void;
  onSelectIncident: (id: string) => void;
  onSelectAmbulance: (id: string) => void;
  onToggleEdge: (edgeId: string) => void;
  onUnavailable: (reason: string) => void;
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

function baseStyle(): StyleSpecification {
  const tiles = import.meta.env.VITE_TWIN_BASEMAP_TILES;
  return {
    version: 8,
    sources: tiles
      ? { basemap: { type: 'raster', tiles: [tiles], tileSize: 256, attribution: 'Reference basemap (configured via VITE_TWIN_BASEMAP_TILES)' } }
      : {},
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#F8FAFC' } },
      ...(tiles ? [{ id: 'basemap', type: 'raster' as const, source: 'basemap', paint: { 'raster-opacity': 0.35 } }] : [])
    ]
  };
}

function setData(map: maplibregl.Map, id: string, data: FeatureCollection) {
  (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
}

function markerEl(className: string, label: string, title: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `twin-marker ${className}`;
  el.textContent = label;
  el.title = title;
  el.setAttribute('aria-label', title);
  el.setAttribute('role', 'img');
  return el;
}

export function TwinMap(props: TwinMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [basemapError, setBasemapError] = useState(false);
  const propsRef = useRef(props);
  propsRef.current = props;
  const dynamicMarkers = useRef<maplibregl.Marker[]>([]);

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: baseStyle(),
        center: toLngLat({ x: 0, y: 0 }),
        ...HOME_VIEW,
        maxPitch: 75,
        attributionControl: { compact: true, customAttribution: 'Synthetic city — ResQ AI simulation' }
      });
    } catch (err) {
      propsRef.current.onUnavailable(err instanceof Error ? err.message : 'Map could not start');
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.on('error', e => {
      const sourceId = (e as unknown as { sourceId?: string }).sourceId;
      if (sourceId === 'basemap') setBasemapError(true);
    });

    map.on('load', () => {
      const { ground, parks, river } = staticFeatures(propsRef.current.state.city);
      const add = (id: string, data: FeatureCollection = EMPTY) => map.addSource(id, { type: 'geojson', data });
      add('ground', ground);
      add('parks', parks);
      add('river', river);
      ['flood', 'roads', 'buildings', 'floors', 'route-prev', 'route-current', 'route-assign', 'drone-path', 'drone-points'].forEach(id => add(id));

      const hasBasemap = Boolean(map.getSource('basemap'));
      map.addLayer({ id: 'ground', type: 'fill', source: 'ground', paint: { 'fill-color': '#EEF2F7', 'fill-opacity': hasBasemap ? 0.5 : 1 } });
      map.addLayer({ id: 'parks', type: 'fill', source: 'parks', paint: { 'fill-color': '#DCFCE7' } });
      map.addLayer({ id: 'river', type: 'fill', source: 'river', paint: { 'fill-color': '#93C5FD' } });
      map.addLayer({
        id: 'flood',
        type: 'fill',
        source: 'flood',
        paint: {
          'fill-color': ['interpolate', ['linear'], ['get', 'depth'], 0, '#BFDBFE', 0.5, '#60A5FA', 1.5, '#2563EB', 3, '#1E3A8A'],
          'fill-opacity': 0.55
        }
      });
      map.addLayer({ id: 'roads-casing', type: 'line', source: 'roads', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#FFFFFF', 'line-width': ['case', ['get', 'bridge'], 10, 7] } });
      map.addLayer({ id: 'roads', type: 'line', source: 'roads', layout: { 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'bridge'], 6, 3.5] } });
      map.addLayer({ id: 'roads-hit', type: 'line', source: 'roads', paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 14 } });
      map.addLayer({ id: 'route-assign', type: 'line', source: 'route-assign', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#1D4ED8', 'line-width': 3, 'line-opacity': 0.45 } });
      map.addLayer({ id: 'route-prev', type: 'line', source: 'route-prev', layout: { 'line-join': 'round' }, paint: { 'line-color': '#475569', 'line-width': 4, 'line-dasharray': [1.5, 1.5] } });
      map.addLayer({ id: 'route-current-glow', type: 'line', source: 'route-current', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#60A5FA', 'line-width': 12, 'line-opacity': 0.35, 'line-blur': 4 } });
      map.addLayer({ id: 'route-current', type: 'line', source: 'route-current', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#2563EB', 'line-width': 5 } });
      map.addLayer({
        id: 'buildings',
        type: 'fill-extrusion',
        source: 'buildings',
        paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.92 }
      });
      map.addLayer({
        id: 'floors',
        type: 'fill-extrusion',
        source: 'floors',
        paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': ['get', 'top'], 'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-opacity': 0.95 }
      });
      map.addLayer({ id: 'drone-path', type: 'line', source: 'drone-path', paint: { 'line-color': '#7C3AED', 'line-width': 2.5, 'line-dasharray': [2, 1.5] } });
      map.addLayer({
        id: 'drone-points',
        type: 'circle',
        source: 'drone-points',
        paint: {
          'circle-radius': 7,
          'circle-color': ['case', ['get', 'visited'], '#7C3AED', '#FFFFFF'],
          'circle-stroke-color': '#7C3AED',
          'circle-stroke-width': 2.5
        }
      });
      map.addLayer(createDroneLayer(() => propsRef.current.dronePoseRef.current));

      map.on('click', e => {
        if (propsRef.current.closureMode) return;
        const box: [maplibregl.PointLike, maplibregl.PointLike] = [
          [e.point.x - 6, e.point.y - 6],
          [e.point.x + 6, e.point.y + 6]
        ];
        const hit = map.queryRenderedFeatures(box, { layers: ['buildings', 'floors'] })[0]?.properties?.id;
        if (typeof hit === 'string') return propsRef.current.onSelectBuilding(hit);
        const ground = fromLngLat(e.lngLat.lng, e.lngLat.lat);
        const buildings = propsRef.current.state.city.buildings;
        let b = buildings.find(x => pointInPolygon(ground, x.footprint));
        if (!b) {
          // Small footprints are hard to hit when zoomed out: accept the nearest within 25 m.
          let best = 25;
          for (const x of buildings) {
            const d = Math.hypot(x.centroid.x - ground.x, x.centroid.y - ground.y);
            if (d < best) {
              best = d;
              b = x;
            }
          }
        }
        if (b) propsRef.current.onSelectBuilding(b.id);
      });
      map.on('click', 'roads-hit', e => {
        if (!propsRef.current.closureMode) return;
        const id = e.features?.[0]?.properties?.id;
        if (typeof id === 'string') propsRef.current.onToggleEdge(id);
      });
      for (const layer of ['buildings', 'roads-hit']) {
        map.on('mouseenter', layer, () => {
          if ((layer === 'roads-hit') === propsRef.current.closureMode) map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
      }

      // Static facility and team markers.
      const city = propsRef.current.state.city;
      const kindLabel = { hospital: ['H', 'hospital'], shelter: ['S', 'shelter'], fire_station: ['F', 'fire'] } as const;
      for (const f of city.facilities) {
        const [label, cls] = kindLabel[f.kind];
        new maplibregl.Marker({ element: markerEl(`twin-marker--${cls}`, label, `${f.name} (capacity ${f.capacity})`) }).setLngLat(toLngLat(f.position)).addTo(map);
      }
      for (const t of city.rescueTeams) {
        new maplibregl.Marker({ element: markerEl('twin-marker--team', 'R', `${t.name} — ${t.capability}`) }).setLngLat(toLngLat(t.position)).addTo(map);
      }
      setReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const { state, selectedBuildingId, currentRoute, previousRoute, assignmentRoutes, dronePlan, droneFlownM } = props;

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    setData(map, 'flood', floodFeatures(state));
    setData(map, 'roads', roadFeatures(state));
  }, [ready, state]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const incidentBuildings = new Set(state.activeIncidents.map(i => i.buildingId));
    const selected = state.city.buildings.find(b => b.id === selectedBuildingId) ?? null;
    setData(map, 'buildings', buildingFeatures(state, selectedBuildingId, incidentBuildings));
    setData(map, 'floors', floorFeatures(state, selected));
  }, [ready, state, selectedBuildingId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const city = state.city;
    setData(map, 'route-current', { type: 'FeatureCollection', features: routeFeature(city, currentRoute, 'current') });
    setData(map, 'route-prev', { type: 'FeatureCollection', features: routeFeature(city, previousRoute, 'previous') });
    setData(map, 'route-assign', { type: 'FeatureCollection', features: assignmentRoutes.flatMap(r => routeFeature(city, r, 'assign')) });
  }, [ready, state.city, currentRoute, previousRoute, assignmentRoutes]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const { path, points } = dronePathFeatures(dronePlan, droneFlownM);
    setData(map, 'drone-path', path);
    setData(map, 'drone-points', points);
    map.triggerRepaint();
  }, [ready, dronePlan, droneFlownM]);

  // Incident + ambulance markers depend on selection and active incidents.
  const { selectedIncidentId, selectedAmbulanceId } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    dynamicMarkers.current.forEach(m => m.remove());
    dynamicMarkers.current = [];
    for (const inc of state.activeIncidents) {
      const el = markerEl(
        `twin-marker--incident sev-${inc.severity}${inc.id === selectedIncidentId ? ' is-selected' : ''}`,
        inc.label,
        `Incident ${inc.label}: ${inc.title} (severity ${inc.severity}/5) — select`
      );
      el.setAttribute('role', 'button');
      el.addEventListener('click', ev => {
        ev.stopPropagation();
        propsRef.current.onSelectIncident(inc.id);
      });
      dynamicMarkers.current.push(new maplibregl.Marker({ element: el }).setLngLat(toLngLat(inc.position)).addTo(map));
    }
    for (const amb of state.city.ambulances) {
      const el = markerEl(
        `twin-marker--ambulance${amb.status === 'available' ? '' : ' is-unavailable'}${amb.id === selectedAmbulanceId ? ' is-selected' : ''}`,
        amb.callSign,
        `${amb.callSign} (${amb.status}) — ${amb.base}`
      );
      el.setAttribute('role', 'button');
      el.addEventListener('click', ev => {
        ev.stopPropagation();
        propsRef.current.onSelectAmbulance(amb.id);
      });
      dynamicMarkers.current.push(new maplibregl.Marker({ element: el }).setLngLat(toLngLat(amb.position)).addTo(map));
    }
  }, [ready, state.activeIncidents, state.city.ambulances, selectedIncidentId, selectedAmbulanceId]);

  // Smooth camera transitions.
  const { camera } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !camera) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    map.flyTo({ center: toLngLat(camera.target), zoom: camera.zoom, pitch: camera.pitch, bearing: camera.bearing, duration: reduce ? 0 : 1800, essential: true });
  }, [ready, camera]);

  // Follow the drone: re-centre each frame while follow mode is on.
  const { followDrone } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    let raf = 0;
    const tick = () => {
      const pose = propsRef.current.dronePoseRef.current;
      if (pose && followDrone && !map.isMoving()) map.jumpTo({ center: toLngLat(pose.position) });
      map.triggerRepaint();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, followDrone]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" data-testid="twin-map" />
      {basemapError ? (
        <div className="absolute left-3 bottom-3 rounded-md bg-white/90 px-2 py-1 text-xs text-amber-800 shadow">
          Reference basemap tiles unavailable — showing synthetic city only.
        </div>
      ) : null}
    </div>
  );
}
