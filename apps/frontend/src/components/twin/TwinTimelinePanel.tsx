import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Ambulance,
  CircleAlert,
  Droplets,
  GitCompareArrows,
  History,
  Milestone,
  Pause,
  Play,
  Rewind,
  Route,
  TriangleAlert,
  Users
} from 'lucide-react';
import type { TwinEventKind, TwinTone, TwinTimeline } from '@resq-ai/shared';
import { Badge, Button, Card, MetricTile } from '../../ui';

/**
 * Feature 5 — Disaster time machine.
 *
 * Each frame is produced by the *same* engines the live view uses, so scrubbing
 * the timeline moves the water slider, re-closes the segments that were closed
 * at that moment and re-plans the response. The replay cannot drift from the
 * interactive result.
 *
 * ⚠️ SIMULATED: this replays a scripted synthetic disaster, not a record of a
 * real event.
 */

interface Props {
  timeline: TwinTimeline;
  index: number;
  playing: boolean;
  onIndexChange: (index: number) => void;
  onTogglePlay: () => void;
  onRestart: () => void;
  /** True while the one-click demo drives the timeline. */
  locked?: boolean;
}

const KIND_META: Record<TwinEventKind, { icon: LucideIcon; label: string; tone: TwinTone }> = {
  INCIDENT: { icon: TriangleAlert, label: 'Incident', tone: 'critical' },
  FLOOD: { icon: Droplets, label: 'Flood', tone: 'warning' },
  ROAD_CLOSURE: { icon: Milestone, label: 'Road closure', tone: 'critical' },
  ASSIGNMENT: { icon: Ambulance, label: 'Assignment', tone: 'accent' },
  ROUTE_CHANGE: { icon: GitCompareArrows, label: 'Route change', tone: 'warning' },
  RECOMMENDATION: { icon: CircleAlert, label: 'Recommendation', tone: 'critical' }
};

export const TwinTimelinePanel: React.FC<Props> = ({
  timeline,
  index,
  playing,
  onIndexChange,
  onTogglePlay,
  onRestart,
  locked = false
}) => {
  const sliderId = React.useId();
  const frame = timeline.frames[Math.min(Math.max(index, 0), timeline.frames.length - 1)];
  const last = timeline.frames.length - 1;

  return (
    <Card
      title="Disaster time machine"
      description="Replay the simulated emergency from first incident to final recommendation, frame by frame. Scrubbing moves the flood and the closures with it."
      icon={History}
      tone="uncertain"
      bodyClassName="space-y-3.5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={playing ? 'secondary' : 'primary'}
          icon={playing ? Pause : Play}
          onClick={onTogglePlay}
          disabled={locked}
          aria-pressed={playing}
        >
          {playing ? 'Pause' : 'Play'}
        </Button>
        <Button variant="secondary" icon={Rewind} onClick={onRestart} disabled={locked}>
          Restart
        </Button>
        <span className="ml-auto text-[11px] text-ink-subtle">
          Frame {index + 1} of {timeline.frames.length}
        </span>
      </div>

      <div>
        <label htmlFor={sliderId} className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
          Timeline ({timeline.duration_minutes} modelled minutes)
        </label>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={last}
          step={1}
          value={index}
          disabled={locked}
          aria-valuetext={frame.label}
          onChange={event => onIndexChange(Number(event.target.value))}
          style={{ accentColor: '#2563EB' }}
          className="mt-1.5 h-6 w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        />
        <div className="flex items-center justify-between text-[10px] text-ink-faint">
          <span>{timeline.frames[0].label}</span>
          <span>{timeline.frames[last].label}</span>
        </div>
      </div>

      <p data-testid="twin-timeline-frame-label" className="text-xs font-semibold text-ink">
        {frame.label} · {frame.events.length} event(s)
      </p>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <MetricTile label="Buildings exposed" value={frame.snapshot.buildings_exposed} icon={Droplets} tone="warning" />
        <MetricTile label="Occupants on flooded floors" value={frame.snapshot.exposed_occupants} icon={Users} tone="warning" />
        <MetricTile label="Roads impassable" value={frame.snapshot.roads_impassable} icon={Route} tone="critical" />
        <MetricTile
          label="Units assigned"
          value={frame.snapshot.assigned}
          icon={Ambulance}
          tone="accent"
          help={
            frame.snapshot.avg_response_minutes === null
              ? 'No average available'
              : `avg ${frame.snapshot.avg_response_minutes} min`
          }
        />
      </div>

      {frame.snapshot.unreachable_incidents > 0 && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-card border border-critical-border bg-critical-soft px-3 py-2.5 text-[11px] text-ink"
        >
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-critical" aria-hidden="true" />
          <span>
            {frame.snapshot.unreachable_incidents} incident(s) have no road route at this point in the replay and need a
            human routing decision.
          </span>
        </p>
      )}

      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
          What happened at {frame.label}
        </h3>
        <ul className="mt-1.5 space-y-1.5">
          {frame.events.map(event => {
            const meta = KIND_META[event.kind];
            return (
              <li key={event.id} className="rounded-card border border-line bg-surface px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={meta.tone} icon={meta.icon} srPrefix="Event type">
                    {meta.label}
                  </Badge>
                  <span className="text-xs font-semibold text-ink">{event.title}</span>
                  <span className="ml-auto text-[10px] tabular-nums text-ink-faint">T+{event.offset_minutes} min</span>
                </div>
                <p className="mt-1 text-[11px] text-ink-muted leading-4">{event.detail}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
};
