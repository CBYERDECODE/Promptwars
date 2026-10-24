import React from 'react';
import { Sparkles, PhoneCall, CheckCircle, XCircle } from 'lucide-react';
import { HealthResponse } from '../api/client';

interface Props {
  health: HealthResponse | null;
  isSimulatedMode: boolean;
  onToggleSimulated: () => void;
  onOpenHotlineModal: () => void;
}

export const Header: React.FC<Props> = ({
  health,
  isSimulatedMode,
  onToggleSimulated,
  onOpenHotlineModal
}) => {
  const geminiReady = health?.gemini.configured;

  return (
    <header className="bg-white border-b border-slate-200 shadow-xs px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-30">
      {/* Brand Wordmark & Tagline */}
      <div className="flex items-center gap-3">
        <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 shadow-xs">
          {/* Custom SVG Beacon Shield */}
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M12 8v4" stroke="#2563EB" strokeWidth="2.5" />
            <circle cx="12" cy="16" r="1.2" fill="#2563EB" />
          </svg>
          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-600"></span>
          </span>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-black tracking-tight text-slate-900 flex items-center">
              ResQ<span className="text-blue-600 font-mono ml-0.5">.AI</span>
            </span>
            <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
              Decision Support
            </span>
          </div>
          <p className="text-xs text-slate-500 hidden sm:block">
            Evidence-Aware Incident Intelligence &amp; Multi-Report Fusion
          </p>
        </div>
      </div>

      {/* Header Actions & Badges */}
      <div className="flex items-center flex-wrap gap-2.5 sm:gap-4">
        {/* Immediate Danger Quick Button */}
        <button
          onClick={onOpenHotlineModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition shadow-xs"
          aria-label="Immediate Danger Emergency Numbers"
        >
          <PhoneCall className="w-3.5 h-3.5 text-red-600 animate-pulse" aria-hidden="true" />
          <span className="hidden md:inline">In Danger?</span>
          <span>Emergency Contacts</span>
        </button>

        {/* Gemini Service Status Pill */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border shadow-xs ${
            geminiReady
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-amber-50 text-amber-900 border-amber-200'
          }`}
          title={geminiReady ? `Connected: ${health?.gemini.model}` : 'Gemini key unconfigured'}
        >
          {geminiReady ? (
            <>
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
              <span className="hidden lg:inline text-slate-600 font-normal">Gemini:</span>
              <span className="font-mono text-emerald-800 font-semibold">{health?.gemini.model}</span>
            </>
          ) : (
            <>
              <XCircle className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
              <span className="text-amber-800 font-semibold">Demo Mode</span>
            </>
          )}
        </div>

        {/* Mode Toggle Badge */}
        <button
          onClick={onToggleSimulated}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition border shadow-xs ${
            isSimulatedMode
              ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300'
              : 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600'
          }`}
          aria-pressed={isSimulatedMode}
          title="Toggle between Simulated Demo Mode and Live Mode"
        >
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{isSimulatedMode ? 'MODE: SIMULATED' : 'MODE: LIVE'}</span>
        </button>
      </div>
    </header>
  );
};
