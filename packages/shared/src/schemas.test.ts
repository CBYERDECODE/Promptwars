import { describe, it, expect } from 'vitest';
import { GeminiExtractionOutputSchema } from './schemas.js';

const baseExtraction = {
  incident_type: 'FLOOD' as const,
  summary: 'A valid summary used for schema validation',
  reported_location: null,
  hazard_indicators: [],
  access_constraints: [],
  missing_information: [],
  conflicting_information: []
};

describe('SafeTimestampSchema (reported_at)', () => {
  it('replaces an empty reported_at with a valid ISO-8601 timestamp', () => {
    const parsed = GeminiExtractionOutputSchema.parse({ ...baseExtraction, reported_at: '' });
    expect(parsed.reported_at.trim().length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(parsed.reported_at))).toBe(false);
  });

  it('replaces whitespace-only, unparseable, null, and missing reported_at safely', () => {
    for (const bad of ['   ', 'not-a-real-timestamp', null, undefined]) {
      const parsed = GeminiExtractionOutputSchema.parse({ ...baseExtraction, reported_at: bad });
      expect(parsed.reported_at.trim().length).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(parsed.reported_at))).toBe(false);
    }
  });

  it('normalises a valid non-ISO timestamp to ISO-8601', () => {
    const parsed = GeminiExtractionOutputSchema.parse({
      ...baseExtraction,
      reported_at: '2026-03-04T10:00:00Z'
    });
    expect(parsed.reported_at).toBe('2026-03-04T10:00:00.000Z');
  });
});
