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
    <header className="bg-navy-900 border-b border-navy-700/80 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-30">
      {/* Brand Wordmark & Tagline */}
      <div className="flex items-center gap-3">
        <div className="relative flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500/20 to-navy-800 border border-teal-500/40 text-teal-400 shadow-sm">
          {/* Custom SVG Beacon Shield */}
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M12 8v4" stroke="#2dd4bf" strokeWidth="2.5" />
            <circle cx="12" cy="16" r="1.2" fill="#2dd4bf" />
          </svg>
          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-500"></span>
          </span>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-black tracking-tight text-white flex items-center">
              ResQ<span className="text-teal-400 font-mono ml-0.5">.AI</span>
            </span>
            <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded bg-charcoal-700 text-slate-300 border border-charcoal-600">
              Decision Support
            </span>
          </div>
          <p className="text-xs text-slate-400 hidden sm:block">
            Evidence-Aware Incident Intelligence &amp; Multi-Report Fusion
          </p>
        </div>
      </div>

      {/* Header Actions & Badges */}
      <div className="flex items-center flex-wrap gap-2.5 sm:gap-4">
        {/* Immediate Danger Quick Button */}
        <button
          onClick={onOpenHotlineModal}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold bg-rose-950/70 hover:bg-rose-900 text-rose-200 border border-rose-800 transition"
          aria-label="Immediate Danger Emergency Numbers"
        >
          <PhoneCall className="w-3.5 h-3.5 text-rose-400 animate-pulse" aria-hidden="true" />
          <span className="hidden md:inline">In Danger?</span>
          <span>Emergency Contacts</span>
        </button>

        {/* Gemini Service Status Pill */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border ${
            geminiReady
              ? 'bg-navy-850 text-slate-200 border-navy-700'
              : 'bg-charcoal-800 text-slate-400 border-charcoal-700'
          }`}
          title={geminiReady ? `Connected: ${health?.gemini.model}` : 'Gemini key unconfigured'}
        >
          {geminiReady ? (
            <>
              <CheckCircle className="w-3.5 h-3.5 text-teal-400" aria-hidden="true" />
              <span className="hidden lg:inline text-slate-400">Gemini:</span>
              <span className="font-mono text-teal-300 font-semibold">{health?.gemini.model}</span>
            </>
          ) : (
            <>
              <XCircle className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
              <span className="text-amber-300 font-medium">Demo Mode</span>
            </>
          )}
        </div>

        {/* Mode Toggle Badge */}
        <button
          onClick={onToggleSimulated}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition border ${
            isSimulatedMode
              ? 'bg-amber-950/90 text-amber-200 border-amber-600 hover:bg-amber-900'
              : 'bg-teal-950/90 text-teal-200 border-teal-600 hover:bg-teal-900'
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
