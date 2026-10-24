import React, { useState, useEffect } from 'react';
import { 
  fetchSources, 
  verifyClaimWithGrounding 
} from '../api/client';
import { 
  ExternalLink, 
  Search, 
  RefreshCw 
} from 'lucide-react';
import { useOnlineStatus } from '../hooks/useRescueData';
import { CardSkeleton, ErrorState, OfflineState } from '../ui';

interface Props {
  announce: (msg: string) => void;
}

export const VerifiedSourcesView: React.FC<Props> = ({ announce }) => {
  const online = useOnlineStatus();

  const [sourcesData, setSourcesData] = useState<any | null>(null);
  const [loadingSources, setLoadingSources] = useState(true);
  // A failed read is not the same as "no agencies configured" — keep them apart.
  const [loadError, setLoadError] = useState<string | null>(null);

  // Claim verification tester
  const [testClaim, setTestClaim] = useState('Flash flood warning for Maplewood River Basin');
  const [testLocation, setTestLocation] = useState('Maplewood Valley');
  const [selectedRegion, setSelectedRegion] = useState<'GLOBAL' | 'US' | 'IN'>('GLOBAL');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any | null>(null);

  const loadSources = async () => {
    setLoadingSources(true);
    setLoadError(null);
    try {
      const res = await fetchSources();
      setSourcesData(res);
    } catch (err: any) {
      setLoadError(
        err?.message ||
          'The grounding source directory could not be read. Claim verification status below is therefore unknown, not confirmed.'
      );
    } finally {
      setLoadingSources(false);
    }
  };

  useEffect(() => {
    loadSources();
  }, []);

  const handleRunVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testClaim.trim()) return;

    try {
      setIsVerifying(true);
      setVerifyResult(null);
      announce('Running Google Search grounding verification...');

      const result = await verifyClaimWithGrounding(testClaim, testLocation, selectedRegion);
      setVerifyResult(result);
      announce(`Verification result: ${result.status}. ${result.verificationNote}`);
    } catch (err: any) {
      setVerifyResult({
        status: 'UNAVAILABLE',
        sources: [],
        verificationNote: err.message || 'Verification request failed.'
      });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      {!online && <OfflineState message="You are offline. Cached source records stay readable, but claim verification against live sources is unavailable until the connection returns." />}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight flex flex-wrap items-center gap-2">
          <span>Verified Sources &amp; Grounding</span>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            Google Search Grounding
          </span>
        </h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Verify critical claims against official meteorological and civil defense agencies.
        </p>
      </div>

      {loadingSources && <CardSkeleton label="Loading grounding source directory" rows={2} />}
      {!loadingSources && loadError && (
        <ErrorState
          title="Grounding source directory unavailable"
          message={loadError}
          onRetry={loadSources}
        />
      )}

      {/* Live Grounding Test Workbench */}
      <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4 shadow-xs">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
          <Search className="w-4 h-4 text-blue-600" />
          <span>Real-Time Grounding Verification Workbench</span>
        </h2>

        <form onSubmit={handleRunVerify} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label htmlFor="test-claim" className="text-xs font-semibold text-slate-700">Claim to Verify:</label>
              <input
                id="test-claim"
                type="text"
                value={testClaim}
                onChange={(e) => setTestClaim(e.target.value)}
                placeholder="e.g. River stage 4A exceeded flood stage"
                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="test-location" className="text-xs font-semibold text-slate-700">Location:</label>
              <input
                id="test-location"
                type="text"
                value={testLocation}
                onChange={(e) => setTestLocation(e.target.value)}
                placeholder="e.g. Maplewood Valley"
                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="test-region" className="text-xs font-semibold text-slate-700">Jurisdiction Focus:</label>
              <select
                id="test-region"
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value as any)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="GLOBAL">Global / Universal Agencies</option>
                <option value="US">United States (NWS / FEMA / USGS)</option>
                <option value="IN">India (NDMA / IMD / CWC)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap justify-between items-center gap-3 pt-1">
            <span className="text-[11px] text-slate-500">
              {loadingSources
                ? 'Checking grounding service status…'
                : loadError
                ? 'Grounding service status unknown: the source directory could not be read.'
                : sourcesData?.service_configured
                ? 'Gemini Search Grounding tool is ready.'
                : 'API key not detected: will return explicit "Verification unavailable".'}
            </span>

            <button
              type="submit"
              disabled={isVerifying}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
              <span>{isVerifying ? 'Verifying with Grounding...' : 'Verify Claim'}</span>
            </button>
          </div>
        </form>

        {/* Verification Result Output */}
        {verifyResult && (
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-2 mt-3">
            <div className="flex justify-between items-center">
              <span className="font-bold text-slate-700">Verification Status:</span>
              <span className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                verifyResult.status === 'VERIFIED'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : verifyResult.status === 'UNAVAILABLE'
                  ? 'bg-slate-100 text-slate-600 border border-slate-300'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}>
                {verifyResult.status}
              </span>
            </div>

            <p className="text-slate-700">{verifyResult.verificationNote}</p>

            {verifyResult.sources && verifyResult.sources.length > 0 && (
              <div className="pt-2 space-y-1.5 border-t border-slate-200">
                <span className="text-slate-600 font-semibold block">Retrieved Grounding Sources:</span>
                {verifyResult.sources.map((src: any, i: number) => (
                  <div key={i} className="p-2 rounded bg-white border border-slate-200 flex justify-between items-center text-[11px]">
                    <span className="text-slate-800">{src.source_name} ({src.domain})</span>
                    <a href={src.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1">
                      <span>Source Link</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Regional Official Guidance Directory */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
          Configurable Official Agencies Guidance
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* India Directory */}
          <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-2 text-xs">
            <span className="font-bold text-slate-900 block">India Guidance Sources</span>
            <div className="space-y-1.5 text-slate-700">
              <div className="p-2 rounded bg-slate-50 border border-slate-200">
                <strong>National Disaster Management Authority (NDMA)</strong>
                <span className="text-[11px] text-blue-600 block">ndma.gov.in</span>
              </div>
              <div className="p-2 rounded bg-slate-50 border border-slate-200">
                <strong>India Meteorological Department (IMD)</strong>
                <span className="text-[11px] text-blue-600 block">mausam.imd.gov.in</span>
              </div>
              <div className="p-2 rounded bg-slate-50 border border-slate-200">
                <strong>Central Water Commission (CWC Flood Alerts)</strong>
                <span className="text-[11px] text-blue-600 block">cwc.gov.in</span>
              </div>
            </div>
          </div>

          {/* US Directory */}
          <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-2 text-xs">
            <span className="font-bold text-slate-900 block">United States Guidance Sources</span>
            <div className="space-y-1.5 text-slate-700">
              <div className="p-2 rounded bg-slate-50 border border-slate-200">
                <strong>National Weather Service (NWS / NOAA)</strong>
                <span className="text-[11px] text-blue-600 block">weather.gov</span>
              </div>
              <div className="p-2 rounded bg-slate-50 border border-slate-200">
                <strong>Federal Emergency Management Agency (FEMA)</strong>
                <span className="text-[11px] text-blue-600 block">fema.gov</span>
              </div>
              <div className="p-2 rounded bg-slate-50 border border-slate-200">
                <strong>USGS Geological Hazards &amp; Water Alerts</strong>
                <span className="text-[11px] text-blue-600 block">usgs.gov</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
