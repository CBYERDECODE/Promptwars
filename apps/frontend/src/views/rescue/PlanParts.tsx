import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  CircleAlert,
  CircleCheckBig,
  CircleMinus,
  Clock,
  Gauge,
  OctagonAlert,
  Route,
  ShieldAlert,
  Target,
  TriangleAlert,
  Users
} from 'lucide-react';
import { AllocationPlan, Assignment, PlanDetail, PlanMetrics, Severity, UnassignedIncident } from '@resq-ai/shared';
import { Badge, Card, MetricTile, Tone, cx } from '../../ui';

/* ------------------------------------------------------------------ */
/* Severity presentation                                               */
/* ------------------------------------------------------------------ */

const SEVERITY_META: Record<Severity, { tone: Tone; icon: LucideIcon }> = {
  Critical: { tone: 'critical', icon: OctagonAlert },
  High: { tone: 'warning', icon: TriangleAlert },
  Moderate: { tone: 'accent', icon: CircleAlert },
  Low: { tone: 'neutral', icon: CircleMinus }
};

/** Severity chip: icon + word, never colour alone. */
export const SeverityBadge: React.FC<{ severity: Severity; size?: 'sm' | 'md' }> = ({ severity, size = 'sm' }) => {
  const meta = SEVERITY_META[severity];
  return (
    <Badge tone={meta.tone} icon={meta.icon} size={size} srPrefix="Severity">
      {severity}
    </Badge>
  );
};

/* ------------------------------------------------------------------ */
/* Metrics                                                             */
/* ------------------------------------------------------------------ */

function formatMinutes(value: number | null): string {
  return value === null ? '—' : String(value);
}

/**
 * The eight figures every allocation is judged on. `unattended_high_severity`
 * and `worst_response_minutes` get explicit status badges because they are the
 * two numbers a coordinator must not skim past.
 */
export const PlanMetricsGrid: React.FC<{ metrics: PlanMetrics; slaMinutes: number; className?: string }> = ({
  metrics,
  slaMinutes,
  className
}) => (
  <div className={cx('grid grid-cols-2 gap-2.5 lg:grid-cols-4', className)}>
    <MetricTile
      label="Avg response"
      value={formatMinutes(metrics.avg_response_minutes)}
      unit="min"
      icon={Clock}
      tone={metrics.avg_response_minutes !== null && metrics.avg_response_minutes > slaMinutes ? 'warning' : 'accent'}
      help={`Target ${slaMinutes} min`}
    />
    <MetricTile
      label="Worst response"
      value={formatMinutes(metrics.worst_response_minutes)}
      unit="min"
      icon={ShieldAlert}
      tone={metrics.worst_response_minutes !== null && metrics.worst_response_minutes > slaMinutes ? 'critical' : 'success'}
      status={
        metrics.worst_response_minutes === null
          ? undefined
          : {
              tone: metrics.worst_response_minutes > slaMinutes ? 'critical' : 'success',
              icon: metrics.worst_response_minutes > slaMinutes ? TriangleAlert : CircleCheckBig,
              label: metrics.worst_response_minutes > slaMinutes ? `Beyond ${slaMinutes}` : `Inside ${slaMinutes}`
            }
      }
    />
    <MetricTile
      label="Coverage"
      value={metrics.coverage_pct}
      unit="%"
      icon={Target}
      tone={metrics.coverage_pct >= 80 ? 'success' : metrics.coverage_pct >= 50 ? 'warning' : 'critical'}
      help="Incidents reached inside the target time"
    />
    <MetricTile
      label="Unattended"
      value={metrics.unattended_incidents}
      icon={Users}
      tone={metrics.unattended_incidents === 0 ? 'success' : 'critical'}
      status={
        metrics.unattended_high_severity > 0
          ? { tone: 'critical', icon: OctagonAlert, label: `${metrics.unattended_high_severity} Critical/High` }
          : undefined
      }
    />
    <MetricTile
      label="Utilisation"
      value={metrics.utilization_pct}
      unit="%"
      icon={Gauge}
      tone="neutral"
      help="Committed units ÷ available units"
    />
    <MetricTile
      label="Hard-to-reach served"
      value={metrics.hard_to_reach_served}
      icon={Route}
      tone="accent"
      help="Isolated zones that received a unit"
    />
    <MetricTile
      label="Hard-to-reach unserved"
      value={metrics.hard_to_reach_unserved}
      icon={Route}
      tone={metrics.hard_to_reach_unserved > 0 ? 'critical' : 'success'}
      status={
        metrics.hard_to_reach_unserved > 0
          ? { tone: 'critical', icon: TriangleAlert, label: 'Disadvantaged' }
          : { tone: 'success', icon: CircleCheckBig, label: 'All covered' }
      }
    />
  </div>
);

