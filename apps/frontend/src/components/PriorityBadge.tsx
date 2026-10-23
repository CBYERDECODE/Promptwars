import React from 'react';
import { PriorityLevel } from '@resq-ai/shared';
import { AlertOctagon, AlertTriangle, AlertCircle, CheckCircle2, HelpCircle } from 'lucide-react';

interface Props {
  priority: PriorityLevel;
  className?: string;
}

export const PriorityBadge: React.FC<Props> = ({ priority, className = '' }) => {
  switch (priority) {
    case 'Critical':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wide bg-rose-950/80 text-rose-200 border border-rose-700 ${className}`}
          role="status"
          aria-label="Suggested priority: Critical"
        >
          <AlertOctagon className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />
          <span>Critical</span>
        </span>
      );

    case 'High':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wide bg-amber-950/80 text-amber-200 border border-amber-700 ${className}`}
          role="status"
          aria-label="Suggested priority: High"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
          <span>High</span>
        </span>
      );

    case 'Moderate':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wide bg-yellow-950/80 text-yellow-200 border border-yellow-700 ${className}`}
          role="status"
          aria-label="Suggested priority: Moderate"
        >
          <AlertCircle className="w-3.5 h-3.5 text-yellow-400" aria-hidden="true" />
          <span>Moderate</span>
        </span>
      );

    case 'Low':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wide bg-teal-950/80 text-teal-200 border border-teal-700 ${className}`}
          role="status"
          aria-label="Suggested priority: Low"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" aria-hidden="true" />
          <span>Low</span>
        </span>
      );

    case 'Needs review':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wide bg-indigo-950/80 text-indigo-200 border border-indigo-700 ${className}`}
          role="status"
          aria-label="Suggested priority: Needs review"
        >
          <HelpCircle className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
          <span>Needs review</span>
        </span>
      );
  }
};
