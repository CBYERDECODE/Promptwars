import React, { useState } from 'react';
import { HealthResponse, resetDemoData } from '../api/client';
import { ShieldAlert, Sparkles, RefreshCw, CheckCircle2, HardDrive, Key } from 'lucide-react';

interface Props {
  health: HealthResponse | null;
  isSimulatedMode: boolean;
  onToggleSimulated: () => void;
  onRefreshHealth: () => void;
  announce: (msg: string) => void;
}

export const SettingsView: React.FC<Props> = ({
  health,
  isSimulatedMode,
  onToggleSimulated,
  onRefreshHealth,
  announce
}) => {
  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleReset = async () => {
    if (!confirm('Are you sure you want to reset demo data back to default initial records?')) {
      return;
    }

    try {
      setResetting(true);
      await resetDemoData();
      setResetSuccess(true);
      announce('Demo dataset reset successfully.');
      setTimeout(() => setResetSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <span>Operational Settings &amp; Runtime</span>
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Configure intelligence execution parameters, models, and demo storage controls.
          </p>
        </div>

        <button
          onClick={onRefreshHealth}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-850 hover:bg-navy-800 border border-navy-700 text-xs font-semibold text-slate-300 transition"
        >
          <RefreshCw className="w-3.5 h-3.5 text-teal-400" />
          <span>Refresh Health</span>
        </button>
      </div>

      {/* Mode Configuration Card */}
      <div className="p-5 rounded-xl bg-navy-900 border border-navy-800 space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-teal-400" />
          <span>Execution Mode</span>
        </h2>

        <div className="flex justify-between items-center p-3.5 rounded-lg bg-navy-950 border border-navy-800 text-xs">
          <div>
            <div className="font-bold text-white">Simulated Demonstration Mode</div>
            <p className="text-slate-400 mt-0.5">
              Processes deterministic emergency mock scenarios without requiring external Google Gemini API credits.
            </p>
          </div>

          <button
            onClick={onToggleSimulated}
            className={`px-3 py-1.5 rounded-lg font-bold border transition shrink-0 ml-4 ${
              isSimulatedMode
                ? 'bg-amber-950 text-amber-200 border-amber-600'
                : 'bg-teal-950 text-teal-200 border-teal-600'
            }`}
          >
            {isSimulatedMode ? 'SIMULATED (Active)' : 'LIVE MODE (Active)'}
          </button>
        </div>
      </div>

      {/* Model & AI Runtime Card */}
      <div className="p-5 rounded-xl bg-navy-900 border border-navy-800 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
          <Key className="w-4 h-4 text-teal-400" />
          <span>Gemini Intelligence Services</span>
        </h2>

        <div className="space-y-2 text-xs">
          <div className="p-3 rounded-lg bg-navy-950 border border-navy-800 flex justify-between items-center">
            <span className="text-slate-400">Gemini Model Identifier:</span>
            <span className="font-mono font-bold text-teal-300">{health?.gemini.model || 'gemini-2.5-flash'}</span>
          </div>

          <div className="p-3 rounded-lg bg-navy-950 border border-navy-800 flex justify-between items-center">
            <span className="text-slate-400">API Key Status:</span>
            <span className={`font-semibold ${health?.gemini.configured ? 'text-teal-400' : 'text-amber-400'}`}>
              {health?.gemini.configured ? 'Active on Server (Server-only GEMINI_API_KEY)' : 'Unset (Server running in Demo Mode)'}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-navy-950 border border-navy-800 flex justify-between items-center">
            <span className="text-slate-400">Search Grounding Verification:</span>
            <span className="text-slate-200 font-semibold">Separate Grounding Call Tool</span>
          </div>
        </div>
      </div>

      {/* Storage and Limits */}
      <div className="p-5 rounded-xl bg-navy-900 border border-navy-800 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-teal-400" />
          <span>Storage &amp; Quotas</span>
        </h2>

        <div className="space-y-2 text-xs">
          <div className="p-3 rounded-lg bg-navy-950 border border-navy-800 flex justify-between items-center">
            <span className="text-slate-400">Persistence Store:</span>
            <span className="font-bold text-white uppercase">{health?.storage_type || 'json file store'}</span>
          </div>

          <div className="p-3 rounded-lg bg-navy-950 border border-navy-800 flex justify-between items-center">
            <span className="text-slate-400">Max Upload File Size:</span>
            <span className="font-mono text-slate-200 font-bold">10 MB (MIME &amp; Magic-Byte Validated)</span>
          </div>

          <div className="p-3 rounded-lg bg-navy-950 border border-navy-800 flex justify-between items-center">
            <span className="text-slate-400">Active Stored Incidents:</span>
            <span className="font-mono text-slate-200 font-bold">{health?.stats.total_incidents_stored ?? 4}</span>
          </div>
        </div>
      </div>

      {/* Data Management & Demo Reset */}
      <div className="p-5 rounded-xl bg-navy-900 border border-navy-800 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <span>Demo Data Management</span>
        </h2>

        <div className="p-3.5 rounded-lg bg-navy-950 border border-navy-800 flex justify-between items-center text-xs">
          <div>
            <div className="font-bold text-white">Reset Demo Incidents</div>
            <p className="text-slate-400 mt-0.5">
              Restores initial fictional scenarios (Flash flood, Chemical tanker, Blocked road, and Conflicting report).
            </p>
          </div>

          <button
            onClick={handleReset}
            disabled={resetting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-navy-800 hover:bg-rose-950 text-slate-200 hover:text-rose-200 border border-navy-700 hover:border-rose-800 transition shrink-0 ml-4"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
            <span>{resetting ? 'Resetting...' : 'Reset Default Demo Incidents'}</span>
          </button>
        </div>

        {resetSuccess && (
          <div className="p-2.5 rounded-lg bg-emerald-950/70 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>Default demo incidents reloaded successfully!</span>
          </div>
        )}
      </div>
    </div>
  );
};