/* ------------------------------------------------------------------ */
/* Assignments                                                         */
/* ------------------------------------------------------------------ */

export interface AssignmentTableProps {
  assignments: Assignment[];
  /**
   * Signatures (`unit|incident`) from the previous plan. When supplied, rows
   * that are new or changed are marked explicitly — diff highlighting never
   * relies on a subtle colour shift alone.
   */
  previousSignatures?: Set<string> | null;
}

function signatureOf(assignment: Assignment): string {
  return `${assignment.unit_id}|${assignment.incident_id}`;
}

/** The unit → incident pairings, each with its own "why". */
export const AssignmentTable: React.FC<AssignmentTableProps> = ({ assignments, previousSignatures = null }) => {
  if (assignments.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-line-strong bg-surface-muted px-3 py-4 text-center text-xs text-ink-subtle">
        No unit could be assigned under this plan. See the unattended list for the reason on each incident.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">
          Units assigned to incidents, with modelled travel time and the reason for each pairing
        </caption>
        <thead>
          <tr className="border-b border-line">
            {['Unit', 'Incident', 'Severity', 'Travel', 'Target', 'Why'].map(column => (
              <th
                key={column}
                scope="col"
                className="px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-ink-subtle whitespace-nowrap"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {assignments.map(assignment => {
            const isNew = previousSignatures ? !previousSignatures.has(signatureOf(assignment)) : false;
            return (
              <tr key={signatureOf(assignment)} className="border-b border-line last:border-b-0 align-top">
                <td className="px-2 py-2 text-xs font-semibold text-ink whitespace-nowrap">
                  {/* A hidden-on-screen marker keeps "changed" available to screen readers too. */}
                  <span className={cx('flex items-center gap-1.5', isNew && 'text-accent-strong')}>
                    {isNew && <CircleAlert className="h-3 w-3 shrink-0" aria-hidden="true" />}
                    <span>{assignment.unit_label}</span>
                    {isNew && <Badge tone="accent" size="sm">Changed</Badge>}
                  </span>
                </td>
                <td className="px-2 py-2 text-xs text-ink-muted min-w-[12rem]">{assignment.incident_title}</td>
                <td className="px-2 py-2">
                  <SeverityBadge severity={assignment.severity} />
                </td>
                <td data-metric className="px-2 py-2 text-xs tabular-nums text-ink whitespace-nowrap">
                  {assignment.travel_minutes === null ? 'No route' : `${assignment.travel_minutes} min`}
                </td>
                <td className="px-2 py-2">
                  <Badge
                    tone={assignment.within_sla ? 'success' : 'critical'}
                    icon={assignment.within_sla ? CircleCheckBig : TriangleAlert}
                  >
                    {assignment.within_sla ? 'Inside' : 'Beyond'}
                  </Badge>
                </td>
                <td className="px-2 py-2 min-w-[14rem]">
                  <details className="group">
                    <summary className="cursor-pointer list-none text-[11px] font-semibold text-accent underline-offset-2 hover:underline">
                      Why this pairing
                    </summary>
                    <ul className="mt-1.5 space-y-1">
                      {assignment.reasons.map(reason => (
                        <li key={reason} className="text-[11px] text-ink-muted leading-4">
                          • {reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Unattended incidents                                                */
/* ------------------------------------------------------------------ */

export const UnassignedList: React.FC<{ unassigned: UnassignedIncident[] }> = ({ unassigned }) => {
  if (unassigned.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-card border border-success-border bg-success-soft px-3 py-2.5 text-xs font-semibold text-ink">
        <CircleCheckBig className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
        Every incident in scope receives a unit under this plan.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {unassigned.map(incident => (
        <li key={incident.incident_id} className="rounded-card border border-critical-border bg-critical-soft px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={incident.severity} />
            <span className="text-xs font-semibold text-ink">{incident.incident_title}</span>
          </div>
          <p className="mt-1 text-[11px] text-ink-muted leading-4">{incident.reason}</p>
        </li>
      ))}
    </ul>
  );
};

/* ------------------------------------------------------------------ */
/* Constraints                                                         */
/* ------------------------------------------------------------------ */

export const ConstraintList: React.FC<{ constraints: string[]; title?: string; className?: string }> = ({
  constraints,
  title = 'Active constraints',
  className
}) => (
  <div className={className}>
    <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">{title}</h3>
    <ul className="mt-1.5 space-y-1.5">
      {constraints.map(constraint => (
        <li key={constraint} className="flex items-start gap-1.5 text-[11px] text-ink-muted leading-4">
          <CircleMinus className="mt-0.5 h-3 w-3 shrink-0 text-ink-faint" aria-hidden="true" />
          <span>{constraint}</span>
        </li>
      ))}
    </ul>
  </div>
);

/* ------------------------------------------------------------------ */
/* Composite plan card                                                 */
/* ------------------------------------------------------------------ */

export interface PlanCardProps {
  plan: PlanDetail;
  slaMinutes: number;
  /** Header actions, e.g. a "select this plan" button. */
  actions?: React.ReactNode;
  /** Footer region, e.g. the disadvantaged summary or a decision panel entry point. */
  footer?: React.ReactNode;
  previousSignatures?: Set<string> | null;
  tone?: Tone;
  accentRail?: boolean;
  className?: string;
}

/** One complete, self-contained allocation proposal. */
export const PlanCard: React.FC<PlanCardProps> = ({
  plan,
  slaMinutes,
  actions,
  footer,
  previousSignatures = null,
  tone = 'neutral',
  accentRail = false,
  className
}) => (
  <Card
    title={plan.strategy_label}
    description="Deterministic proposal — nothing is dispatched until a coordinator approves it."
    icon={Route}
    tone={tone}
    actions={actions}
    accentRail={accentRail}
    footer={footer}
    className={className}
    bodyClassName="space-y-3.5"
  >
    <PlanMetricsGrid metrics={plan.metrics} slaMinutes={slaMinutes} />

    <div>
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
        Assignments ({plan.assignments.length} of {plan.total_incidents})
      </h3>
      <div className="mt-1.5">
        <AssignmentTable assignments={plan.assignments} previousSignatures={previousSignatures} />
      </div>
    </div>

    <div>
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
        Unattended incidents ({plan.unassigned.length})
      </h3>
      <div className="mt-1.5">
        <UnassignedList unassigned={plan.unassigned} />
      </div>
    </div>

    <ConstraintList constraints={plan.active_constraints} />

    <div className="rounded-card border border-line bg-surface-muted px-3 py-2.5">
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">Who is disadvantaged</h3>
      <p className="mt-1 text-xs text-ink-muted leading-5">{plan.disadvantaged_summary}</p>
    </div>
  </Card>
);

/** Deterministic signature used by the audit trail and by diff highlighting. */
export function planSignature(plan: AllocationPlan): string {
  return plan.assignments
    .map(assignment => `${assignment.unit_id}->${assignment.incident_id}`)
    .slice()
    .sort()
    .join('; ');
}
