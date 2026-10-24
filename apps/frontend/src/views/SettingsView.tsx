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
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>Operational Settings &amp; Runtime</span>
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Configure intelligence execution parameters, models, and demo storage controls.
          </p>
        </div>

        <button
          onClick={onRefreshHealth}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
          <span>Refresh Health</span>
        </button>
      </div>

      {/* Mode Configuration Card */}
      <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-600" />
          <span>Execution Mode</span>
        </h2>

        <div className="flex flex-wrap justify-between items-center gap-3 p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
          <div>
            <div className="font-bold text-slate-900">Simulated Demonstration Mode</div>
            <p className="text-slate-600 mt-0.5">
              Processes deterministic emergency mock scenarios without requiring external Google Gemini API credits.
            </p>
          </div>

          <button
            onClick={onToggleSimulated}
            className={`px-3 py-1.5 rounded-lg font-bold border transition shrink-0 ml-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              isSimulatedMode
                ? 'bg-amber-50 text-amber-800 border-amber-300'
                : 'bg-emerald-50 text-emerald-800 border-emerald-300'
            }`}
          >
            {isSimulatedMode ? 'SIMULATED (Active)' : 'LIVE MODE (Active)'}
          </button>
        </div>
      </div>

      {/* Model & AI Runtime Card */}
      <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
          <Key className="w-4 h-4 text-blue-600" />
          <span>Gemini Intelligence Services</span>
        </h2>

        <div className="space-y-2 text-xs">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap justify-between items-center gap-2">
            <span className="text-slate-600">Gemini Model Identifier:</span>
            <span className="font-mono font-bold text-blue-700">{health?.gemini.model || 'gemini-2.5-flash'}</span>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap justify-between items-center gap-2">
            <span className="text-slate-600">API Key Status:</span>
            <span className={`font-semibold ${health?.gemini.configured ? 'text-emerald-700' : 'text-amber-800'}`}>
              {health?.gemini.configured ? 'Active on Server (Server-only GEMINI_API_KEY)' : 'Unset (Server running in Demo Mode)'}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap justify-between items-center gap-2">
            <span className="text-slate-600">Search Grounding Verification:</span>
            <span className="text-slate-900 font-semibold">Separate Grounding Call Tool</span>
          </div>
        </div>
      </div>

      {/* Storage and Limits */}
      <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-blue-600" />
          <span>Storage &amp; Quotas</span>
        </h2>

        <div className="space-y-2 text-xs">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap justify-between items-center gap-2">
            <span className="text-slate-600">Persistence Store:</span>
            <span className="font-bold text-slate-900 uppercase">{health?.storage_type || 'json file store'}</span>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap justify-between items-center gap-2">
            <span className="text-slate-600">Max Upload File Size:</span>
            <span className="font-mono text-slate-900 font-bold">10 MB (MIME &amp; Magic-Byte Validated)</span>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap justify-between items-center gap-2">
            <span className="text-slate-600">Active Stored Incidents:</span>
            <span className="font-mono text-slate-900 font-bold">{health?.stats.total_incidents_stored ?? 4}</span>
          </div>
        </div>
      </div>

      {/* Data Management & Demo Reset */}
      <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-600" />
          <span>Demo Data Management</span>
        </h2>

        <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap justify-between items-center gap-3 text-xs">
          <div>
            <div className="font-bold text-slate-900">Reset Demo Incidents</div>
            <p className="text-slate-600 mt-0.5">
              Restores initial fictional scenarios (Flash flood, Chemical tanker, Blocked road, and Conflicting report).
            </p>
          </div>

          <button
            onClick={handleReset}
            disabled={resetting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-300 hover:border-red-300 transition shrink-0 ml-4 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
            <span>{resetting ? 'Resetting...' : 'Reset Default Demo Incidents'}</span>
          </button>
        </div>

        {resetSuccess && (
          <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>Default demo incidents reloaded successfully!</span>
          </div>
        )}
      </div>
    </div>
  );
};
