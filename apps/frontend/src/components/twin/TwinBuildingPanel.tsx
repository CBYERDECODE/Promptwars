import React from 'react';
import {
  Ambulance,
  Building2,
  CircleAlert,
  Cross,
  Flame,
  Home,
  Layers,
  MousePointerClick,
  TriangleAlert,
  Users
} from 'lucide-react';
import type { TwinBuildingIntelligence, TwinNearbyResource } from '@resq-ai/shared';
import { EXPOSURE_TONE, RISK_HEX, RISK_TONE } from './twinLayout';
import { Badge, Card, EmptyState, MetricTile, cx } from '../../ui';

/**
 * Feature 4 — Interactive building intelligence.
 *
 * Everything here is read from the same deterministic model the 3D scene uses,
 * so a clicked block reports exactly the exposure that was drawn for it.
 *
 * ⚠️ SIMULATED: floors, occupant counts and flood depths are synthetic.
 */

interface Props {
  intelligence: TwinBuildingIntelligence | null;
  onClear: () => void;
}

const RESOURCE_ICON = {
  HOSPITAL: Cross,
  SHELTER: Home,
  FIRE_STATION: Flame,
  UNIT: Ambulance
} as const;

const RESOURCE_LABEL: Record<TwinNearbyResource['kind'], string> = {
  HOSPITAL: 'Hospital',
  SHELTER: 'Shelter',
  FIRE_STATION: 'Fire station',
  UNIT: 'Unit base'
};

