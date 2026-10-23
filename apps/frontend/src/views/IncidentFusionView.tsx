import React, { useState, useEffect } from 'react';
import { 
  fetchIncidents, 
  fetchFusionCandidates, 
  previewFusion, 
  confirmFusion 
} from '../api/client';
import { IncidentRecord } from '@resq-ai/shared';
import { PriorityBadge } from '../components/PriorityBadge';
import { 
  GitMerge, 
  AlertTriangle, 
  Check, 
  X, 
  ArrowRight, 
  RefreshCw, 
  Sparkles 
} from 'lucide-react';

interface Props {
  isSimulatedMode: boolean;
  onFusionConfirmed: (fused: IncidentRecord) => void;
  announce: (msg: string) => void;
}

export const IncidentFusionView: React.FC<Props> = ({
  isSimulatedMode,
  onFusionConfirmed,
  announce
}) => {
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [selectedPrimaryId, setSelectedPrimaryId] = useState<string>('');
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  const [previewData, setPreviewData] = useState<any | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [isMerging, setIsMerging] = useState(false);
  const [mergeSuccess, setMergeSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load available incidents
  useEffect(() => {
    fetchIncidents({ limit: 50, is_simulated: isSimulatedMode ? true : undefined })
      .then(res => {
        setIncidents(res.items);
        if (res.items.length > 0 && !selectedPrimaryId) {
          setSelectedPrimaryId(res.items[0].id);
        }
      })
      .catch(err => console.error(err));
  }, [isSimulatedMode]);

  // Load candidates when primary selected
  useEffect(() => {
    if (!selectedPrimaryId) return;
    setLoadingCandidates(true);
    setPreviewData(null);
    setMergeSuccess(false);
    setErrorMsg(null);

    fetchFusionCandidates(selectedPrimaryId)
      .then(res => {
        setCandidates(res.candidates || []);
      })
      .catch(err => {
        console.error(err);
      })
      .finally(() => setLoadingCandidates(false));
  }, [selectedPrimaryId]);

  const handleSelectCandidate = async (secondaryId: string) => {
    try {
      setLoadingPreview(true);
      setErrorMsg(null);
      setMergeSuccess(false);
      announce('Generating side-by-side fusion preview...');

      const preview = await previewFusion(selectedPrimaryId, secondaryId);
      setPreviewData(preview);
      announce('Fusion preview loaded with conflict analysis.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to preview fusion');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleConfirmMerge = async () => {
    if (!previewData) return;
    try {
      setIsMerging(true);
      setErrorMsg(null);
      announce('Executing human-confirmed Incident Fusion...');

      const fused = await confirmFusion(
        previewData.primary.id,
        previewData.secondary.id,
        resolutionNotes
      );

      setMergeSuccess(true);
      announce(`Incidents successfully fused into ${fused.id}. Original records preserved.`);
      onFusionConfirmed(fused);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to confirm fusion');
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
          <span>Incident Fusion Engine</span>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-950 text-teal-300 border border-teal-800">
            Human-in-the-Loop
          </span>
        </h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Detect and fuse related emergency reports across time and space. Conflicting claims are highlighted; merging is never automatic and preserves all original data.
        </p>
      </div>

      {/* Primary Incident Selector */}
      <div className="p-4 rounded-xl bg-navy-900 border border-navy-800 space-y-3">
        <label htmlFor="primary-select" className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
          Select Anchor Incident:
        </label>
        <select
          id="primary-select"
          value={selectedPrimaryId}
          onChange={(e) => setSelectedPrimaryId(e.target.value)}
          className="w-full bg-navy-950 border border-navy-700 text-slate-100 rounded-lg p-2.5 text-xs font-medium focus:border-teal-400"
        >
          {incidents.map((inc) => (
            <option key={inc.id} value={inc.id}>
              [{inc.id}] {inc.incident_type} &bull; {inc.summary.slice(0, 70)}... ({inc.priority.level})
            </option>
          ))}
        </select>
      </div>

      {/* Candidate Matches Section */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Detected Fusion Candidates ({candidates.length})
        </h2>

        {loadingCandidates && (
          <div className="p-8 text-center text-xs text-slate-400">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-teal-400 mb-2" />
            Analyzing operational spatio-temporal correlation...
          </div>
        )}

        {!loadingCandidates && candidates.length === 0 && (
          <div className="p-8 rounded-xl bg-navy-900 border border-navy-800 text-center text-xs text-slate-400">
            No candidate correlations detected for the selected anchor incident.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {candidates.map((cand, idx) => {
            const secondary = incidents.find(i => i.id === cand.secondary_id);
            const isSelected = previewData?.secondary.id === cand.secondary_id;

            return (
              <div
                key={idx}
                className={`p-4 rounded-xl border transition text-left space-y-2.5 ${
                  isSelected
                    ? 'bg-navy-850 border-teal-500 shadow-md'
                    : 'bg-navy-900 border-navy-800 hover:border-navy-700'
                }`}
              >
                <div className="flex justify-between items-center text-xs">
                  <span className="font-mono font-bold text-teal-300">{cand.secondary_id}</span>
                  <span className="px-2 py-0.5 rounded bg-teal-950/80 text-teal-300 font-bold border border-teal-800">
                    Match Score: {(cand.similarity_score * 100).toFixed(0)}%
                  </span>
                </div>

                {secondary && (
                  <p className="text-xs text-slate-200 line-clamp-2">{secondary.summary}</p>
                )}

                <div className="space-y-1 text-[11px] text-slate-400">
                  <div className="font-semibold text-slate-300">Matching Signals:</div>
                  <ul className="list-disc list-inside">
                    {cand.matching_factors.map((f: string, i: number) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>

                {cand.conflicting_fields.length > 0 && (
                  <div className="p-2 rounded bg-amber-950/40 border border-amber-800/60 text-[11px] text-amber-300 space-y-0.5">
                    <span className="font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-400" />
                      Field Discrepancies:
                    </span>
                    <ul className="list-disc list-inside">
                      {cand.conflicting_fields.map((c: string, i: number) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  onClick={() => handleSelectCandidate(cand.secondary_id)}
                  className="w-full mt-2 py-1.5 px-3 rounded text-xs font-bold bg-navy-800 hover:bg-teal-600 text-white transition flex items-center justify-center gap-1.5"
                >
                  <span>Compare Side-by-Side</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-lg bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {loadingPreview && (
        <div className="p-6 text-center text-xs text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto text-teal-400 mb-2" />
          Loading comparative fusion preview...
        </div>
      )}

      {/* Side-by-Side Comparison Modal / Box */}
      {previewData && (
        <div className="p-5 rounded-xl bg-navy-900 border border-teal-500/50 space-y-5 shadow-2xl">
          <div className="flex justify-between items-center pb-3 border-b border-navy-800">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <GitMerge className="w-4 h-4 text-teal-400" />
              <span>Side-by-Side Comparative Analysis</span>
            </h3>
            <button
              onClick={() => setPreviewData(null)}
              className="p-1 text-slate-400 hover:text-white"
              aria-label="Close comparative preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Dual Column Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Primary Record */}
            <div className="p-3.5 rounded-lg bg-navy-950 border border-navy-800 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-teal-300">Anchor: {previewData.primary.id}</span>
                <PriorityBadge priority={previewData.primary.priority.level} />
              </div>
              <p className="text-slate-200">{previewData.primary.summary}</p>
              <div className="text-slate-400 text-[11px]">
                Location: {previewData.primary.reported_location || 'Not specified'}
              </div>
              <div className="text-slate-400 text-[11px]">
                Injuries: {previewData.primary.reported_injuries.estimated_count ?? 'None'}
              </div>
              <div className="text-slate-400 text-[11px]">
                Claims: {previewData.primary.evidence_items.length}
              </div>
            </div>

            {/* Secondary Record */}
            <div className="p-3.5 rounded-lg bg-navy-950 border border-navy-800 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-teal-300">Candidate: {previewData.secondary.id}</span>
                <PriorityBadge priority={previewData.secondary.priority.level} />
              </div>
              <p className="text-slate-200">{previewData.secondary.summary}</p>
              <div className="text-slate-400 text-[11px]">
                Location: {previewData.secondary.reported_location || 'Not specified'}
              </div>
              <div className="text-slate-400 text-[11px]">
                Injuries: {previewData.secondary.reported_injuries.estimated_count ?? 'None'}
              </div>
              <div className="text-slate-400 text-[11px]">
                Claims: {previewData.secondary.evidence_items.length}
              </div>
            </div>
          </div>

          {/* Conflicting Fields Highlighted */}
          {previewData.conflicting_claims.length > 0 && (
            <div className="p-3.5 rounded-lg bg-amber-950/60 border border-amber-800 text-xs space-y-1.5 text-amber-200">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Explicit Discrepancies to Reconcile:</span>
              </div>
              <ul className="list-disc list-inside space-y-1">
                {previewData.conflicting_claims.map((c: string, i: number) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          {/* AI Similarity Explanation (Explain only) */}
          {previewData.gemini_explanation && (
            <div className="p-3 rounded-lg bg-navy-950 border border-navy-800 text-xs text-slate-300 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-white block">Analytic Assessment:</span>
                <p className="mt-0.5">{previewData.gemini_explanation}</p>
              </div>
            </div>
          )}

          {/* Human Resolution Notes */}
          <div className="space-y-1.5">
            <label htmlFor="res-notes" className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
              Human Resolution Notes (Audit Trail)
            </label>
            <input
              id="res-notes"
              type="text"
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="e.g. Verified by operator: Both callers describe the same drainage basin overflow."
              className="w-full rounded-lg bg-navy-950 border border-navy-700 p-2 text-xs text-slate-100 placeholder-slate-500 focus:border-teal-400"
            />
          </div>

          {/* Confirm or Reject Actions */}
          <div className="pt-3 border-t border-navy-800 flex items-center justify-between flex-wrap gap-3">
            {mergeSuccess ? (
              <div className="flex items-center gap-2 text-teal-400 text-xs font-semibold">
                <Check className="w-4 h-4" />
                <span>Merge confirmed! Both reports linked and audit log updated.</span>
              </div>
            ) : (
              <span className="text-xs text-slate-400 italic">
                Merging is permanent and creates a fused master record while preserving all raw dispatches.
              </span>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setPreviewData(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-navy-800 hover:bg-navy-700 text-slate-300"
              >
                Reject Fusion
              </button>
              <button
                onClick={handleConfirmMerge}
                disabled={isMerging || mergeSuccess}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-teal-600 hover:bg-teal-500 text-white transition disabled:opacity-50"
              >
                <GitMerge className="w-3.5 h-3.5" />
                <span>{isMerging ? 'Fusing...' : mergeSuccess ? 'Fused' : 'Confirm & Fuse Reports'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
