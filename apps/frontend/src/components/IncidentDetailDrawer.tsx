import React, { useState, useEffect, useRef } from 'react';
import { 
  IncidentRecord, 
  IncidentStatus, 
  IncidentReportExport,
  EvidenceItem 
} from '@resq-ai/shared';
import { PriorityBadge } from './PriorityBadge';
import { ProvenanceBadge } from './ProvenanceBadge';
import { fetchIncidentReport, patchIncident } from '../api/client';
import { 
  X, 
  Download, 
  Copy, 
  Check, 
  AlertTriangle, 
  MapPin, 
  Users, 
  Clock, 
  GitMerge, 
  CheckSquare 
} from 'lucide-react';

interface Props {
  incident: IncidentRecord | null;
  onClose: () => void;
  onIncidentUpdated: (updated: IncidentRecord) => void;
}

export const IncidentDetailDrawer: React.FC<Props> = ({ incident, onClose, onIncidentUpdated }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'evidence' | 'report' | 'fusion'>('overview');
  const [report, setReport] = useState<IncidentReportExport | null>(null);
  const [copied, setCopied] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Focus trapping and ESC listener
  useEffect(() => {
    if (incident) {
      closeBtnRef.current?.focus();
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [incident, onClose]);

  // Load exportable report when report tab opened
  useEffect(() => {
    if (incident && activeTab === 'report') {
      fetchIncidentReport(incident.id)
        .then(data => setReport(data))
        .catch(err => console.error('Failed to load report:', err));
    }
  }, [incident, activeTab]);

  if (!incident) return null;

  const handleStatusChange = async (newStatus: IncidentStatus) => {
    try {
      setIsUpdatingStatus(true);
      const updated = await patchIncident(incident.id, { status: newStatus });
      onIncidentUpdated(updated);
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleCopyMarkdown = () => {
    if (!report) return;
    navigator.clipboard.writeText(report.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadMarkdown = () => {
    if (!report) return;
    const blob = new Blob([report.markdown], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `incident-${incident.id}-report.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div 
      className="fixed inset-0 z-40 flex justify-end bg-navy-950/70 backdrop-blur-xs transition-opacity"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
    >
      <div 
        ref={drawerRef}
        className="w-full max-w-2xl bg-navy-900 border-l border-navy-700 h-full flex flex-col shadow-2xl text-slate-100 overflow-hidden"
      >
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-navy-800 bg-navy-850 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="font-mono text-xs text-slate-400 font-bold bg-navy-950 px-2 py-0.5 rounded border border-navy-700">
                {incident.id}
              </span>
              <PriorityBadge priority={incident.priority.level} />
              {incident.is_simulated && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-950/70 text-amber-300 border border-amber-800">
                  Simulated
                </span>
              )}
              {incident.is_fused && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-700 flex items-center gap-1">
                  <GitMerge className="w-3 h-3" /> Fused Record
                </span>
              )}
            </div>
            <h2 id="drawer-title" className="text-lg font-bold text-white leading-snug">
              {incident.incident_type}: {incident.summary.slice(0, 75)}...
            </h2>
          </div>

          <button
            ref={closeBtnRef}
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-navy-800 transition"
            aria-label="Close incident detail drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Bar */}
        <div className="px-5 py-2.5 bg-navy-950/60 border-b border-navy-800 flex items-center justify-between text-xs flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Status:</span>
            <select
              value={incident.status}
              disabled={isUpdatingStatus}
              onChange={(e) => handleStatusChange(e.target.value as IncidentStatus)}
              className="bg-navy-800 text-teal-300 font-semibold px-2.5 py-1 rounded border border-navy-700 focus:ring-1 focus:ring-teal-400"
              aria-label="Update incident status"
            >
              <option value="NEW">NEW</option>
              <option value="IN_REVIEW">IN_REVIEW</option>
              <option value="TRIAGED">TRIAGED</option>
              <option value="RESOLVED">RESOLVED</option>
              <option value="ARCHIVED">ARCHIVED</option>
              {incident.is_fused && <option value="FUSED">FUSED</option>}
            </select>
          </div>

          <div className="text-slate-400 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            <span>Reported {new Date(incident.reported_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="flex border-b border-navy-800 bg-navy-900 px-4 gap-1 text-xs font-semibold overflow-x-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-3 border-b-2 transition whitespace-nowrap ${
              activeTab === 'overview'
                ? 'border-teal-400 text-teal-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Intelligence Overview
          </button>
          <button
            onClick={() => setActiveTab('evidence')}
            className={`py-3 px-3 border-b-2 transition whitespace-nowrap ${
              activeTab === 'evidence'
                ? 'border-teal-400 text-teal-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Evidence &amp; Provenance ({incident.evidence_items.length})
          </button>
          <button
            onClick={() => setActiveTab('report')}
            className={`py-3 px-3 border-b-2 transition whitespace-nowrap ${
              activeTab === 'report'
                ? 'border-teal-400 text-teal-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Export Action Report
          </button>
          {incident.is_fused && (
            <button
              onClick={() => setActiveTab('fusion')}
              className={`py-3 px-3 border-b-2 transition whitespace-nowrap ${
                activeTab === 'fusion'
                  ? 'border-teal-400 text-teal-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Fusion Audit ({incident.merged_incident_ids?.length || 0})
            </button>
          )}
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Executive Summary */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Executive Summary
                </h3>
                <p className="p-3.5 rounded-lg bg-navy-850 border border-navy-700/80 leading-relaxed text-slate-200">
                  {incident.summary}
                </p>
              </div>

              {/* Priority Rationale Box */}
              <div className="p-3.5 rounded-lg bg-navy-950 border border-navy-700/80">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Suggested Priority Analysis
                  </span>
                  <PriorityBadge priority={incident.priority.level} />
                </div>
                <ul className="space-y-1.5 text-xs text-slate-300 list-disc list-inside">
                  {incident.priority.reasons.map((reason: string, idx: number) => (
                    <li key={idx} className="leading-relaxed">
                      {reason}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 pt-2 border-t border-navy-800 text-[11px] text-slate-400 italic">
                  {incident.priority.disclaimer}
                </p>
              </div>

              {/* Location details */}
              <div className="p-3.5 rounded-lg bg-navy-850 border border-navy-700/80 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <MapPin className="w-4 h-4 text-teal-400" />
                  <span>Reported Location</span>
                </div>
                {incident.reported_location ? (
                  <div>
                    <p className="font-semibold text-white">{incident.reported_location}</p>
                    {incident.normalized_location && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        Normalized: {incident.normalized_location.formatted_address} (Confidence: {incident.normalized_location.confidence})
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-amber-300 italic">
                    Location undetermined. Action pending physical verification.
                  </p>
                )}
              </div>

              {/* Casualties & People at Risk Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-navy-850 border border-navy-700/80">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-400 mb-1">
                    <Users className="w-4 h-4 text-amber-400" />
                    <span>People At Risk</span>
                  </div>
                  <p className="text-lg font-bold text-white">
                    {incident.people_at_risk.estimated_count ?? 'Undetermined'}
                  </p>
                  {incident.people_at_risk.description && (
                    <p className="text-xs text-slate-400 mt-1">{incident.people_at_risk.description}</p>
                  )}
                </div>

                <div className="p-3 rounded-lg bg-navy-850 border border-navy-700/80">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-400 mb-1">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    <span>Reported Injuries</span>
                  </div>
                  <p className="text-lg font-bold text-white">
                    {incident.reported_injuries.estimated_count ?? 'None confirmed'}
                  </p>
                  {incident.reported_injuries.description && (
                    <p className="text-xs text-slate-400 mt-1">{incident.reported_injuries.description}</p>
                  )}
                </div>
              </div>

              {/* Hazard Indicators & Constraints */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Hazard Indicators
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {incident.hazard_indicators.map((h: string, i: number) => (
                    <span key={i} className="px-2.5 py-1 rounded text-xs bg-navy-800 text-slate-200 border border-navy-700">
                      ⚠️ {h}
                    </span>
                  ))}
                  {incident.hazard_indicators.length === 0 && (
                    <span className="text-xs text-slate-400">None detected</span>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Access Constraints
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {incident.access_constraints.map((c: string, i: number) => (
                    <span key={i} className="px-2.5 py-1 rounded text-xs bg-navy-800 text-slate-200 border border-navy-700">
                      🚧 {c}
                    </span>
                  ))}
                  {incident.access_constraints.length === 0 && (
                    <span className="text-xs text-slate-400">No constraints reported</span>
                  )}
                </div>
              </div>

              {/* Conflicts & Missing Info Warnings */}
              {incident.conflicting_information.length > 0 && (
                <div className="p-3.5 rounded-lg bg-amber-950/40 border border-amber-800/80 text-amber-200 text-xs">
                  <div className="font-bold flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>Unresolved Conflicting Statements:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1">
                    {incident.conflicting_information.map((conflict: string, i: number) => (
                      <li key={i}>{conflict}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: EVIDENCE & PROVENANCE */}
          {activeTab === 'evidence' && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-navy-850 border border-navy-700/80 text-xs text-slate-300">
                <strong>Strict Provenance Standard:</strong> Every intelligence claim is tagged with its verified origin. No simulated verification is presented as real.
              </div>

              <div className="space-y-3">
                {incident.evidence_items.map((ev: EvidenceItem, idx: number) => (
                  <div key={idx} className="p-3.5 rounded-lg bg-navy-850 border border-navy-700/80 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <ProvenanceBadge provenance={ev.provenance} />
                      <span className="text-xs font-mono text-slate-400">
                        Confidence: {(ev.confidence * 100).toFixed(0)}%
                      </span>
                    </div>

                    <p className="text-sm font-medium text-white">{ev.claim}</p>

                    {ev.source_excerpt && (
                      <div className="text-xs bg-navy-950 p-2.5 rounded border border-navy-800 text-slate-300 italic">
                        &ldquo;{ev.source_excerpt}&rdquo;
                      </div>
                    )}

                    {ev.source_url && (
                      <div className="text-xs text-teal-400">
                        <a href={ev.source_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          Source: {ev.source_name || ev.source_url}
                        </a>
                      </div>
                    )}
                  </div>
                ))}

                {incident.evidence_items.length === 0 && (
                  <p className="text-xs text-slate-400 italic">No structured evidence claims recorded.</p>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: ACTION REPORT EXPORT */}
          {activeTab === 'report' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-xs text-slate-400">
                  Exportable Decision Support Package (JSON / Markdown)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyMarkdown}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-navy-800 hover:bg-navy-700 text-slate-200 border border-navy-700 transition"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy Markdown'}</span>
                  </button>
                  <button
                    onClick={handleDownloadMarkdown}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-white transition shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .MD</span>
                  </button>
                </div>
              </div>

              {report && (
                <>
                  {/* Decision Support Checklist */}
                  <div className="p-3.5 rounded-lg bg-navy-850 border border-navy-700/80">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-2">
                      <CheckSquare className="w-4 h-4 text-teal-400" />
                      <span>Operational Decision Checklist</span>
                    </h3>
                    <div className="space-y-2">
                      {report.checklist.map((item: IncidentReportExport['checklist'][number]) => (
                        <div key={item.id} className="flex items-start gap-2.5 text-xs text-slate-200">
                          <input
                            type="checkbox"
                            defaultChecked={item.completed}
                            className="mt-0.5 rounded border-navy-600 bg-navy-950 text-teal-500 focus:ring-teal-400"
                          />
                          <div>
                            <span className="font-medium">{item.item}</span>
                            <span className="text-[11px] text-slate-400 block">Lead: {item.recommended_role}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recommendations Distinct From Executed Operations */}
                  <div className="p-3.5 rounded-lg bg-navy-850 border border-navy-700/80 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Recommendations (Advisory Only - Not Executed)
                    </h3>
                    {report.recommendations.map((rec: IncidentReportExport['recommendations'][number], i: number) => (
                      <div key={i} className="p-2.5 rounded bg-navy-950 border border-navy-800 text-xs">
                        <span className="font-bold text-amber-300 block mb-1">
                          [RECOMMENDED ADVICE - NOT EXECUTED] {rec.category}
                        </span>
                        <p className="text-slate-300">{rec.advice}</p>
                      </div>
                    ))}
                  </div>

                  {/* Markdown Raw Preview */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Markdown Export Preview
                    </h3>
                    <pre className="p-3 rounded-lg bg-navy-950 border border-navy-800 font-mono text-xs text-slate-300 overflow-x-auto max-h-60 whitespace-pre-wrap">
                      {report.markdown}
                    </pre>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 4: FUSION AUDIT */}
          {activeTab === 'fusion' && incident.is_fused && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-teal-950/40 border border-teal-800/80 text-xs text-teal-200">
                <strong>Incident Fusion Record:</strong> This master intelligence record fuses {incident.merged_incident_ids?.length || 0} separate reporting streams. Original records, timestamps, and conflicting assertions have been preserved.
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Fused Source Reports
                </h3>
                <div className="space-y-2">
                  {incident.original_reports?.map((rep: IncidentRecord, idx: number) => (
                    <div key={idx} className="p-3 rounded-lg bg-navy-850 border border-navy-700/80 text-xs space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-teal-300 font-bold">{rep.id}</span>
                        <span className="text-slate-400">{new Date(rep.reported_at).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-slate-300">{rep.summary}</p>
                      <p className="text-slate-400 text-[11px]">Location: {rep.reported_location || 'Unspecified'}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
