import React from 'react';
import {
  CircleCheckBig,
  Droplets,
  Gauge,
  Route,
  TriangleAlert,
  Users,
  Waves
} from 'lucide-react';
import {
  TWIN_MAX_WATER_LEVEL_M,
  TWIN_ROAD_FREEBOARD_M,
  type TwinFloodAssessment
} from '@resq-ai/shared';
import { Badge, Card, MetricTile, cx } from '../../ui';

/**
 * Feature 1 — Dynamic flood simulation.
 *
 * The slider is the whole model input. Every figure on this panel and every
 * colour in the 3D scene beside it is derived from `assessTwinFlood`, so the
 * panel and the scene can never disagree.
 *
 * ⚠️ SIMULATED: water level is a modelled scenario input, not a forecast.
 */

interface Props {
  /** Current modelled water level in metres. */
  waterLevel: number;
  onWaterLevelChange: (waterLevel: number) => void;
  flood: TwinFloodAssessment;
  /** True while the demo is driving the slider, so controls are locked. */
  locked?: boolean;
}

export const TwinFloodPanel: React.FC<Props> = ({ waterLevel, onWaterLevelChange, flood, locked = false }) => {
  const sliderId = React.useId();
  const impassable = flood.roads.filter(road => !road.accessible);

  const tone: 'success' | 'accent' | 'warning' | 'critical' =
    flood.stats.buildings_severely_exposed > 0
      ? 'critical'
      : flood.stats.buildings_exposed > 0
        ? 'warning'
        : 'success';

  return (
    <Card
      title="Dynamic flood simulation"
      description="Raise the modelled water level and the scene, the exposed-building count and the accessible road network all update from the same rule set."
      icon={Waves}
      tone={tone}
      bodyClassName="space-y-3.5"
    >
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <label htmlFor={sliderId} className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
            Modelled water level
          </label>
          <span className="flex items-baseline gap-1">
            <span data-metric className="text-lg font-bold tabular-nums text-ink">
              {waterLevel.toFixed(1)}
            </span>
            <span className="text-xs font-medium text-ink-subtle">m above datum</span>
          </span>
        </div>

        <input
          id={sliderId}
          type="range"
          min={0}
          max={TWIN_MAX_WATER_LEVEL_M}
          step={0.1}
          value={waterLevel}
          disabled={locked}
          aria-describedby={`${sliderId}-help`}
          aria-valuetext={`${waterLevel.toFixed(1)} metres`}
          onChange={event => onWaterLevelChange(Number(event.target.value))}
          style={{ accentColor: '#2563EB' }}
          className="mt-2 h-6 w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        />

        <div className="flex items-center justify-between text-[10px] text-ink-faint">
          <span>0 m — dry</span>
          <span>{TWIN_MAX_WATER_LEVEL_M} m — extreme</span>
        </div>

        <p id={`${sliderId}-help`} className="mt-1 text-[11px] text-ink-subtle leading-4">
          {flood.framing}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <MetricTile
          label="Buildings exposed"
          value={flood.stats.buildings_exposed}
          unit={`of ${flood.stats.buildings_total}`}
          icon={Droplets}
          tone={flood.stats.buildings_exposed > 0 ? 'warning' : 'success'}
          help="Ground floor at or below the modelled water level"
        />
        <MetricTile
          label="Severely exposed"
          value={flood.stats.buildings_severely_exposed}
          icon={TriangleAlert}
          tone={flood.stats.buildings_severely_exposed > 0 ? 'critical' : 'success'}
          help="More than 60% of floors flooded"
        />
        <MetricTile
          label="Occupants on flooded floors"
          value={flood.stats.exposed_occupants}
          icon={Users}
          tone={flood.stats.exposed_occupants > 0 ? 'warning' : 'success'}
          help="Modelled, not confirmed"
        />
        <MetricTile
          label="Roads impassable"
          value={flood.stats.roads_impassable}
          unit={`of ${flood.stats.roads_total}`}
          icon={Route}
          tone={flood.stats.roads_impassable > 0 ? 'critical' : 'success'}
          help={`Depth over the deck exceeds the ${TWIN_ROAD_FREEBOARD_M} m freeboard`}
        />
      </div>

      <div className="rounded-card border border-line bg-surface-muted px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
          <Gauge className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
          The two rules that produce every number above
        </p>
        <ul className="mt-1.5 space-y-1 text-[11px] text-ink-muted leading-4">
          <li>
            • A building floods once water reaches its ground elevation. Flooded floors ={' '}
            <code className="font-mono">ceil(depth ÷ floor height)</code>, capped at the building height.
          </li>
          <li>
            • A road segment is impassable once water is more than{' '}
            <code className="font-mono">{TWIN_ROAD_FREEBOARD_M} m</code> above its modelled deck elevation.
          </li>
        </ul>
      </div>

      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
          Impassable segments ({impassable.length})
        </h3>
        {impassable.length === 0 ? (
          <p className="mt-1.5 flex items-center gap-2 rounded-card border border-success-border bg-success-soft px-3 py-2 text-xs font-semibold text-ink">
            <CircleCheckBig className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
            Every modelled road segment is passable at this water level.
          </p>
        ) : (
          <div className="mt-1.5 overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">
                Road segments that are impassable at the current modelled water level, with the depth over the deck and
                the reason
              </caption>
              <thead>
                <tr className="border-b border-line bg-surface-muted">
                  {['Segment', 'Depth', 'Why'].map(column => (
                    <th
                      key={column}
                      scope="col"
                      className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-subtle whitespace-nowrap"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {impassable.map(road => (
                  <tr key={road.edge_key} className="border-b border-line last:border-b-0 align-top">
                    <th scope="row" className="px-2 py-2 text-xs font-semibold text-ink whitespace-nowrap">
                      {road.label}
                    </th>
                    <td
                      data-metric
                      className={cx('px-2 py-2 text-xs font-semibold tabular-nums whitespace-nowrap', 'text-critical')}
                    >
                      {road.water_depth_m} m
                    </td>
                    <td className="px-2 py-2 text-[11px] text-ink-muted leading-4">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge tone="critical" icon={TriangleAlert} srPrefix="Road status">
                          Impassable
                        </Badge>
                        <span>{road.reason}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
};
