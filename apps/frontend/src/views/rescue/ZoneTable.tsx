import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { RadarDetailResult, SimulationDataset } from '@resq-ai/shared';
import { Badge, ConfidenceMeter, cx } from '../../ui';

type ZoneRow = RadarDetailResult['zones'][number];

type SortKey =
  | 'zone_name'
  | 'priority_score'
  | 'confidence'
  | 'population'
  | 'reports_observed'
  | 'reporting_gap'
  | 'nearest_incident_minutes';

const CONFIDENCE_RANK = { Low: 0, Medium: 1, High: 2 } as const;

interface Column {
  key: SortKey;
  label: string;
  numeric: boolean;
}

const COLUMNS: Column[] = [
  { key: 'zone_name', label: 'Neighbourhood', numeric: false },
  { key: 'priority_score', label: 'Verification priority', numeric: true },
  { key: 'confidence', label: 'Confidence', numeric: true },
  { key: 'population', label: 'Sim. population', numeric: true },
  { key: 'reports_observed', label: 'Reports / expected', numeric: true },
  { key: 'reporting_gap', label: 'Reporting gap', numeric: true },
  { key: 'nearest_incident_minutes', label: 'Nearest incident', numeric: true }
];

function valueFor(row: ZoneRow, key: SortKey): number | string {
  switch (key) {
    case 'zone_name':
      return row.zone_name;
    case 'confidence':
      return CONFIDENCE_RANK[row.confidence];
    case 'reporting_gap':
      return row.reports_expected - row.reports_observed;
    case 'nearest_incident_minutes':
      return row.nearest_incident_minutes ?? Number.POSITIVE_INFINITY;
    default:
      return row[key];
  }
}

interface Props {
  zones: ZoneRow[];
  dataset: SimulationDataset;
  selectedZoneId?: string | null;
  onSelectZone?: (zoneId: string) => void;
  className?: string;
}

/**
 * The accessible equivalent of the map.
 *
 * The SVG map is decorative; this table carries the same information in a
 * sortable, screen-reader-navigable form. Every column is sortable via a real
 * button, and the active sort direction is exposed with `aria-sort` so assistive
 * tech announces the current ordering.
 */
export const ZoneTable: React.FC<Props> = ({ zones, dataset, selectedZoneId = null, onSelectZone, className }) => {
  const [sortKey, setSortKey] = React.useState<SortKey>('priority_score');
  const [ascending, setAscending] = React.useState(false);

  const populationByZone = React.useMemo(
    () => new Map(dataset.zones.map(zone => [zone.id, zone.population])),
    [dataset.zones]
  );

  const sorted = React.useMemo(() => {
    const rows = zones.map(zone => ({
      ...zone,
      population: zone.population || populationByZone.get(zone.zone_id) || 0
    }));
    rows.sort((a, b) => {
      const left = valueFor(a, sortKey);
      const right = valueFor(b, sortKey);
      let comparison: number;
      if (typeof left === 'string' || typeof right === 'string') {
        comparison = String(left).localeCompare(String(right));
      } else {
        comparison = left - right;
      }
      if (comparison === 0) comparison = a.zone_id.localeCompare(b.zone_id);
      return ascending ? comparison : -comparison;
    });
    return rows;
  }, [zones, sortKey, ascending, populationByZone]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setAscending(current => !current);
    } else {
      setSortKey(key);
      setAscending(key === 'zone_name');
    }
  };

  if (zones.length === 0) {
    return null;
  }

  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">
          Verification priority for every simulated neighbourhood. Sortable by column. Flagged zones warrant verification
          only — a high score is never a claim that people are trapped.
        </caption>
        <thead>
          <tr className="border-b border-line">
            {COLUMNS.map(column => (
              <th
                key={column.key}
                scope="col"
                aria-sort={sortKey === column.key ? (ascending ? 'ascending' : 'descending') : 'none'}
                className="px-2 py-2 whitespace-nowrap"
              >
                <button
                  type="button"
                  onClick={() => toggleSort(column.key)}
                  className={cx(
                    'inline-flex min-h-[32px] items-center gap-1 rounded-control px-1 text-[10px] font-bold uppercase tracking-wide transition duration-fast',
                    sortKey === column.key ? 'text-accent-strong' : 'text-ink-subtle hover:text-ink',
                    column.numeric ? 'justify-end' : 'justify-start'
                  )}
                >
                  <span>{column.label}</span>
                  {sortKey === column.key ? (
                    ascending ? (
                      <ChevronUp className="h-3 w-3 shrink-0" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
                    )
                  ) : null}
                </button>
              </th>
            ))}
            <th scope="col" className="px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-ink-subtle">
              Missing inputs
            </th>
            <th scope="col" className="px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-ink-subtle">
              First verification action
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(zone => {
            const flagged = zone.priority_score >= 50;
            const isSelected = selectedZoneId === zone.zone_id;
            return (
              <tr
                key={zone.zone_id}
                className={cx('border-b border-line last:border-b-0 align-top', isSelected && 'bg-accent-soft')}
              >
                <th scope="row" className="px-2 py-2 text-xs font-semibold text-ink whitespace-nowrap">
                  {onSelectZone ? (
                    <button
                      type="button"
                      onClick={() => onSelectZone(zone.zone_id)}
                      className="min-h-[32px] rounded-control px-1 text-left text-xs font-semibold text-accent-strong hover:underline"
                    >
                      {zone.zone_name}
                      <span className="sr-only"> — show evidence on the map and in the detail panel</span>
                    </button>
                  ) : (
                    zone.zone_name
                  )}
                  {flagged && (
                    <span className="mt-0.5 block">
                      <Badge tone="uncertain" size="sm">
                        Warrants verification
                      </Badge>
                    </span>
                  )}
                </th>
                <td data-metric className="px-2 py-2 text-xs tabular-nums font-bold text-ink">
                  {zone.priority_score}/100
                </td>
                <td className="px-2 py-2 min-w-[9rem]">
                  <ConfidenceMeter confidence={zone.confidence} label="Confidence" />
                </td>
                <td data-metric className="px-2 py-2 text-xs tabular-nums text-ink-muted">
                  {zone.population ? zone.population.toLocaleString('en-US') : '—'}
                </td>
                <td data-metric className="px-2 py-2 text-xs tabular-nums text-ink-muted whitespace-nowrap">
                  {zone.reports_observed} / {zone.reports_expected}
                </td>
                <td className="px-2 py-2">
                  {zone.reports_observed === 0 ? (
                    <Badge tone="uncertain" size="sm">
                      No reports — data gap
                    </Badge>
                  ) : (
                    <span data-metric className="text-xs tabular-nums text-ink-muted">
                      {Math.max(0, Math.round((1 - zone.reports_observed / Math.max(zone.reports_expected, 0.1)) * 100))}%
                      short
                    </span>
                  )}
                </td>
                <td data-metric className="px-2 py-2 text-xs tabular-nums text-ink-muted whitespace-nowrap">
                  {zone.nearest_incident_minutes === null ? 'No modelled route' : `${zone.nearest_incident_minutes} min`}
                </td>
                <td className="px-2 py-2 text-[11px] text-ink-muted min-w-[12rem]">
                  {zone.missing_data.length === 0 ? 'None' : `${zone.missing_data.length} item(s)`}
                </td>
                <td className="px-2 py-2 text-[11px] text-ink-muted min-w-[16rem]">
                  {zone.recommended_verification_actions[0] ?? 'Add to the next verification sweep.'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
