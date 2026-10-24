import React from 'react';
import { HealthResponse } from '../api/client';
import { useOnlineStatus } from '../hooks/useRescueData';
import { 
  Badge, 
  Button, 
  Card, 
  MetricTile, 
  OfflineState
} from '../ui';
import { 
  AlertOctagon, 
  GitMerge, 
  ShieldCheck, 
  ArrowUpRight, 
  Sparkles, 
  Server,
  Activity,
  Cpu,
  Database,
  Globe
} from 'lucide-react';

interface Props {
  health: HealthResponse | null;
  onNavigate: (tab: any) => void;
  isSimulatedMode: boolean;
}

export const OverviewView: React.FC<Props> = ({ health, onNavigate, isSimulatedMode }) => {
  const online = useOnlineStatus();

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {!online && (
        <OfflineState message="You are offline. The overview figures shown are the last values this device read and cannot be refreshed until the connection returns." />
      )}
      
      {/* Hero Section: The Problem Statement */}
      <section 
        className="relative overflow-hidden p-6 sm:p-10 rounded-2xl border border-line bg-surface shadow-xs"
        aria-labelledby="overview-hero-title"
      >
        {/* Subtle background decoration */}
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-accent/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-64 h-64 bg-blue-400/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <Badge tone="accent" icon={Activity}>
              Emergency Intelligence Decision Support
            </Badge>
            <Badge tone="neutral" size="sm" className="bg-surface border-line shadow-2xs">
              PromptWars 2026 Hackathon
            </Badge>
          </div>

          <h1 id="overview-hero-title" className="text-3xl sm:text-4xl font-extrabold text-ink tracking-tight max-w-2xl leading-[1.1]">
            Turn Messy Emergency Noise into <span className="text-accent">Traceable Intelligence</span>
          </h1>

          <p className="text-sm sm:text-base text-ink-subtle max-w-3xl leading-relaxed">
            ResQ AI ingests chaotic multimodal incident reports (witness voice, 911 transcripts, photos, and alert bulletins) and transforms them into structured, evidence-aware operational records with deterministic priority triage and multi-report Incident Fusion.
          </p>

          <div className="pt-2 flex flex-wrap gap-3">
            <Button
              variant="primary"
              icon={Sparkles}
              onClick={() => onNavigate('report')}
              className="shadow-sm hover:scale-[1.02] active:scale-[0.98]"
            >
              Process New Emergency Report
            </Button>
            <Button
              variant="secondary"
              icon={ArrowUpRight}
              onClick={() => onNavigate('queue')}
              className="hover:scale-[1.02] active:scale-[0.98]"
            >
              View Triaged Queue
            </Button>
          </div>
        </div>
      </section>

      {/* Core Pillars: The Mission Control Standards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card 
          accentRail 
          tone="accent" 
          icon={ShieldCheck} 
          title="Strict Provenance Standard"
          className="hover:shadow-md hover:-translate-y-1 transition-all duration-300"
        >
          <p className="text-xs text-ink-subtle leading-relaxed">
            Every extracted claim carries an explicit provenance tag (<code className="font-mono text-[10px] text-accent font-bold">USER_REPORTED</code>, <code className="font-mono text-[10px] text-accent font-bold">AI_INFERRED</code>, <code className="font-mono text-[10px] text-accent font-bold">VERIFIED</code>). Never fabricated, never inferred without evidence.
          </p>
        </Card>

        <Card 
          accentRail 
          tone="warning" 
          icon={AlertOctagon} 
          title="Deterministic Priority Engine"
          className="hover:shadow-md hover:-translate-y-1 transition-all duration-300"
        >
          <p className="text-xs text-ink-subtle leading-relaxed">
            AI models only extract raw indicators. Priority level is evaluated by pure, explainable deterministic rule tables. Missing location or conflicting statements strictly force <strong className="text-ink font-bold">Needs Review</strong>.
          </p>
        </Card>

        <Card 
          accentRail 
          tone="neutral" 
          icon={GitMerge} 
          title="Human-Confirmed Fusion"
          className="hover:shadow-md hover:-translate-y-1 transition-all duration-300"
        >
          <p className="text-xs text-ink-subtle leading-relaxed">
            Correlates duplicate or related dispatches across time, space, and classification. Merging is never automatic: conflicting claims are highlighted, and original records are permanently preserved.
          </p>
        </Card>
      </div>

      {/* Engine Status: The Runtime Dashboard */}
      <Card 
        icon={Server} 
        title="Intelligence Engine & Service Runtime" 
        actions={
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted bg-surface-sunken px-2 py-0.5 rounded border border-line">
            Env: {health?.environment || 'production'}
          </span>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricTile
            label="Gemini Model"
            value={health?.gemini.model || 'gemini-1.5-flash'}
            icon={Cpu}
            className="bg-surface-sunken/50 border-dashed"
          />
          <MetricTile
            label="AI Service Status"
            value={health?.gemini.status || 'Active'}
            icon={Activity}
            tone={health?.gemini.configured ? 'success' : 'warning'}
            status={health ? {
              tone: health.gemini.configured ? 'success' : 'warning',
              icon: health.gemini.configured ? ShieldCheck : AlertOctagon,
              label: health.gemini.configured ? 'Operational' : 'Demo Mode'
            } : undefined}
            className="bg-surface-sunken/50 border-dashed"
          />
          <MetricTile
            label="Active Mode"
            value={isSimulatedMode ? 'Simulated' : 'Live'}
            icon={Globe}
            tone={isSimulatedMode ? 'neutral' : 'accent'}
            className="bg-surface-sunken/50 border-dashed"
          />
          <MetricTile
            label="Persistence"
            value={health?.storage_type === 'json' ? 'JSON' : 'Memory'}
            icon={Database}
            className="bg-surface-sunken/50 border-dashed"
          />
        </div>
      </Card>
    </div>
  );
};
