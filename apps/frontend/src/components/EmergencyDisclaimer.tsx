import React, { useEffect, useRef } from 'react';
import { AlertTriangle, Phone, ExternalLink, X } from 'lucide-react';

interface Props {
  isModalOpen: boolean;
  onCloseModal: () => void;
}

export const EmergencyDisclaimer: React.FC<Props> = ({ isModalOpen, onCloseModal }) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isModalOpen) {
      closeButtonRef.current?.focus();
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onCloseModal();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isModalOpen, onCloseModal]);

  return (
    <>
      {/* Persistent Sticky Top Banner */}
      <div 
        className="bg-rose-950/90 text-rose-100 border-b border-rose-800/80 px-4 py-2 text-xs font-medium flex items-center justify-between gap-3"
        role="alert"
        aria-label="Emergency warning disclaimer"
      >
        <div className="flex items-center gap-2 max-w-5xl">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" aria-hidden="true" />
          <span>
            <strong>CRITICAL NOTICE:</strong> In immediate danger, contact local emergency services now. Do not wait for AI analysis. ResQ AI provides operational decision support, not dispatch triage.
          </span>
        </div>
      </div>

      {/* Emergency Resources Directory Modal */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="emergency-modal-title"
        >
          <div className="bg-navy-900 border border-rose-700/60 rounded-xl max-w-lg w-full p-6 shadow-2xl relative text-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-navy-700">
              <div className="flex items-center gap-2.5 text-rose-400">
                <Phone className="w-5 h-5" aria-hidden="true" />
                <h2 id="emergency-modal-title" className="text-lg font-bold text-white">
                  Official Emergency Contacts
                </h2>
              </div>
              <button
                ref={closeButtonRef}
                onClick={onCloseModal}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-navy-800 transition"
                aria-label="Close emergency contacts modal"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <p className="text-xs text-slate-300 mt-3 mb-4 leading-relaxed">
              ResQ AI does not place emergency telephone calls or transmit dispatches. If you are experiencing a life-threatening crisis, dial your official regional emergency dispatch service immediately:
            </p>

            <div className="space-y-3 text-xs">
              {/* United States */}
              <div className="p-3 rounded-lg bg-navy-850 border border-navy-700">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-white">United States &amp; Canada</span>
                  <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 font-mono font-bold">911</span>
                </div>
                <p className="text-slate-400 text-[11px]">Police, Fire, Emergency Medical Services (EMS)</p>
                <a 
                  href="https://www.ready.gov" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="inline-flex items-center gap-1 text-teal-400 hover:underline mt-1"
                >
                  FEMA Disaster Assistance (Ready.gov) <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* India */}
              <div className="p-3 rounded-lg bg-navy-850 border border-navy-700">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-white">India</span>
                  <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 font-mono font-bold">112</span>
                </div>
                <p className="text-slate-400 text-[11px]">Emergency Response Support System (ERSS) / NDMA Helpline: 1078</p>
                <a 
                  href="https://ndma.gov.in" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="inline-flex items-center gap-1 text-teal-400 hover:underline mt-1"
                >
                  National Disaster Management Authority (ndma.gov.in) <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* International / Europe */}
              <div className="p-3 rounded-lg bg-navy-850 border border-navy-700">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-white">European Union &amp; UK</span>
                  <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 font-mono font-bold">112 / 999</span>
                </div>
                <p className="text-slate-400 text-[11px]">Universal European Emergency Number (112) / UK Emergency (999)</p>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-navy-800 text-right">
              <button
                onClick={onCloseModal}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-navy-800 hover:bg-navy-700 text-slate-200 transition"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
