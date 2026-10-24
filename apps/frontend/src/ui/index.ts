/**
 * ResQ AI UI primitives.
 *
 * Every view in the rescue-intelligence surface is built from these, so spacing,
 * focus treatment, target sizes, tone semantics and the mandatory loading /
 * empty / error / offline states stay identical across the product.
 *
 * Rule enforced by this layer: a status is NEVER communicated by colour alone.
 * `Badge`, `MetricTile`, `DiffRow`, `ConfidenceMeter` and `Button` all pair a
 * tone with an icon and a text label.
 */

export { Badge } from './Badge';
export { Button, calloutClasses } from './Button';
export { Card } from './Card';
export { ConfidenceMeter } from './ConfidenceMeter';
export { Dialog } from './Dialog';
export { DiffRow } from './DiffRow';
export type { DiffDirection } from './DiffRow';
export { MetricTile } from './MetricTile';
export { Stepper } from './Stepper';
export type { StepDefinition } from './Stepper';
export { ToastProvider, useToast } from './Toast';
export type { ToastRecord } from './Toast';
export { ZoneMap } from './ZoneMap';
export {
  CardSkeleton,
  EmptyState,
  ErrorState,
  LoadingBlock,
  OfflineState,
  SimulatedNotice,
  Skeleton,
  UncertaintyNote
} from './states';
export { TONE_STYLES, cx } from './tones';
export type { Tone, ToneStyle } from './tones';
