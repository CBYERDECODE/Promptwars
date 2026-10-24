import React from 'react';
import {
  AllocationPlan,
  RadarDetailResult,
  Severity,
  SimulationDataset,
  edgeKey
} from '@resq-ai/shared';
import { TONE_STYLES, cx } from './tones';

type ZoneAssessmentDetail = RadarDetailResult['zones'][number];

interface Props {
  dataset: SimulationDataset;
  /** Radar assessments keyed by zone, used for fill, hatching and the tooltip. */
  assessments: ZoneAssessmentDetail[];
  /** Scenario road closures (`"a|b"`, alphabetically sorted). */
  blockedEdgeKeys?: string[];
  /** Optional allocation overlay: draws a route per unit → incident pairing. */
  plan?: AllocationPlan | null;
  selectedZoneId?: string | null;
  onSelectZone?: (zoneId: string | null) => void;
  className?: string;
}

/**
 * Marker fills. These are graphical objects on a light surface, so the
 * requirement is 3:1 against adjacent colours rather than text contrast, and
 * every marker is also labelled in the HTML legend and in the zone table.
 */
const SEVERITY_FILL: Record<Severity, string> = {
  Critical: '#B91C1C',
  High: '#EA580C',
  Moderate: '#B45309',
  Low: '#15803D'
};

const SEVERITY_ORDER: Severity[] = ['Critical', 'High', 'Moderate', 'Low'];

/** Verification threshold shipped by the shared radar parameters. */
const FLAG_THRESHOLD = 50;

function polygonPoints(points: Array<{ x: number; y: number }>): string {
  return points.map(point => `${point.x},${point.y}`).join(' ');
}

function polygonCentroid(points: Array<{ x: number; y: number }>): { x: number; y: number } {
  if (points.length === 0) return { x: FLAG_THRESHOLD, y: FLAG_THRESHOLD };
  const total = points.reduce((accumulator, point) => ({ x: accumulator.x + point.x, y: accumulator.y + point.y }), {
    x: 0,
    y: 0
  });
  return { x: total.x / points.length, y: total.y / points.length };
}

/**
 * Deterministic small offset so several incidents sharing one node do not
 * stack into a single unreadable marker.
 */
function markerOffset(index: number): { dx: number; dy: number } {
  const ring = Math.floor(index / 4);
  const slot = index % 4;
  const angles = [-135, -45, 45, 135];
  const radians = (angles[slot] * Math.PI) / 180;
  const radius = 3 + ring * 2.5;
  return { dx: Math.cos(radians) * radius, dy: Math.sin(radians) * radius };
}

/**
 * Dependency-free schematic map of the simulated district.
 *
 * ACCESSIBILITY: the SVG itself is decorative (`aria-hidden`) because an SVG
 * cannot carry a sortable, screen-reader-navigable table. The equivalent data is
 * rendered as a real table by the calling view — that table is the accessible
 * representation, and the map is the visual convenience. Hovering a zone shows a
 * score breakdown; the same breakdown is available from the table for keyboard
 * and screen-reader users.
 */
