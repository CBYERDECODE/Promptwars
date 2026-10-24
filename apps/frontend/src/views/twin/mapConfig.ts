import type { Vec2 } from './sim/types';

export interface CameraCommand {
  target: Vec2;
  zoom: number;
  pitch: number;
  bearing: number;
  nonce: number;
}

/** True when the browser can create a WebGL context (needed by MapLibre). */
export function webglAvailable(): boolean {
  if (typeof window === 'undefined' || typeof WebGLRenderingContext === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export const HOME_VIEW = { zoom: 14.6, pitch: 58, bearing: -20 };

