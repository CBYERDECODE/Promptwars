export type LocationConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

const STREET_SUFFIXES =
  'street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd|highway|hwy|way|court|ct|place|pl|terrace|ter|circle|cir|square|sq|parkway|pkwy|expressway|freeway|motorway';

const STREET_SUFFIX_REGEX = new RegExp(`\\b(?:${STREET_SUFFIXES})\\b\\.?`, 'i');

const HOUSE_NUMBER_STREET_REGEX = new RegExp(
  `\\b\\d{1,6}\\s+[A-Za-z0-9'\\u2019\\-]+(?:\\s+[A-Za-z0-9'\\u2019\\-]+){0,3}\\s+(?:${STREET_SUFFIXES})\\b`,
  'i'
);

/**
 * Deterministic location-quality assessment.
 *
 * IMPORTANT: string length is NEVER used as a proxy for confidence. A long string that
 * merely contains a location preposition or a sentence fragment is rated LOW. Only a
 * structurally address-like or multi-part structured string can reach HIGH.
 */
export function assessLocationConfidence(location: string | null | undefined): LocationConfidence {
  if (!location) return 'LOW';
  const trimmed = location.trim();
  if (trimmed.length === 0) return 'LOW';

  const components = trimmed.split(',').map(part => part.trim()).filter(part => part.length > 0);

  // HIGH: a structured street address (house number + name + street suffix), or a
  // multi-part address that also names a street.
  if (HOUSE_NUMBER_STREET_REGEX.test(trimmed)) return 'HIGH';
  if (components.length >= 2 && STREET_SUFFIX_REGEX.test(trimmed)) return 'HIGH';

  // MEDIUM: a named street/venue with a recognizable suffix, or a multi-part locality.
  if (STREET_SUFFIX_REGEX.test(trimmed)) return 'MEDIUM';
  if (components.length >= 2) return 'MEDIUM';

  // LOW: anything else — a single generic word, a vague descriptor, or a sentence fragment.
  return 'LOW';
}
