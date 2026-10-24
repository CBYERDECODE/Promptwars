import React from 'react';
import { 
  LayoutDashboard, 
  FilePlus2, 
  ListTree, 
  GitMerge, 
  ShieldCheck, 
  History, 
  Settings 
} from 'lucide-react';

export type NavTab = 
  | 'overview' 
  | 'report' 
  | 'queue' 
  | 'fusion' 
  | 'sources' 
  | 'activity' 
  | 'settings';

interface Props {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  queueCount?: number;
}

export const Sidebar: React.FC<Props> = ({ activeTab, onTabChange, queueCount }) => {
  const navItems: Array<{ id: NavTab; label: string; icon: React.FC<{ className?: string }> }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'report', label: 'Report Incident', icon: FilePlus2 },
    { id: 'queue', label: 'Incident Queue', icon: ListTree },
    { id: 'fusion', label: 'Incident Fusion', icon: GitMerge },
    { id: 'sources', label: 'Verified Sources', icon: ShieldCheck },
    { id: 'activity', label: 'Activity Log', icon: History },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  return (
    <nav 
      aria-label="Main Navigation" 
      className="w-full md:w-64 bg-white md:min-h-[calc(100vh-61px)] border-r border-slate-200 p-3 flex md:flex-col justify-between shrink-0 overflow-x-auto md:overflow-x-visible shadow-xs"
    >
      <div className="flex md:flex-col gap-1 w-full">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition text-left w-full whitespace-nowrap ${
                isActive
                  ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-xs font-semibold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-600' : 'text-slate-500'}`} />
              <span className="flex-1">{item.label}</span>
              {item.id === 'queue' && queueCount !== undefined && queueCount > 0 && (
                <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                  isActive 
                    ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                }`}>
                  {queueCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Subtle Version tag */}
      <div className="hidden md:block pt-4 border-t border-slate-200 text-[11px] text-slate-400 px-3 font-medium">
        ResQ AI v1.0.0 &bull; PromptWars 2026
      </div>
    </nav>
  );
};
