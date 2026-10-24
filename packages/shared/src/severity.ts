/**
 * Severity ordering shared by the deterministic allocation, radar and replay
 * algorithms so that "most severe first" is defined in exactly one place.
 */

import { Severity } from './rescue.js';

/** Higher = more severe. Critical 4 … Low 1. Used for both sorting and scoring. */
export function severityRank(severity: Severity): number {
  switch (severity) {
    case 'Critical':
      return 4;
    case 'High':
      return 3;
    case 'Moderate':
      return 2;
    case 'Low':
      return 1;
    default:
      return 0;
  }
}

/** Severities considered "high severity" for unattended-incident metrics. */
export const HIGH_SEVERITIES: ReadonlyArray<Severity> = ['Critical', 'High'];

export function isHighSeverity(severity: Severity): boolean {
  return severity === 'Critical' || severity === 'High';
}
