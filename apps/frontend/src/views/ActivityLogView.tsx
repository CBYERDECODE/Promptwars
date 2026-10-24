import React, { useState, useEffect } from 'react';
import { fetchActivityLogs } from '../api/client';
import { Shield, RefreshCw, Trash2 } from 'lucide-react';

export const ActivityLogView: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const res = await fetchActivityLogs();
      setLogs(res.entries || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const handleClear = async () => {
    try {
      await fetch('/api/activity', { method: 'DELETE' });
      setLogs([]);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>Operational Activity Log</span>
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Audit trail of triage operations, intelligence extractions, and fusions.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={loadLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-red-50 border border-slate-200 hover:border-red-300 text-xs font-semibold text-slate-700 hover:text-red-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-600" />
            <span>Clear Log</span>
          </button>
        </div>
      </div>

      <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-center gap-2">
        <Shield className="w-4 h-4 text-blue-600 shrink-0" />
        <span>
          <strong>Privacy Preserving Audit:</strong> Activity logs contain only high-level sanitized action descriptors. No raw caller text, names, phone numbers, or uploaded media bytes are stored in log streams.
        </span>
      </div>

      <div className="space-y-2">
        {logs.map((entry) => (
          <div
            key={entry.id}
            className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs flex justify-between items-center text-xs text-slate-700"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {entry.action_type}
                </span>
                {entry.incident_id && (
                  <span className="font-mono text-[11px] text-slate-500">
                    ID: {entry.incident_id}
                  </span>
                )}
              </div>
              <p className="text-slate-900 font-medium">{entry.summary}</p>
            </div>

            <span className="text-[11px] text-slate-500 font-mono shrink-0 ml-4">
              {new Date(entry.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}

        {logs.length === 0 && !loading && (
          <div className="p-12 text-center text-xs text-slate-600 bg-white rounded-xl border border-slate-200">
            No activity logged yet.
          </div>
        )}
      </div>
    </div>
  );
};
