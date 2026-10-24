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
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wide bg-red-50 text-red-800 border border-red-300 ${className}`}
          role="status"
          aria-label="Suggested priority: Critical"
        >
          <AlertOctagon className="w-3.5 h-3.5 text-red-600 shrink-0" aria-hidden="true" />
          <span>Critical</span>
        </span>
      );

    case 'High':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wide bg-amber-50 text-amber-900 border border-amber-300 ${className}`}
          role="status"
          aria-label="Suggested priority: High"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" aria-hidden="true" />
          <span>High</span>
        </span>
      );

    case 'Moderate':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wide bg-yellow-50 text-yellow-900 border border-yellow-300 ${className}`}
          role="status"
          aria-label="Suggested priority: Moderate"
        >
          <AlertCircle className="w-3.5 h-3.5 text-yellow-700 shrink-0" aria-hidden="true" />
          <span>Moderate</span>
        </span>
      );

    case 'Low':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wide bg-emerald-50 text-emerald-800 border border-emerald-300 ${className}`}
          role="status"
          aria-label="Suggested priority: Low"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
          <span>Low</span>
        </span>
      );

    case 'Needs review':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wide bg-blue-50 text-blue-900 border border-blue-300 ${className}`}
          role="status"
          aria-label="Suggested priority: Needs review"
        >
          <HelpCircle className="w-3.5 h-3.5 text-blue-700 shrink-0" aria-hidden="true" />
          <span>Needs review</span>
        </span>
      );
  }
};