export const TwinBuildingPanel: React.FC<Props> = ({ intelligence, onClear }) => {
  if (!intelligence) {
    return (
      <Card
        title="Building intelligence"
        description="Click any block in the 3D scene to inspect it."
        icon={Building2}
        bodyClassName="p-4"
      >
        <EmptyState
          icon={MousePointerClick}
          title="No building selected"
          description="Select a building in the 3D view to see its floors, modelled occupants, flood exposure, emergency reports, rescue status and nearest resources."
        />
      </Card>
    );
  }

  const { building, floods, floors, reports, incidents, rescue_status: rescueStatus, nearby_resources: resources, zone_name: zoneName } =
    intelligence;

  return (
    <Card
      title={building.label}
      description={`${zoneName} · building ${building.id}`}
      icon={Building2}
      tone={EXPOSURE_TONE[floods.exposure]}
      accentRail
      actions={
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] font-semibold text-accent underline-offset-2 hover:underline"
        >
          Clear
        </button>
      }
      bodyClassName="space-y-3.5"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral" icon={Building2} srPrefix="Building ID">
          {building.id}
        </Badge>
        <Badge tone="accent" icon={Layers} srPrefix="Category">
          {building.category.replace('_', ' ').toLowerCase()}
        </Badge>
        <Badge tone={EXPOSURE_TONE[floods.exposure]} icon={TriangleAlert} srPrefix="Disaster exposure">
          {floods.exposure}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <MetricTile label="Floors" value={building.floors} icon={Layers} tone="neutral" help={`${building.floor_height_m} m per floor`} />
        <MetricTile
          label="Modelled occupants"
          value={building.occupants}
          icon={Users}
          tone="neutral"
          help="Synthetic estimate"
        />
        <MetricTile
          label="Floors flooded"
          value={`${floods.flooded_floors}/${building.floors}`}
          icon={TriangleAlert}
          tone={floods.flooded_floors > 0 ? EXPOSURE_TONE[floods.exposure] : 'success'}
          help={`${Math.round(floods.exposure_ratio * 100)}% of occupants affected`}
        />
        <MetricTile
          label="Occupants on flooded floors"
          value={floods.exposed_occupants}
          icon={CircleAlert}
          tone={floods.exposed_occupants > 0 ? 'warning' : 'success'}
          help="Modelled, not confirmed"
        />
      </div>

      <p className="rounded-card border border-line bg-surface-muted px-3 py-2 text-[11px] text-ink-muted leading-4">
        {floods.reason}
      </p>

      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
          Floor-level risk ({floors.length} floors)
        </h3>
        <ul className="mt-1.5 space-y-1">
          {floors.map(floor => (
            <li key={floor.floor} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-[11px] font-semibold text-ink-subtle">Floor {floor.floor}</span>
              <span aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${
                      floor.risk === 'SAFE'
                        ? 6
                        : floor.risk === 'LOW'
                          ? 28
                          : floor.risk === 'MODERATE'
                            ? 52
                            : floor.risk === 'HIGH'
                              ? 78
                              : 100
                    }%`,
                    backgroundColor: RISK_HEX[floor.risk]
                  }}
                />
              </span>
              <span className="w-28 shrink-0 text-right">
                <Badge tone={RISK_TONE[floor.risk]} icon={TriangleAlert} srPrefix={`Floor ${floor.floor} risk`}>
                  {floor.risk}
                </Badge>
              </span>
              <span data-metric className="hidden w-16 shrink-0 text-right text-[11px] tabular-nums text-ink-muted sm:block">
                {floor.water_depth_m > 0 ? `${floor.water_depth_m} m` : 'dry'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-card border border-line bg-surface-muted px-3 py-2.5">
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
          <Ambulance className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
          Rescue status
        </h3>
        <p className="mt-1 text-xs font-semibold text-ink">{rescueStatus.status}</p>
        <p className="mt-0.5 text-[11px] text-ink-muted leading-4">{rescueStatus.detail}</p>
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
            Emergency reports ({reports.length})
          </h3>
          {reports.length === 0 ? (
            <p className="mt-1.5 rounded-card border border-dashed border-line-strong bg-surface-muted px-3 py-2.5 text-[11px] text-ink-subtle">
              No reports reached the coordinator from this neighbourhood. Silence is a data gap, not evidence of safety.
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1.5">
              {reports.slice(0, 6).map(report => (
                <li key={report.id} className="rounded-card border border-line bg-surface px-2.5 py-2">
                  <p className="text-[11px] text-ink leading-4">{report.summary}</p>
                  <p className="mt-0.5 text-[10px] text-ink-faint">
                    {report.id} · {new Date(report.reported_at).toLocaleTimeString()}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {incidents.length > 0 && (
            <>
              <h3 className="mt-3 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
                Confirmed incidents in this neighbourhood ({incidents.length})
              </h3>
              <ul className="mt-1.5 space-y-1">
                {incidents.map(incident => (
                  <li key={incident.id} className="text-[11px] text-ink-muted leading-4">
                    <span className="font-semibold text-ink">{incident.severity}</span> — {incident.title}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">Nearby resources</h3>
          <div className="mt-1.5 overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Nearest modelled facilities and unit bases, with straight-line distance</caption>
              <thead>
                <tr className="border-b border-line">
                  {['Resource', 'Type', 'Distance'].map(column => (
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
                {resources.map(resource => {
                  const Icon = RESOURCE_ICON[resource.kind];
                  return (
                    <tr key={`${resource.kind}-${resource.label}`} className="border-b border-line last:border-b-0 align-top">
                      <th scope="row" className="px-2 py-2 text-[11px] font-semibold text-ink">
                        <span className="flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                          {resource.label}
                        </span>
                        <span className="mt-0.5 block text-[10px] font-normal text-ink-subtle">{resource.detail}</span>
                      </th>
                      <td className="px-2 py-2 text-[11px] text-ink-muted whitespace-nowrap">
                        {RESOURCE_LABEL[resource.kind]}
                      </td>
                      <td data-metric className="px-2 py-2 text-[11px] font-semibold tabular-nums text-ink whitespace-nowrap">
                        {resource.distance_m.toLocaleString('en-US')} m
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <p className={cx('text-[11px] text-ink-subtle leading-4')}>
        Distances are straight-line across the modelled district, not travelled road distance.
      </p>
    </Card>
  );
};
