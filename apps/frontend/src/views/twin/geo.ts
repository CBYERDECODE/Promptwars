import type { Vec2 } from './sim/types';

/**
 * The synthetic city is placed at an arbitrary, clearly fictional anchor.
 * Local metres are converted to longitude/latitude with an equirectangular
 * approximation, which is accurate to well under a metre over 2 km.
 */
export const TWIN_ORIGIN = { lng: 0, lat: 0 };
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LNG = 111320 * Math.cos((TWIN_ORIGIN.lat * Math.PI) / 180);

export function toLngLat(p: Vec2): [number, number] {
  return [TWIN_ORIGIN.lng + p.x / M_PER_DEG_LNG, TWIN_ORIGIN.lat + p.y / M_PER_DEG_LAT];
}

export function ring(points: Vec2[]): [number, number][] {
  const coords = points.map(toLngLat);
  coords.push(coords[0]);
  return coords;
}

export function fromLngLat(lng: number, lat: number): Vec2 {
  return { x: (lng - TWIN_ORIGIN.lng) * M_PER_DEG_LNG, y: (lat - TWIN_ORIGIN.lat) * M_PER_DEG_LAT };
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
