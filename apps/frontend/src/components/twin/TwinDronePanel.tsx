import React from 'react';
import {
  CircleDot,
  CircleDashed,
  Eye,
  Gauge,
  MapPin,
  Play,
  RotateCcw,
  Route as RouteIcon,
  Satellite,
  Pause,
  Timer,
  Video
} from 'lucide-react';
import type { TwinDroneMission, TwinTone } from '@resq-ai/shared';
import { Badge, Button, Card, MetricTile, cx } from '../../ui';
import { SEVERITY_TONE } from './twinLayout';

/**
 * Feature 3 — Virtual drone reconnaissance.
 *
 * ⚠️ This is a SIMULATED flight plan. It does not control a real aircraft, and
 * no command leaves this page. The drone exists so a coordinator can rehearse
 * which blocks a sweep would verify first.
 */

interface Props {
  mission: TwinDroneMission;
  /** 0..1 progress along the planned flight path. */
  progress: number;
  running: boolean;
  cameraFollow: boolean;
  /** Ids of the inspection stops the simulated flight has already reached. */
  inspectedIds: Set<string>;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onToggleFollow: () => void;
}

const TONE_CLASS: Record<TwinTone, string> = {
  neutral: 'text-ink-muted',
  accent: 'text-accent',
  critical: 'text-critical',
  warning: 'text-warning',
  success: 'text-success',
  uncertain: 'text-uncertain'
};

export const TwinDronePanel: React.FC<Props> = ({
  mission,
  progress,
  running,
  cameraFollow,
  inspectedIds,
  onStart,
  onPause,
  onReset,
  onToggleFollow
}) => {
  const progressId = React.useId();
  const exposedCovered = mission.parameters.exposed_buildings_covered;

  return (
    <Card
      title="Virtual drone reconnaissance"
      description="A simulated sweep that flies the highest-priority blocks first, scored on incident severity, distance from base and reporting coverage gap."
      icon={Satellite}
      tone="uncertain"
      bodyClassName="space-y-3.5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          icon={running ? Pause : Play}
          onClick={running ? onPause : onStart}
          disabled={mission.total_points === 0}
          aria-pressed={running}
        >
          {running ? 'Pause mission' : 'Start mission'}
        </Button>
        <Button variant="secondary" icon={RotateCcw} onClick={onReset} disabled={progress === 0 && !running}>
          Reset flight
        </Button>
        <Button
          variant={cameraFollow ? 'primary' : 'secondary'}
          icon={Video}
          onClick={onToggleFollow}
          aria-pressed={cameraFollow}
        >
          {cameraFollow ? 'Camera following drone' : 'Follow the drone'}
        </Button>
      </div>

      <div>
        <div className="flex items-center justify-between text-[11px] font-semibold text-ink-subtle">
          <label htmlFor={progressId}>Flight progress</label>
          <span data-metric className="tabular-nums text-ink">
            {Math.round(progress * 100)}%
          </span>
        </div>
        <div
          id={progressId}
          role="progressbar"
          aria-label="Simulated drone flight progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
        >
          <div
            className="h-full rounded-full bg-uncertain transition-[width] duration-300"
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <MetricTile
          label="Inspection stops"
          value={mission.total_points}
          icon={MapPin}
          tone="uncertain"
          help="Planned, highest priority first"
        />
        <MetricTile
          label="Building coverage"
          value={mission.coverage.coverage_pct}
          unit="%"
          icon={Eye}
          tone="accent"
          help={`${mission.coverage.buildings_inspected} of ${mission.coverage.buildings_total} modelled buildings`}
        />
        <MetricTile
          label="Flight path"
          value={mission.path_length_m.toLocaleString('en-US')}
          unit="m"
          icon={RouteIcon}
          tone="neutral"
          help="Base → stops → end of sweep"
        />
        <MetricTile
          label="Mission time"
          value={mission.estimated_minutes}
          unit="min"
          icon={Timer}
          tone="neutral"
          help={`At ${mission.parameters.speed_m_per_min} m/min modelled cruise`}
        />
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div className="rounded-card border border-line bg-surface-muted px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
            <Gauge className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
            Coverage statistics
          </p>
          <dl className="mt-1.5 space-y-1 text-[11px]">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-ink-subtle">Incidents covered</dt>
              <dd data-metric className="font-semibold tabular-nums text-ink">
                {mission.coverage.incidents_covered} of {mission.coverage.incidents_total}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-ink-subtle">Exposed buildings swept</dt>
              <dd data-metric className="font-semibold tabular-nums text-ink">
                {exposedCovered}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-ink-subtle">Stops reached</dt>
              <dd data-metric className="font-semibold tabular-nums text-ink">
                {inspectedIds.size} of {mission.total_points}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-card border border-line bg-surface-muted px-3 py-2.5">
          <p className="text-[11px] font-semibold text-ink">Priority weights</p>
          <dl className="mt-1.5 space-y-1 text-[11px]">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-ink-subtle">Incident severity</dt>
              <dd data-metric className="font-semibold tabular-nums text-ink">
                {Math.round(mission.parameters.severity_weight * 100)}%
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-ink-subtle">Proximity to base</dt>
              <dd data-metric className="font-semibold tabular-nums text-ink">
                {Math.round(mission.parameters.proximity_weight * 100)}%
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-ink-subtle">Reporting coverage gap</dt>
              <dd data-metric className="font-semibold tabular-nums text-ink">
                {Math.round(mission.parameters.coverage_gap_weight * 100)}%
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
          Inspection plan, in flight order ({mission.points.length})
        </h3>
        {mission.points.length === 0 ? (
          <p className="mt-1.5 rounded-card border border-dashed border-line-strong bg-surface-muted px-3 py-3 text-center text-xs text-ink-subtle">
            No inspection stops were planned for this scenario.
          </p>
        ) : (
          <ol className="mt-1.5 space-y-1.5">
            {mission.points.map((point, index) => {
              const done = inspectedIds.has(point.id);
              const Icon = done ? CircleDot : CircleDashed;
              const tone: TwinTone = point.severity ? SEVERITY_TONE[point.severity] : 'neutral';
              return (
                <li
                  key={point.id}
                  className={cx(
                    'rounded-card border px-3 py-2',
                    done ? 'border-success-border bg-success-soft' : 'border-line bg-surface'
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon
                      className={cx('h-3.5 w-3.5 shrink-0', done ? 'text-success' : 'text-ink-faint')}
                      aria-hidden="true"
                    />
                    <span className="text-xs font-semibold text-ink">
                      {index + 1}. {point.label}
                    </span>
                    <span className="sr-only">{done ? 'Inspected' : 'Not yet inspected'}</span>
                    {point.severity && (
                      <Badge tone={tone} icon={MapPin} srPrefix="Zone severity">
                        {point.severity}
                      </Badge>
                    )}
                    <span className={cx('ml-auto flex items-center gap-1 text-[11px] font-semibold', TONE_CLASS.uncertain)}>
                      priority
                      <span data-metric className="tabular-nums">
                        {point.priority}
                      </span>
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-ink-subtle leading-4">
                    {point.distance_from_base_m.toLocaleString('en-US')} m from base · {point.reasons[0]}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <p className="flex items-start gap-1.5 text-[11px] text-ink-subtle leading-4">
        <Satellite className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
        <span>
          Simulated flight plan only. ResQ AI does not operate an aircraft, and this mission dispatches nothing.
        </span>
      </p>
    </Card>
  );
};
