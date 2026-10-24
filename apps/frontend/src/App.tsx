import React, { useState, useEffect, Suspense } from 'react';
import { Header } from './components/Header';
import { Sidebar, NavTab } from './components/Sidebar';
import { EmergencyDisclaimer } from './components/EmergencyDisclaimer';
import { IncidentDetailDrawer } from './components/IncidentDetailDrawer';
import { OverviewView } from './views/OverviewView';
import { ReportIncidentView } from './views/ReportIncidentView';
import { IncidentQueueView } from './views/IncidentQueueView';
import { IncidentFusionView } from './views/IncidentFusionView';
import { VerifiedSourcesView } from './views/VerifiedSourcesView';
import { ActivityLogView } from './views/ActivityLogView';
import { SettingsView } from './views/SettingsView';
import { CardSkeleton, ToastProvider } from './ui';
import { fetchHealth, HealthResponse } from './api/client';
import { IncidentRecord } from '@resq-ai/shared';

/**
 * The rescue-intelligence views are route-split so the emergency reporting
 * surfaces (report/queue/fusion) load fast on a slow connection — a first
 * responder must never wait on the decision-support bundle.
 */
const InvisibleVictimsRadar = React.lazy(() =>
  import('./views/rescue/InvisibleVictimsRadar').then(m => ({ default: m.InvisibleVictimsRadar }))
);
const FairRescue = React.lazy(() =>
  import('./views/rescue/FairRescue').then(m => ({ default: m.FairRescue }))
);
const RescueBrain = React.lazy(() =>
  import('./views/rescue/RescueBrain').then(m => ({ default: m.RescueBrain }))
);
const CrisisReplay = React.lazy(() =>
  import('./views/rescue/CrisisReplay').then(m => ({ default: m.CrisisReplay }))
);
const DemoTour = React.lazy(() =>
  import('./views/rescue/DemoTour').then(m => ({ default: m.DemoTour }))
);

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [isSimulatedMode, setIsSimulatedMode] = useState<boolean>(true); // default to safe demo mode
  const [isHotlineModalOpen, setIsHotlineModalOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<IncidentRecord | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const announce = (msg: string) => {
    setLiveAnnouncement(msg);
    setTimeout(() => setLiveAnnouncement(''), 4000);
  };

  const loadHealth = async () => {
    try {
      const data = await fetchHealth();
      setHealth(data);
      if (data.gemini.configured) {
        setIsSimulatedMode(false);
      }
    } catch (err) {
      console.warn('Backend health check initial attempt:', err);
    }
  };

  useEffect(() => {
    loadHealth();
  }, []);

  const handleToggleSimulated = () => {
    const next = !isSimulatedMode;
    setIsSimulatedMode(next);
    announce(next ? 'Switched to Simulated Demo Mode' : 'Switched to Live AI Mode');
  };

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Screen Reader Live Announcements */}
      <div 
        aria-live="polite" 
        aria-atomic="true" 
        className="sr-only" 
        id="a11y-announcements"
      >
        {liveAnnouncement}
      </div>

      {/* Persistent Emergency Disclaimer Banner */}
      <EmergencyDisclaimer
        isModalOpen={isHotlineModalOpen}
        onCloseModal={() => setIsHotlineModalOpen(false)}
      />

      {/* Main Header */}
      <Header
        health={health}
        isSimulatedMode={isSimulatedMode}
        onToggleSimulated={handleToggleSimulated}
        onOpenHotlineModal={() => setIsHotlineModalOpen(true)}
      />

      {/* Shell Layout: Sidebar + Main Content Area */}
      <div className="flex-1 flex flex-col md:flex-row w-full max-w-7xl mx-auto">
        <Sidebar
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            announce(`Navigated to ${tab}`);
          }}
          queueCount={health?.stats.total_incidents_stored}
        />

        <main 
          id="main-content" 
          className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto"
          role="main"
          aria-label="Application content"
        >
          {activeTab === 'overview' && (
            <OverviewView
              health={health}
              onNavigate={(tab) => setActiveTab(tab)}
              isSimulatedMode={isSimulatedMode}
            />
          )}

          {activeTab === 'report' && (
            <ReportIncidentView
              isSimulatedMode={isSimulatedMode}
              onIncidentCreated={() => {
                loadHealth();
                setActiveTab('queue');
              }}
              announce={announce}
            />
          )}

          {activeTab === 'queue' && (
            <IncidentQueueView
              isSimulatedMode={isSimulatedMode}
              onSelectIncident={(inc) => setSelectedIncident(inc)}
              announce={announce}
            />
          )}

          {activeTab === 'fusion' && (
            <IncidentFusionView
              isSimulatedMode={isSimulatedMode}
              onFusionConfirmed={(fused) => {
                setSelectedIncident(fused);
                loadHealth();
              }}
              announce={announce}
            />
          )}

          {activeTab === 'sources' && (
            <VerifiedSourcesView announce={announce} />
          )}

          {activeTab === 'activity' && (
            <ActivityLogView />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              health={health}
              isSimulatedMode={isSimulatedMode}
              onToggleSimulated={handleToggleSimulated}
              onRefreshHealth={loadHealth}
              announce={announce}
            />
          )}

          {/*
            Rescue-intelligence surfaces. Each route is code-split and, while the
            chunk resolves, shows the same skeleton every view uses — so a slow
            connection never produces a blank or shifting layout.
          */}
          <Suspense fallback={<CardSkeleton label="Loading rescue intelligence" rows={6} />}>
            {activeTab === 'demo' && (
              <DemoTour
                onExit={() => {
                  setActiveTab('overview');
                  announce('Guided demo closed');
                }}
              />
            )}

            {activeTab === 'radar' && <InvisibleVictimsRadar />}

            {activeTab === 'fairrescue' && <FairRescue />}

            {activeTab === 'brain' && <RescueBrain />}

            {activeTab === 'replay' && <CrisisReplay />}
          </Suspense>
        </main>
      </div>

      {/* Accessible Detail Drawer */}
      <IncidentDetailDrawer
        incident={selectedIncident}
        onClose={() => setSelectedIncident(null)}
        onIncidentUpdated={(updated) => {
          setSelectedIncident(updated);
          loadHealth();
        }}
      />

      {/* Accessible Footer */}
      <footer role="contentinfo" className="bg-white border-t border-slate-200 text-slate-500 text-xs py-3.5 px-6 text-center">
        ResQ AI Decision Support &bull; Built for PromptWars Hackathon 2026 &bull; Strict Provenance &amp; Deterministic Triage
      </footer>
      </div>
    </ToastProvider>
  );
};
