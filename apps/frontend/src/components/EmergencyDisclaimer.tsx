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
        className="bg-red-50 text-red-900 border-b border-red-200 px-4 py-2 text-xs font-medium flex items-center justify-between gap-3 shadow-xs"
        role="alert"
        aria-label="Emergency warning disclaimer"
      >
        <div className="flex items-center gap-2 max-w-5xl">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" aria-hidden="true" />
          <span>
            <strong className="text-red-950 font-bold uppercase tracking-wide">Critical Notice:</strong> In immediate danger, contact local emergency services now. Do not wait for AI analysis. ResQ AI provides operational decision support, not dispatch triage.
          </span>
        </div>
      </div>

      {/* Emergency Resources Directory Modal */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="emergency-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative text-slate-800">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5 text-red-600">
                <Phone className="w-5 h-5" aria-hidden="true" />
                <h2 id="emergency-modal-title" className="text-lg font-bold text-slate-900">
                  Official Emergency Contacts
                </h2>
              </div>
              <button
                ref={closeButtonRef}
                onClick={onCloseModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                aria-label="Close emergency contacts modal"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <p className="text-xs text-slate-600 mt-3 mb-4 leading-relaxed">
              ResQ AI does not place emergency telephone calls or transmit dispatches. If you are experiencing a life-threatening crisis, dial your official regional emergency dispatch service immediately:
            </p>

            <div className="space-y-3 text-xs">
              {/* United States */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-slate-900">United States &amp; Canada</span>
                  <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200 font-mono font-bold">911</span>
                </div>
                <p className="text-slate-600 text-[11px]">Police, Fire, Emergency Medical Services (EMS)</p>
                <a 
                  href="https://www.ready.gov" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium hover:underline mt-1"
                >
                  FEMA Disaster Assistance (Ready.gov) <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* India */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-slate-900">India</span>
                  <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200 font-mono font-bold">112</span>
                </div>
                <p className="text-slate-600 text-[11px]">Emergency Response Support System (ERSS) / NDMA Helpline: 1078</p>
                <a 
                  href="https://ndma.gov.in" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium hover:underline mt-1"
                >
                  National Disaster Management Authority (ndma.gov.in) <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* International / Europe */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-slate-900">European Union &amp; UK</span>
                  <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200 font-mono font-bold">112 / 999</span>
                </div>
                <p className="text-slate-600 text-[11px]">Universal European Emergency Number (112) / UK Emergency (999)</p>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-200 text-right">
              <button
                onClick={onCloseModal}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 transition"
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
