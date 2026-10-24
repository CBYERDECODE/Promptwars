import React from 'react';
import { useOnlineStatus } from '../hooks/useRescueData';
import { 
  Badge, 
  Button, 
  OfflineState
} from '../ui';
import { 
  PlayCircle, 
  Zap
} from 'lucide-react';

interface Props {
  onNavigate: (tab: any) => void;
}

export const OverviewView: React.FC<Props> = ({ onNavigate }) => {
  const online = useOnlineStatus();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {!online && (
        <OfflineState message="You are offline. The overview figures shown are the last values this device read and cannot be refreshed until the connection returns." />
      )}
      
      {/* Hero Section */}
      <section 
        className="relative overflow-hidden rounded-3xl border border-line bg-white shadow-xl flex flex-col"
        aria-labelledby="overview-hero-title"
      >
        {/* Top Info Bar */}
        <div className="px-8 py-4 border-b border-line flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-ink-muted">
          <div className="flex items-center gap-4">
            <span>// Emergency Intel</span>
            <span className="text-line">|</span>
            <span>ResQ AI System v1.0</span>
          </div>
          <div className="flex items-center gap-6">
            <span className="hover:text-accent cursor-pointer transition-colors">Program</span>
            <span className="hover:text-accent cursor-pointer transition-colors">Safety</span>
            <span className="hover:text-accent cursor-pointer transition-colors">Audit</span>
            <Badge tone="neutral" size="sm" className="bg-ink text-white border-transparent">
              Live Feed
            </Badge>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex flex-col min-h-[400px]">
          {/* Copy & CTA */}
          <div className="flex-1 p-8 sm:p-12 lg:p-16 flex flex-col justify-center items-center text-center space-y-8">
            <div className="space-y-6 max-w-4xl">
              <div className="flex items-center justify-center gap-2 text-accent">
                <Zap className="w-5 h-5 fill-accent" />
                <span className="text-xs font-black uppercase tracking-[0.2em]">Operational Intelligence</span>
              </div>
              <h1 id="overview-hero-title" className="text-5xl sm:text-6xl lg:text-7xl font-black text-ink tracking-tighter leading-[1]">
                Traceable Intelligence <br /> 
                <span className="text-accent/90">for Life Safety.</span>
              </h1>
              <p className="text-lg sm:text-xl text-ink-subtle max-w-2xl mx-auto leading-relaxed font-medium">
                ResQ AI transforms chaotic emergency noise into structured, evidence-aware operational records with deterministic triage.
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-5">
              <Button
                variant="primary"
                size="md"
                className="h-14 px-10 text-sm uppercase tracking-widest rounded-full shadow-lg shadow-accent/20 hover:scale-105 transition-transform"
                onClick={() => onNavigate('report')}
              >
                Launch Command Center
              </Button>
              <button className="flex items-center gap-3 px-6 py-3 text-xs font-bold uppercase tracking-widest text-ink hover:text-accent transition-colors group">
                <PlayCircle className="w-8 h-8 group-hover:scale-110 transition-transform" />
                <span>Watch Overview</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
