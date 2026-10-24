import React, { useState } from 'react';
import { ApiError, HealthResponse, resetDemoData } from '../api/client';
import { ShieldAlert, Sparkles, RefreshCw, CheckCircle2, HardDrive, Key, Lock } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useRescueData';
import { Button, Dialog, ErrorState, OfflineState } from '../ui';

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
  const online = useOnlineStatus();
  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [adminToken, setAdminToken] = useState('');

  const closeReset = () => {
    if (resetting) return;
    setResetOpen(false);
  };

  const handleReset = async () => {
    setResetting(true);
    setResetError(null);
    try {
      await resetDemoData(adminToken.trim() || undefined);
      setResetOpen(false);
      setResetSuccess(true);
      announce('Demo dataset reset successfully.');
      setTimeout(() => setResetSuccess(false), 3000);
    } catch (err) {
      // A refusal is shown, never swallowed: the server guards this endpoint with
      // requireAdmin, so "nothing happened" is the common failure and must be visible.
      const message =
        err instanceof ApiError
          ? err.message
          : 'The demo dataset was not reset: the server could not be reached.';
      setResetError(message);
      announce(`Demo reset failed. ${message}`);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      {!online && (
        <OfflineState message="You are offline. Settings shown below are the last values this device read, and none of the administrative actions on this page can reach the server." />
      )}

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

          <Button variant="danger" icon={RefreshCw} onClick={() => setResetOpen(true)} disabled={!online}>
            Reset Default Demo Incidents
          </Button>
        </div>

        {resetSuccess && (
          <div
            role="status"
            className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
            <span>Default demo incidents reloaded successfully!</span>
          </div>
        )}

        {resetError && (
          <ErrorState
            title="Demo data was not reset"
            message={resetError}
            onRetry={() => setResetOpen(true)}
          />
        )}
      </div>

      <Dialog
        open={resetOpen}
        onClose={closeReset}
        title="Reset the demo dataset?"
        description="Every stored incident is replaced with the default fictional scenarios. Recorded decisions are not restored afterwards."
        footer={
          <>
            <Button onClick={closeReset} disabled={resetting}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={RefreshCw}
              onClick={handleReset}
              loading={resetting}
              loadingLabel="Resetting the demo dataset"
            >
              Reset demo data
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-ink-muted leading-5">
            This is an administrative action, so the server requires a coordinator token. Without it the request is
            refused and the stored incidents are left untouched.
          </p>

          <div className="rounded-card border border-line bg-surface-muted px-3 py-2">
            <label htmlFor="reset-admin-token" className="flex items-center gap-2 text-[11px] font-semibold text-ink-muted">
              <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
              Coordinator token
            </label>
            <input
              id="reset-admin-token"
              type="password"
              autoComplete="off"
              value={adminToken}
              onChange={event => setAdminToken(event.target.value)}
              className="mt-2 w-full rounded-control border border-line-strong bg-white px-3 py-2 text-xs text-ink"
            />
            <p className="mt-1 text-[11px] text-ink-subtle">
              Sent as the <code className="font-mono">X-Admin-Token</code> header. It is never stored in the browser.
            </p>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
