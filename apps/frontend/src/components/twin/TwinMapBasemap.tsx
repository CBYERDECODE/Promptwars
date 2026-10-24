import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';

maplibregl.setWorkerUrl(maplibreWorkerUrl);
import type { FeatureCollection } from 'geojson';
import { edgeKey, type TwinCity, type TwinFloodAssessment, type TwinRoute } from '@resq-ai/shared';
import { EXPOSURE_HEX, SEVERITY_HEX } from './twinLayout';

/**
 * MapLibre schematic basemap for the synthetic Riverbend district.
 *
 * Coordinates are a fictional placement (not real addresses). When tile
 * servers are unreachable, a text fallback is shown instead of a blank panel.
 *
 * ⚠️ SIMULATED — for orientation only; the Three.js scene is the primary 3D view.
 */

/** Fictional map anchor — not a real incident location. */
const RIVERBEND_CENTER: [number, number] = [-122.4194, 37.7749];

/** Schematic 0..100 → approximate degrees (~3.6 km district). */
function planToLngLat(x: number, y: number): [number, number] {
  const scale = 0.00036;
  return [RIVERBEND_CENTER[0] + (x - 50) * scale, RIVERBEND_CENTER[1] - (y - 50) * scale];
}

const DEFAULT_STYLE = 'https://demotiles.maplibre.org/style.json';

interface Props {
  city: TwinCity;
  flood: TwinFloodAssessment;
  routes: TwinRoute[];
  className?: string;
}

function buildGeoJson(
  city: TwinCity,
  flood: TwinFloodAssessment,
  routes: TwinRoute[]
): FeatureCollection {
  const exposureById = new Map(flood.buildings.map(state => [state.building_id, state.exposure]));

  const roadFeatures = flood.roads.map(road => {
    const from = city.graph.nodes.find(node => node.id === road.from);
    const to = city.graph.nodes.find(node => node.id === road.to);
    if (!from || !to) return null;
    return {
      type: 'Feature' as const,
      properties: {
        accessible: road.accessible,
        label: road.label
      },
      geometry: {
        type: 'LineString' as const,
        coordinates: [planToLngLat(from.x, from.y), planToLngLat(to.x, to.y)]
      }
    };
  });

  const buildingFeatures = city.buildings.map(building => ({
    type: 'Feature' as const,
    properties: {
      id: building.id,
      label: building.label,
      category: building.category,
      exposure: exposureById.get(building.id) ?? 'NONE'
    },
    geometry: {
      type: 'Point' as const,
      coordinates: planToLngLat(building.x, building.y)
    }
  }));

  const incidentFeatures = city.incidents.map(incident => {
    const node = city.graph.nodes.find(candidate => candidate.id === incident.node_id);
    if (!node) return null;
    return {
      type: 'Feature' as const,
      properties: {
        id: incident.id,
        severity: incident.severity,
        title: incident.title
      },
      geometry: {
        type: 'Point' as const,
        coordinates: planToLngLat(node.x, node.y)
      }
    };
  });

  const routeFeatures = routes.flatMap(route => {
    if (route.geometry.length < 2) return [];
    return [
      {
        type: 'Feature' as const,
        properties: {
          signature: route.signature,
          reachable: route.reachable
        },
        geometry: {
          type: 'LineString' as const,
          coordinates: route.geometry.map(point => planToLngLat(point.x, point.y))
        }
      }
    ];
  });

  return {
    type: 'FeatureCollection',
    features: [
      ...roadFeatures.filter((feature): feature is NonNullable<typeof feature> => Boolean(feature)),
      ...buildingFeatures,
      ...incidentFeatures.filter((feature): feature is NonNullable<typeof feature> => Boolean(feature)),
      ...routeFeatures
    ]
  };
}

export const TwinMapBasemap: React.FC<Props> = ({ city, flood, routes, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const geojson = useMemo(() => buildGeoJson(city, flood, routes), [city, flood, routes]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let cancelled = false;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DEFAULT_STYLE,
      center: RIVERBEND_CENTER,
      zoom: 13.2,
      attributionControl: { compact: true }
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('error', (event: maplibregl.ErrorEvent) => {
      if (cancelled) return;
      const message =
        event.error?.message ??
        'Map tiles could not be loaded. The 3D simulation and data panels remain fully available.';
      setMapError(message);
    });

    map.on('load', () => {
      if (cancelled) return;
      setMapReady(true);

      map.addSource('twin-district', {
        type: 'geojson',
        data: geojson
      });

      map.addLayer({
        id: 'twin-roads',
        type: 'line',
        source: 'twin-district',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: {
          'line-color': [
            'case',
            ['has', 'accessible'],
            ['case', ['get', 'accessible'], '#64748B', '#DC2626'],
            '#2563EB'
          ],
          'line-width': ['case', ['has', 'reachable'], 4, 3],
          'line-opacity': 0.85
        }
      });

      map.addLayer({
        id: 'twin-buildings',
        type: 'circle',
        source: 'twin-district',
        filter: ['all', ['==', ['geometry-type'], 'Point'], ['has', 'category']],
        paint: {
          'circle-radius': 4,
          'circle-color': [
            'match',
            ['get', 'exposure'],
            'SEVERE',
            EXPOSURE_HEX.SEVERE,
            'MODERATE',
            EXPOSURE_HEX.MODERATE,
            'LOW',
            EXPOSURE_HEX.LOW,
            EXPOSURE_HEX.NONE
          ],
          'circle-stroke-color': '#0F172A',
          'circle-stroke-width': 0.5
        }
      });

      map.addLayer({
        id: 'twin-incidents',
        type: 'circle',
        source: 'twin-district',
        filter: ['all', ['==', ['geometry-type'], 'Point'], ['has', 'severity']],
        paint: {
          'circle-radius': 7,
          'circle-color': [
            'match',
            ['get', 'severity'],
            'Critical',
            SEVERITY_HEX.Critical,
            'High',
            SEVERITY_HEX.High,
            'Moderate',
            SEVERITY_HEX.Moderate,
            SEVERITY_HEX.Low
          ],
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 2
        }
      });
    });

    mapRef.current = map;

    return () => {
      cancelled = true;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- map instance is created once
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource('twin-district') as maplibregl.GeoJSONSource | undefined;
    source?.setData(geojson);
  }, [geojson, mapReady]);

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2 border-b border-line bg-white px-3 py-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
          MapLibre district map
        </p>
        <span className="text-[10px] text-ink-faint">Fictional coordinates · SIMULATED</span>
      </div>
      <div className="relative min-h-[180px] h-[200px] bg-surface-muted">
        <div ref={containerRef} className="absolute inset-0" aria-hidden="true" data-testid="twin-map-container" />
        {mapError && (
          <div
            role="status"
            className="absolute inset-0 flex items-center justify-center bg-white/90 px-4 text-center text-xs text-ink-muted"
            data-testid="twin-map-fallback"
          >
            {mapError}
          </div>
        )}
      </div>
      <p className="border-t border-line bg-surface-muted px-3 py-1.5 text-[10px] text-ink-faint">
        {city.graph.edges.length} modelled segments · {flood.stats.roads_impassable} impassable ·{' '}
        {routes.length} active route overlay(s). Keys:{' '}
        {city.graph.edges.slice(0, 2).map(edge => edgeKey(edge.from, edge.to)).join(', ')}…
      </p>
    </div>
  );
};
