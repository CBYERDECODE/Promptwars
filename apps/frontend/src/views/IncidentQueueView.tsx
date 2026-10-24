import React, { useState, useEffect } from 'react';
import { 
  fetchIncidents, 
  PaginatedIncidents 
} from '../api/client';
import { 
  IncidentRecord, 
  IncidentStatus, 
  IncidentType, 
  PriorityLevel 
} from '@resq-ai/shared';
import { PriorityBadge } from '../components/PriorityBadge';
import { 
  Search, 
  ArrowUpDown, 
  Clock, 
  MapPin, 
  ChevronLeft, 
  ChevronRight, 
  AlertCircle, 
  RefreshCw, 
  GitMerge 
} from 'lucide-react';
import { useOnlineStatus } from '../hooks/useRescueData';
import { OfflineState } from '../ui';

interface Props {
  isSimulatedMode: boolean;
  onSelectIncident: (incident: IncidentRecord) => void;
  announce: (msg: string) => void;
}

export const IncidentQueueView: React.FC<Props> = ({
  isSimulatedMode,
  onSelectIncident,
  announce
}) => {
  const online = useOnlineStatus();

  const [data, setData] = useState<PaginatedIncidents | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<PriorityLevel | ''>('');
  const [selectedType, setSelectedType] = useState<IncidentType | ''>('');
  const [selectedStatus, setSelectedStatus] = useState<IncidentStatus | ''>('');
  const [sortBy, setSortBy] = useState<'created_at' | 'priority'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const loadIncidents = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchIncidents({
        page,
        limit: 8,
        search: search.trim() || undefined,
        priority: selectedPriority || undefined,
        incident_type: selectedType || undefined,
        status: selectedStatus || undefined,
        sortBy,
        sortOrder,
        is_simulated: isSimulatedMode ? true : undefined
      });
      setData(res);
      announce(`Loaded ${res.items.length} incidents on page ${res.page}.`);
    } catch (err: any) {
      setError(err.message || 'Failed to load incidents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIncidents();
  }, [page, selectedPriority, selectedType, selectedStatus, sortBy, sortOrder, isSimulatedMode]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadIncidents();
  };

  const handleResetFilters = () => {
    setSearch('');
    setSelectedPriority('');
    setSelectedType('');
    setSelectedStatus('');
    setPage(1);
  };

  return (
    <div className="space-y-5">
      {!online && <OfflineState message="You are offline. The queue below is the last copy this device read. Filters and sorting still work on it, but nothing can be re-fetched or updated." />}
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>Incident Queue</span>
            {isSimulatedMode && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 font-semibold">
                Simulated Records
              </span>
            )}
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Real-time intelligence records triaged by deterministic priority rules.
          </p>
        </div>

        <button
          onClick={loadIncidents}
          className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-700 transition shadow-2xs"
          aria-label="Refresh incident queue"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3 shadow-xs">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by keywords, location, hazard, or summary..."
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-white border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white transition shadow-2xs shrink-0"
          >
            Search
          </button>
        </form>

        {/* Filters Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {/* Priority */}
          <select
            value={selectedPriority}
            onChange={(e) => { setSelectedPriority(e.target.value as any); setPage(1); }}
            className="bg-white border border-slate-300 text-slate-800 rounded-lg px-2.5 py-1.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            aria-label="Filter by Priority"
          >
            <option value="">All Priorities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Moderate">Moderate</option>
            <option value="Low">Low</option>
            <option value="Needs review">Needs review</option>
          </select>

          {/* Incident Type */}
          <select
            value={selectedType}
            onChange={(e) => { setSelectedType(e.target.value as any); setPage(1); }}
            className="bg-white border border-slate-300 text-slate-800 rounded-lg px-2.5 py-1.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            aria-label="Filter by Incident Type"
          >
            <option value="">All Types</option>
            <option value="FLOOD">FLOOD</option>
            <option value="FIRE">FIRE</option>
            <option value="BLOCKED_ROAD">BLOCKED_ROAD</option>
            <option value="INFRASTRUCTURE_DAMAGE">INFRASTRUCTURE_DAMAGE</option>
            <option value="HAZARDOUS_MATERIAL">HAZARDOUS_MATERIAL</option>
            <option value="MEDICAL_EMERGENCY">MEDICAL_EMERGENCY</option>
            <option value="OTHER">OTHER</option>
          </select>

          {/* Status */}
          <select
            value={selectedStatus}
            onChange={(e) => { setSelectedStatus(e.target.value as any); setPage(1); }}
            className="bg-white border border-slate-300 text-slate-800 rounded-lg px-2.5 py-1.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            aria-label="Filter by Status"
          >
            <option value="">All Statuses</option>
            <option value="NEW">NEW</option>
            <option value="IN_REVIEW">IN_REVIEW</option>
            <option value="TRIAGED">TRIAGED</option>
            <option value="RESOLVED">RESOLVED</option>
            <option value="FUSED">FUSED</option>
          </select>

          {/* Sort */}
          <div className="flex gap-1">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-white border border-slate-300 text-slate-800 rounded-lg px-2 py-1.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 flex-1"
              aria-label="Sort By"
            >
              <option value="created_at">Time</option>
              <option value="priority">Priority</option>
            </select>
            <button
              onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
              className="px-2 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition"
              aria-label={`Toggle sort direction, currently ${sortOrder}`}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={loadIncidents} className="underline font-semibold hover:text-red-900">
            Retry
          </button>
        </div>
      )}

      {/* Incident List */}
      <div className="space-y-2.5">
        {loading && !data && (
          <div className="p-12 text-center text-xs text-slate-500 space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mx-auto" />
            <p>Loading operational incident queue...</p>
          </div>
        )}

        {data && data.items.length === 0 && (
          <div className="p-12 rounded-xl bg-white border border-slate-200 text-center space-y-3 shadow-xs">
            <p className="text-sm text-slate-700 font-semibold">No incidents found matching current filters.</p>
            <button
              onClick={handleResetFilters}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-xs font-semibold text-blue-700 transition shadow-2xs"
            >
              Reset Filters
            </button>
          </div>
        )}

        {data && data.items.map((inc) => (
          <div
            key={inc.id}
            onClick={() => onSelectIncident(inc)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectIncident(inc); }}
            role="button"
            tabIndex={0}
            className="p-4 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 hover:border-blue-300 transition cursor-pointer text-left space-y-2.5 shadow-xs"
            aria-label={`View details for incident ${inc.id}: ${inc.summary}`}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  {inc.id}
                </span>
                <PriorityBadge priority={inc.priority.level} />
                <span className="text-xs font-bold text-slate-700 uppercase">
                  {inc.incident_type}
                </span>
                {inc.is_fused && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                    <GitMerge className="w-3 h-3" /> Fused
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="px-2 py-0.5 rounded bg-slate-100 font-semibold border border-slate-200 text-slate-600">
                  {inc.status}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(inc.reported_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>

            <p className="text-sm font-medium text-slate-800 line-clamp-2 leading-relaxed">
              {inc.summary}
            </p>

            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 pt-1 border-t border-slate-200 flex-wrap">
              <div className="flex items-center gap-1.5 truncate max-w-md">
                <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="truncate">{inc.reported_location || 'Location Not Specified'}</span>
              </div>

              <div className="flex items-center gap-2">
                <span>Claims: {inc.evidence_items.length}</span>
                {inc.conflicting_information.length > 0 && (
                  <span className="text-amber-700 font-semibold">⚠️ Conflicts</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination Footer */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-600 pt-2">
          <span>
            Showing Page <strong>{data.page}</strong> of <strong>{data.totalPages}</strong> ({data.total} total)
          </span>

          <div className="flex gap-1.5">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={data.page <= 1}
              className="p-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-600 disabled:opacity-40 transition"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
              disabled={data.page >= data.totalPages}
              className="p-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-600 disabled:opacity-40 transition"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
