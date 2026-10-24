import React from 'react';
import { useOnlineStatus } from '../hooks/useRescueData';
import { 
  Badge, 
  Button, 
  Card, 
  OfflineState
} from '../ui';
import { 
  AlertOctagon, 
  GitMerge, 
  ShieldCheck, 
  PlayCircle, 
  Zap, 
  CheckCircle2, 
  Users2
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
      
      {/* New Template Hero Section */}
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
        <div className="flex flex-col lg:flex-row min-h-[500px]">
          {/* Left Side: Copy & CTA */}
          <div className="flex-1 p-8 sm:p-12 lg:p-16 flex flex-col justify-center space-y-8">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-accent">
                <Zap className="w-5 h-5 fill-accent" />
                <span className="text-xs font-black uppercase tracking-[0.2em]">Operational Intelligence</span>
              </div>
              <h1 id="overview-hero-title" className="text-5xl sm:text-6xl lg:text-7xl font-black text-ink tracking-tighter leading-[0.9]">
                Traceable Intelligence <br /> 
                <span className="text-accent/90">for Life Safety.</span>
              </h1>
              <p className="text-lg text-ink-subtle max-w-xl leading-relaxed font-medium">
                ResQ AI transforms chaotic emergency noise into structured, evidence-aware operational records with deterministic triage.
              </p>
            </div>

            <div className="flex flex-wrap gap-5">
              <Button
                variant="primary"
                size="md"
                className="h-14 px-8 text-sm uppercase tracking-widest rounded-full shadow-lg shadow-accent/20 hover:scale-105 transition-transform"
                onClick={() => onNavigate('report')}
              >
                Launch Command Center
              </Button>
              <button className="flex items-center gap-3 px-6 py-3 text-xs font-bold uppercase tracking-widest text-ink hover:text-accent transition-colors group">
                <PlayCircle className="w-8 h-8 group-hover:scale-110 transition-transform" />
                <span>Watch Overview</span>
              </button>
            </div>

            <div className="pt-4 flex items-center gap-2 text-[11px] font-bold text-ink-muted uppercase tracking-wider">
              <span className="text-critical">*</span>
              <span>100% Deterministic Core</span>
              <span className="mx-2 opacity-30">•</span>
              <span>Human-in-the-loop validation</span>
            </div>
          </div>

          {/* Right Side: Geometric Illustration */}
          <div className="lg:w-[45%] bg-slate-50 relative overflow-hidden border-l border-line flex items-center justify-center">
            {/* Using the text-to-image API for a technical/abstract illustration */}
            <img 
              src="https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=abstract+emergency+intelligence+dashboard+geometric+shapes+technical+diagram+high+contrast+minimalist+navy+and+blue+accents+architectural+elements&image_size=portrait_4_3" 
              alt="System Intelligence Illustration" 
              className="w-full h-full object-cover opacity-90 mix-blend-multiply"
            />
            {/* Overlay elements to match the template's geometric feel */}
            <div className="absolute top-10 right-10 w-24 h-24 border-4 border-accent opacity-20 rotate-12" />
            <div className="absolute bottom-20 left-10 w-16 h-16 bg-critical opacity-10 rounded-full blur-2xl" />
          </div>
        </div>

        {/* Footer Statistics Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 border-t border-line divide-x divide-line bg-surface-muted/30">
          <div className="p-8 flex flex-col gap-1">
            <div className="flex -space-x-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-slate-200 overflow-hidden">
                  <img src={`https://i.pravatar.cc/150?u=${i}`} alt="user" />
                </div>
              ))}
            </div>
            <span className="text-2xl font-black text-ink mt-2">12k+</span>
            <span className="text-[10px] font-bold text-ink-muted uppercase tracking-widest">Reports Triaged</span>
          </div>
          <div className="p-8 flex flex-col gap-1">
            <CheckCircle2 className="w-6 h-6 text-success mb-2" />
            <span className="text-2xl font-black text-ink">99.9%</span>
            <span className="text-[10px] font-bold text-ink-muted uppercase tracking-widest">Decision Traceability</span>
          </div>
          <div className="p-8 flex flex-col gap-1">
            <Users2 className="w-6 h-6 text-accent mb-2" />
            <span className="text-2xl font-black text-ink">450+</span>
            <span className="text-[10px] font-bold text-ink-muted uppercase tracking-widest">Agencies Integrated</span>
          </div>
          <div className="p-8 flex flex-col gap-6 justify-center">
            <div className="flex items-center gap-6 opacity-40 grayscale">
              <span className="text-lg font-black tracking-tighter">FEDERAL</span>
              <span className="text-lg font-black tracking-tighter">STATE</span>
              <span className="text-lg font-black tracking-tighter">LOCAL</span>
            </div>
          </div>
        </div>
      </section>

      {/* Core Pillars: Mission Control Standards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card 
          accentRail 
          tone="accent" 
          icon={ShieldCheck} 
          title="Strict Provenance"
          className="hover:shadow-xl hover:-translate-y-2 transition-all duration-500 rounded-3xl"
        >
          <p className="text-xs text-ink-subtle leading-relaxed font-medium">
            Every extracted claim carries an explicit provenance tag. Never fabricated, never inferred without evidence.
          </p>
        </Card>

        <Card 
          accentRail 
          tone="warning" 
          icon={AlertOctagon} 
          title="Deterministic Core"
          className="hover:shadow-xl hover:-translate-y-2 transition-all duration-500 rounded-3xl"
        >
          <p className="text-xs text-ink-subtle leading-relaxed font-medium">
            AI only extracts indicators. Priority is evaluated by pure, explainable deterministic rule tables.
          </p>
        </Card>

        <Card 
          accentRail 
          tone="neutral" 
          icon={GitMerge} 
          title="Human-in-the-loop"
          className="hover:shadow-xl hover:-translate-y-2 transition-all duration-500 rounded-3xl"
        >
          <p className="text-xs text-ink-subtle leading-relaxed font-medium">
            Merging is never automatic. Conflicting claims are highlighted, and human confirm is mandatory.
          </p>
        </Card>
      </div>

    </div>
  );
};
