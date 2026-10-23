import React from 'react';
import { HealthResponse } from '../api/client';
import { 
  AlertOctagon, 
  GitMerge, 
  ShieldCheck, 
  ArrowRight, 
  Sparkles, 
  Server 
} from 'lucide-react';

interface Props {
  health: HealthResponse | null;
  onNavigate: (tab: any) => void;
  isSimulatedMode: boolean;
}

export const OverviewView: React.FC<Props> = ({ health, onNavigate, isSimulatedMode }) => {
  return (
    <div className="space-y-6">
      {/* Hero Problem Statement & System Status */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-navy-900 via-navy-850 to-navy-900 border border-teal-500/30 space-y-3 relative overflow-hidden">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-teal-400">
            Emergency Intelligence Decision Support
          </span>
          <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-navy-950 text-slate-300 border border-navy-700">
            PromptWars 2026 Hackathon
          </span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          Turn Messy Emergency Noise into Traceable Intelligence
        </h1>

        <p className="text-sm text-slate-300 max-w-3xl leading-relaxed">
          ResQ AI ingests chaotic multimodal incident reports (witness voice, 911 transcripts, photos, and alert bulletins) and transforms them into structured, evidence-aware operational records with deterministic priority triage and multi-report Incident Fusion.
        </p>

        <div className="pt-2 flex flex-wrap gap-3">
          <button
            onClick={() => onNavigate('report')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Process New Emergency Report</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onNavigate('queue')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-navy-800 hover:bg-navy-700 text-slate-200 font-semibold text-xs border border-navy-700 transition"
          >
            <span>View Triaged Queue</span>
          </button>
        </div>
      </div>

      {/* Core Integrity Pillars Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-navy-900 border border-navy-800 space-y-2">
          <div className="flex items-center gap-2 text-teal-400 font-bold text-xs uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            <span>Strict Provenance Standard</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Every extracted claim carries an explicit provenance tag (<code className="text-sky-300 font-semibold">USER_REPORTED</code>, <code className="text-purple-300 font-semibold">AI_INFERRED</code>, <code className="text-emerald-300 font-semibold">VERIFIED</code>, or <code className="text-amber-300 font-semibold">UNVERIFIED_OR_CONFLICTING</code>). Never fabricated, never inferred without evidence.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-navy-900 border border-navy-800 space-y-2">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
            <AlertOctagon className="w-4 h-4" />
            <span>Deterministic Priority Engine</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            AI models only extract raw indicators. Priority level is evaluated by pure, explainable deterministic rule tables. Missing location or conflicting statements strictly force <strong className="text-white">Needs Review</strong>.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-navy-900 border border-navy-800 space-y-2">
          <div className="flex items-center gap-2 text-sky-400 font-bold text-xs uppercase tracking-wider">
            <GitMerge className="w-4 h-4" />
            <span>Human-Confirmed Fusion</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Correlates duplicate or related dispatches across time, space, and classification. Merging is never automatic: conflicting claims are highlighted, and original records are permanently preserved.
          </p>
        </div>
      </div>

      {/* Quick Architecture & Engine Status */}
      <div className="p-5 rounded-xl bg-navy-900 border border-navy-800 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Server className="w-4 h-4 text-teal-400" />
            <span>Intelligence Engine &amp; Service Runtime</span>
          </h2>
          <span className="text-xs text-slate-400">Environment: {health?.environment || 'development'}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-navy-950 border border-navy-800">
            <span className="text-slate-400 block text-[11px]">Gemini Model</span>
            <span className="text-white font-mono font-bold mt-0.5 block truncate">
              {health?.gemini.model || 'gemini-2.5-flash'}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-navy-950 border border-navy-800">
            <span className="text-slate-400 block text-[11px]">AI Service Status</span>
            <span className={`font-bold mt-0.5 block ${health?.gemini.configured ? 'text-teal-400' : 'text-amber-400'}`}>
              {health?.gemini.status || 'Checking...'}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-navy-950 border border-navy-800">
            <span className="text-slate-400 block text-[11px]">Active Mode</span>
            <span className="text-white font-bold mt-0.5 block">
              {isSimulatedMode ? 'Simulated Demo' : 'Live Extraction'}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-navy-950 border border-navy-800">
            <span className="text-slate-400 block text-[11px]">Persistence</span>
            <span className="text-white font-bold mt-0.5 block uppercase">
              {health?.storage_type || 'json file'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