export const ZoneMap: React.FC<Props> = ({
  dataset,
  assessments,
  blockedEdgeKeys = [],
  plan = null,
  selectedZoneId = null,
  onSelectZone,
  className
}) => {
  const [hovered, setHovered] = React.useState<string | null>(null);

  const assessmentByZone = React.useMemo(
    () => new Map(assessments.map(assessment => [assessment.zone_id, assessment])),
    [assessments]
  );
  const nodeById = React.useMemo(() => new Map(dataset.graph.nodes.map(node => [node.id, node])), [dataset.graph.nodes]);

  const blocked = React.useMemo(() => {
    const set = new Set(blockedEdgeKeys);
    for (const edge of dataset.graph.edges) {
      if (edge.blocked) set.add(edgeKey(edge.from, edge.to));
    }
    return set;
  }, [blockedEdgeKeys, dataset.graph.edges]);

  const reportsByZone = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const report of dataset.reports) counts.set(report.zone_id, (counts.get(report.zone_id) ?? 0) + 1);
    return counts;
  }, [dataset.reports]);

  const maxReports = React.useMemo(
    () => dataset.reports.reduce((max, report) => Math.max(max, reportsByZone.get(report.zone_id) ?? 0), 0),
    [dataset.reports, reportsByZone]
  );

  /** Incidents grouped by node so overlapping markers can be spread out. */
  const incidentsByNode = React.useMemo(() => {
    const grouped = new Map<string, typeof dataset.incidents>();
    for (const incident of dataset.incidents) {
      const list = grouped.get(incident.node_id) ?? [];
      list.push(incident);
      grouped.set(incident.node_id, list);
    }
    return grouped;
  }, [dataset.incidents]);

  const assignmentLines = React.useMemo(() => {
    if (!plan) return [];
    return plan.assignments
      .map(assignment => {
        const unit = dataset.units.find(candidate => candidate.id === assignment.unit_id);
        const incident = dataset.incidents.find(candidate => candidate.id === assignment.incident_id);
        if (!unit || !incident) return null;
        const from = nodeById.get(unit.home_node);
        const to = nodeById.get(incident.node_id);
        if (!from || !to) return null;
        return { assignment, from, to };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }, [plan, dataset.units, dataset.incidents, nodeById]);

  const hoveredAssessment = hovered ? assessmentByZone.get(hovered) : undefined;
  const hoveredZone = hovered ? dataset.zones.find(zone => zone.id === hovered) : undefined;

  return (
    <div className={cx('relative w-full', className)}>
      <div className="w-full aspect-square max-h-[520px] mx-auto">
        <svg
          viewBox="0 0 100 100"
          role="presentation"
          aria-hidden="true"
          className="h-full w-full"
          onClick={() => onSelectZone?.(null)}
        >
          <defs>
            {/* Hatching marks "we do not know", never "danger". */}
            <pattern id="resq-hatch-low" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="4" stroke={TONE_STYLES.uncertain.hex} strokeWidth="1.4" />
            </pattern>
            <pattern id="resq-hatch-medium" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="7" stroke={TONE_STYLES.uncertain.hex} strokeWidth="0.8" />
            </pattern>
            <marker id="resq-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={TONE_STYLES.accent.hex} />
            </marker>
          </defs>

          {/* Canvas */}
          <rect x="0" y="0" width="100" height="100" rx="3" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="0.6" />

          {/* Road network */}
          <g>
            {dataset.graph.edges.map(edge => {
              const from = nodeById.get(edge.from);
              const to = nodeById.get(edge.to);
              if (!from || !to) return null;
              const isBlocked = blocked.has(edgeKey(edge.from, edge.to));
              return (
                <line
                  key={`${edge.from}-${edge.to}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={isBlocked ? TONE_STYLES.critical.hex : '#CBD5E1'}
                  strokeWidth={isBlocked ? 1.1 : 0.9}
                  strokeDasharray={isBlocked ? '2 1.6' : undefined}
                  strokeLinecap="round"
                />
              );
            })}
          </g>

          {/* Zones */}
          <g>
            {dataset.zones.map(zone => {
              const assessment = assessmentByZone.get(zone.id);
              const flagged = (assessment?.priority_score ?? 0) >= FLAG_THRESHOLD;
              const isSelected = selectedZoneId === zone.id;
              const isHovered = hovered === zone.id;
              return (
                <polygon
                  key={zone.id}
                  points={polygonPoints(zone.polygon)}
                  fill={flagged ? '#F5F3FF' : '#FFFFFF'}
                  fillOpacity={flagged ? 0.9 : 0.75}
                  stroke={flagged ? TONE_STYLES.uncertain.hex : '#CBD5E1'}
                  strokeWidth={isSelected ? 1.6 : 0.8}
                  className="cursor-pointer transition duration-fast"
                  onClick={event => {
                    event.stopPropagation();
                    onSelectZone?.(zone.id);
                  }}
                  onMouseEnter={() => setHovered(zone.id)}
                  onMouseLeave={() => setHovered(current => (current === zone.id ? null : current))}
                  style={isHovered && !isSelected ? { filter: 'brightness(0.97)' } : undefined}
                />
              );
            })}

            {/* Uncertainty hatching sits above the fill but below labels. */}
            {dataset.zones.map(zone => {
              const assessment = assessmentByZone.get(zone.id);
              if (!assessment) return null;
              const pattern =
                assessment.confidence === 'Low'
                  ? 'url(#resq-hatch-low)'
                  : assessment.confidence === 'Medium'
                    ? 'url(#resq-hatch-medium)'
                    : null;
              if (!pattern) return null;
              return (
                <polygon
                  key={`${zone.id}-hatch`}
                  points={polygonPoints(zone.polygon)}
                  fill={pattern}
                  fillOpacity={0.5}
                  stroke="none"
                  pointerEvents="none"
                />
              );
            })}
          </g>

          {/* Unit → incident routes (only when a plan is supplied) */}
          <g>
            {assignmentLines.map(({ assignment, from, to }) => (
              <line
                key={`${assignment.unit_id}-${assignment.incident_id}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={assignment.within_sla ? TONE_STYLES.accent.hex : TONE_STYLES.warning.hex}
                strokeWidth="1"
                strokeOpacity="0.85"
                strokeDasharray={assignment.within_sla ? undefined : '2.5 1.5'}
                markerEnd="url(#resq-arrow)"
              />
            ))}
          </g>

          {/* Responding units at their home nodes */}
          <g>
            {dataset.units.map(unit => {
              const node = nodeById.get(unit.home_node);
              if (!node) return null;
              return (
                <g key={unit.id} transform={`translate(${node.x} ${node.y})`}>
                  <polygon points="0,-2.6 2.4,2.2 -2.4,2.2" fill="#0F172A" stroke="#FFFFFF" strokeWidth="0.5" />
                </g>
              );
            })}
          </g>

          {/* Incidents, spread out when several share a node */}
          <g>
            {Array.from(incidentsByNode.entries()).flatMap(([nodeId, incidents]) => {
              const node = nodeById.get(nodeId);
              if (!node) return [];
              return incidents.map((incident, index) => {
                const { dx, dy } = markerOffset(index);
                return (
                  <g key={incident.id} transform={`translate(${node.x + dx} ${node.y + dy})`}>
                    <rect
                      x="-2.1"
                      y="-2.1"
                      width="4.2"
                      height="4.2"
                      rx="0.8"
                      fill={SEVERITY_FILL[incident.severity]}
                      stroke="#FFFFFF"
                      strokeWidth="0.6"
                    />
                  </g>
                );
              });
            })}
          </g>

          {/* Reported-report hotspots, sized by volume */}
          <g>
            {dataset.zones.map(zone => {
              const count = reportsByZone.get(zone.id) ?? 0;
              if (count === 0) return null;
              const centroid = polygonCentroid(zone.polygon);
              const radius = 1.6 + 2.4 * (maxReports === 0 ? 0 : count / maxReports);
              return (
                <g key={`${zone.id}-reports`} transform={`translate(${centroid.x} ${centroid.y + 6})`}>
                  <circle r={radius} fill={TONE_STYLES.accent.hex} fillOpacity="0.16" stroke={TONE_STYLES.accent.hex} strokeWidth="0.5" />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="3"
                    fontWeight="700"
                    fill={TONE_STYLES.accent.hex}
                  >
                    {count}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Labels last so they stay legible over every overlay */}
          <g>
            {dataset.zones.map(zone => {
              const centroid = polygonCentroid(zone.polygon);
              const assessment = assessmentByZone.get(zone.id);
              return (
                <g key={`${zone.id}-label`} transform={`translate(${centroid.x} ${centroid.y - 4})`} pointerEvents="none">
                  <text textAnchor="middle" fontSize="3.1" fontWeight="700" fill="#0F172A">
                    {zone.name}
                  </text>
                  {assessment && (
                    <text textAnchor="middle" y="3.6" fontSize="2.6" fontWeight="600" fill={TONE_STYLES.uncertain.hex}>
                      {assessment.priority_score}/100
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Legend — always real text, never a colour key alone. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-line bg-surface px-3 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Legend</span>
        <LegendItem swatch={<span className="h-3 w-3 rounded-sm border" style={{ borderColor: TONE_STYLES.uncertain.hex, background: '#F5F3FF' }} />} label="Warrants verification (≥50)" />
        <LegendItem swatch={<span className="h-3 w-3 rounded-sm border border-line-strong bg-white" />} label="Below threshold" />
        <LegendItem
          swatch={
            <span
              className="h-3 w-3 rounded-sm border"
              style={{
                borderColor: TONE_STYLES.uncertain.hex,
                backgroundImage: `repeating-linear-gradient(45deg, ${TONE_STYLES.uncertain.hex} 0 1px, transparent 1px 4px)`
              }}
            />
          }
          label="Hatched = uncertain (Low/Medium confidence)"
        />
        <LegendItem swatch={<span className="h-3 w-3 rounded-sm" style={{ background: TONE_STYLES.accent.hex, opacity: 0.35 }} />} label="Report volume (number = reports)" />
        <LegendItem swatch={<span className="h-3 w-3 rounded-sm border border-line-strong bg-surface-sunken" />} label="Closed road segment (dashed)" />
        {SEVERITY_ORDER.map(severity => (
          <LegendItem
            key={severity}
            swatch={<span className="h-3 w-3 rounded-sm" style={{ background: SEVERITY_FILL[severity] }} />}
            label={`${severity} incident`}
          />
        ))}
        <LegendItem swatch={<span className="text-[10px] font-bold text-ink">▲</span>} label="Responding unit" />
      </div>

      {/* Mouse-only score breakdown. Keyboard users get the same data in the zone table. */}
      {hoveredZone && hoveredAssessment && (
        <div
          className="pointer-events-none absolute z-20 w-64 -translate-x-1/2 -translate-y-full rounded-card border border-line bg-surface p-3 shadow-panel"
          style={{
            left: `${polygonCentroid(hoveredZone.polygon).x}%`,
            top: `${polygonCentroid(hoveredZone.polygon).y}%`
          }}
        >
          <p className="text-xs font-bold text-ink">{hoveredZone.name}</p>
          <p className="mt-0.5 text-[11px] text-ink-subtle">
            Verification priority <span data-metric className="tabular-nums font-semibold text-ink">{hoveredAssessment.priority_score}</span>/100
            {' · '}Confidence {hoveredAssessment.confidence}
          </p>
          <ul className="mt-2 space-y-1">
            {hoveredAssessment.evidence
              .slice()
              .sort((a, b) => b.contribution - a.contribution)
              .slice(0, 4)
              .map(item => (
                <li key={item.factor} className="flex items-start justify-between gap-2 text-[10px] leading-4">
                  <span className={cx('min-w-0', item.unobserved ? 'text-uncertain' : 'text-ink-muted')}>
                    {item.factor.replace(/_/g, ' ')}
                    {item.unobserved ? ' (unobserved)' : ''}
                  </span>
                  <span data-metric className="tabular-nums font-semibold text-ink shrink-0">
                    {item.contribution.toFixed(1)}
                  </span>
                </li>
              ))}
          </ul>
          {hoveredAssessment.missing_data.length > 0 && (
            <p className="mt-2 text-[10px] text-uncertain leading-4">
              {hoveredAssessment.missing_data.length} missing input(s) — flagged zones warrant verification only, never a claim that people are trapped.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

const LegendItem: React.FC<{ swatch: React.ReactNode; label: string }> = ({ swatch, label }) => (
  <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
    <span className="flex h-3 w-3 items-center justify-center">{swatch}</span>
    <span>{label}</span>
  </span>
);
