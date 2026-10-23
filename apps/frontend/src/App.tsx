import React, { useState, useEffect } from 'react';
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
import { fetchHealth, HealthResponse } from './api/client';
import { IncidentRecord } from '@resq-ai/shared';

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
    <div className="min-h-screen bg-navy-950 text-slate-100 flex flex-col font-sans selection:bg-teal-600 selection:text-white">
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
      <footer role="contentinfo" className="bg-navy-900 border-t border-navy-800 text-slate-500 text-xs py-3 px-6 text-center">
        ResQ AI Decision Support &bull; Built for PromptWars Hackathon 2026 &bull; Strict Provenance &amp; Deterministic Triage
      </footer>
    </div>
  );
};
