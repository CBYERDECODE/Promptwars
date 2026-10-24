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
      <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-blue-50/80 via-white to-slate-50 border border-blue-200 shadow-xs space-y-3.5 relative overflow-hidden">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-blue-700">
            Emergency Intelligence Decision Support
          </span>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white text-slate-700 border border-slate-300 shadow-2xs">
            PromptWars 2026 Hackathon
          </span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Turn Messy Emergency Noise into Traceable Intelligence
        </h1>

        <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
          ResQ AI ingests chaotic multimodal incident reports (witness voice, 911 transcripts, photos, and alert bulletins) and transforms them into structured, evidence-aware operational records with deterministic priority triage and multi-report Incident Fusion.
        </p>

        <div className="pt-2 flex flex-wrap gap-3">
          <button
            onClick={() => onNavigate('report')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Process New Emergency Report</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onNavigate('queue')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs border border-slate-300 shadow-2xs transition"
          >
            <span>View Triaged Queue</span>
          </button>
        </div>
      </div>

      {/* Core Integrity Pillars Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-blue-700 font-bold text-xs uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            <span>Strict Provenance Standard</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Every extracted claim carries an explicit provenance tag (<code className="bg-sky-50 text-sky-900 border border-sky-200 px-1 py-0.5 rounded font-semibold text-[11px]">USER_REPORTED</code>, <code className="bg-purple-50 text-purple-900 border border-purple-200 px-1 py-0.5 rounded font-semibold text-[11px]">AI_INFERRED</code>, <code className="bg-emerald-50 text-emerald-900 border border-emerald-200 px-1 py-0.5 rounded font-semibold text-[11px]">VERIFIED</code>, or <code className="bg-amber-50 text-amber-950 border border-amber-200 px-1 py-0.5 rounded font-semibold text-[11px]">UNVERIFIED_OR_CONFLICTING</code>). Never fabricated, never inferred without evidence.
          </p>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-amber-800 font-bold text-xs uppercase tracking-wider">
            <AlertOctagon className="w-4 h-4 text-amber-600" />
            <span>Deterministic Priority Engine</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            AI models only extract raw indicators. Priority level is evaluated by pure, explainable deterministic rule tables. Missing location or conflicting statements strictly force <strong className="text-slate-900 font-bold">Needs Review</strong>.
          </p>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs uppercase tracking-wider">
            <GitMerge className="w-4 h-4" />
            <span>Human-Confirmed Fusion</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Correlates duplicate or related dispatches across time, space, and classification. Merging is never automatic: conflicting claims are highlighted, and original records are permanently preserved.
          </p>
        </div>
      </div>

      {/* Quick Architecture & Engine Status */}
      <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Server className="w-4 h-4 text-blue-600" />
            <span>Intelligence Engine &amp; Service Runtime</span>
          </h2>
          <span className="text-xs text-slate-500 font-medium">Environment: {health?.environment || 'development'}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block text-[11px] font-medium">Gemini Model</span>
            <span className="text-slate-900 font-mono font-bold mt-0.5 block truncate">
              {health?.gemini.model || 'gemini-2.5-flash'}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block text-[11px] font-medium">AI Service Status</span>
            <span className={`font-bold mt-0.5 block ${health?.gemini.configured ? 'text-emerald-700' : 'text-amber-800'}`}>
              {health?.gemini.status || 'Checking...'}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block text-[11px] font-medium">Active Mode</span>
            <span className="text-slate-900 font-bold mt-0.5 block">
              {isSimulatedMode ? 'Simulated Demo' : 'Live Extraction'}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block text-[11px] font-medium">Persistence</span>
            <span className="text-slate-900 font-bold mt-0.5 block uppercase">
              {health?.storage_type || 'json file'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
