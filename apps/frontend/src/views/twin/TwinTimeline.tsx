import { Pause, Play, RotateCcw, Square } from 'lucide-react';
import { Badge, Button, cx } from '../../ui';
import type { Timeline, TimelineEventKind } from './sim/timeline';
import { TIMELINE_DURATION_MIN } from './sim/timeline';

const KIND_TONE: Record<TimelineEventKind, 'critical' | 'warning' | 'accent' | 'success' | 'neutral'> = {
  incident: 'critical',
  flood: 'accent',
  closure: 'warning',
  reopen: 'success',
  assignment: 'accent',
  route_change: 'warning',
  unreachable: 'critical'
};

const KIND_LABEL: Record<TimelineEventKind, string> = {
  incident: 'Incident',
  flood: 'Flood',
  closure: 'Closure',
  reopen: 'Reopened',
  assignment: 'Assignment',
  route_change: 'Route change',
  unreachable: 'Unreachable'
};

export interface TimelineProps {
  timeline: Timeline | null;
  active: boolean;
  loading: boolean;
  minute: number;
  playing: boolean;
  recommendations: string[];
  onStart: () => void;
  onExit: () => void;
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
  onSeek: (m: number) => void;
}

export function TwinTimeline(p: TimelineProps) {
  if (!p.active || !p.timeline) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-muted">Replay a scripted 90-minute flood: incidents appear, water rises, roads and bridges close, resources are reassigned and routes change. One simulated minute plays per second.</p>
        <Button variant="primary" size="sm" icon={Play} onClick={p.onStart} loading={p.loading} loadingLabel="Computing replay…">Replay disaster</Button>
      </div>
    );
  }
  const events = p.timeline.events.filter(e => e.minute <= p.minute).slice().reverse();
  const markers = p.timeline.events.filter(e => e.kind !== 'flood' || e.title.includes('Bridge'));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {p.playing ? <Button size="sm" icon={Pause} onClick={p.onPause}>Pause</Button> : <Button size="sm" variant="primary" icon={Play} onClick={p.onPlay}>{p.minute >= TIMELINE_DURATION_MIN ? 'Replay again' : 'Play'}</Button>}
        <Button size="sm" variant="ghost" icon={RotateCcw} onClick={p.onRestart}>Restart</Button>
        <Button size="sm" variant="ghost" icon={Square} onClick={p.onExit}>Exit replay</Button>
        <span className="ml-auto text-sm font-semibold tabular-nums text-ink">T+{p.minute} min <span className="font-normal text-ink-muted">/ {TIMELINE_DURATION_MIN}</span></span>
      </div>
      <div className="relative">
        <input
          type="range"
          min={0}
          max={TIMELINE_DURATION_MIN}
          step={1}
          value={p.minute}
          onChange={e => p.onSeek(Number(e.target.value))}
          className="w-full accent-blue-600"
          aria-label="Replay timeline minute"
        />
        <div className="pointer-events-none relative h-2">
          {markers.map((e, i) => (
            <span key={i} className={cx('absolute top-0 h-2 w-0.5', e.kind === 'incident' || e.kind === 'unreachable' ? 'bg-red-500' : e.kind === 'closure' ? 'bg-amber-500' : 'bg-blue-400')} style={{ left: `${(e.minute / TIMELINE_DURATION_MIN) * 100}%` }} />
          ))}
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ol className="max-h-44 space-y-1 overflow-auto pr-1 text-xs" aria-label="Replay events">
          {events.map((e, i) => (
            <li key={`${e.minute}-${i}`}>
              <button type="button" className="flex w-full items-start gap-2 rounded px-1 py-0.5 text-left hover:bg-surface-sunken" onClick={() => p.onSeek(e.minute)}>
                <span className="w-10 shrink-0 tabular-nums text-ink-subtle">T+{e.minute}</span>
                <Badge tone={KIND_TONE[e.kind]}>{KIND_LABEL[e.kind]}</Badge>
                <span className="text-ink"><strong>{e.title}</strong> <span className="text-ink-muted">{e.detail}</span></span>
              </button>
            </li>
          ))}
        </ol>
        <div className="rounded-md border border-line bg-surface-sunken px-3 py-2 text-xs">
          <p className="font-semibold text-ink">Updated response recommendations at T+{p.minute}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-ink-muted">
            {p.recommendations.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}
