import React from 'react';
import { Provenance } from '@resq-ai/shared';
import { User, Sparkles, ShieldCheck, AlertTriangle } from 'lucide-react';

interface Props {
  provenance: Provenance;
  className?: string;
}

export const ProvenanceBadge: React.FC<Props> = ({ provenance, className = '' }) => {
  switch (provenance) {
    case 'USER_REPORTED':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-sky-950/70 text-sky-300 border border-sky-800 ${className}`}
          role="status"
          aria-label="Provenance: User Reported"
        >
          <User className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
          <span>USER_REPORTED</span>
        </span>
      );

    case 'AI_INFERRED':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-purple-950/70 text-purple-300 border border-purple-800 ${className}`}
          role="status"
          aria-label="Provenance: AI Inferred"
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-400" aria-hidden="true" />
          <span>AI_INFERRED</span>
        </span>
      );

    case 'VERIFIED':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-emerald-950/70 text-emerald-300 border border-emerald-800 ${className}`}
          role="status"
          aria-label="Provenance: Verified via retrieved source"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
          <span>VERIFIED</span>
        </span>
      );

    case 'UNVERIFIED_OR_CONFLICTING':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-amber-950/70 text-amber-300 border border-amber-800 ${className}`}
          role="status"
          aria-label="Provenance: Unverified or Conflicting"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
          <span>UNVERIFIED_OR_CONFLICTING</span>
        </span>
      );
  }
};
