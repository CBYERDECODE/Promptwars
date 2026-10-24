import React, { useState, useRef } from 'react';
import { 
  analyzeIncident, 
  createIncident, 
  AnalysisResponse 
} from '../api/client';
import { PriorityBadge } from '../components/PriorityBadge';
import { ProvenanceBadge } from '../components/ProvenanceBadge';
import { 
  Upload, 
  X, 
  Mic, 
  MicOff, 
  Sparkles, 
  AlertCircle, 
  CheckCircle2, 
  Send 
} from 'lucide-react';
import { useOnlineStatus } from '../hooks/useRescueData';
import { OfflineState } from '../ui';

interface Props {
  isSimulatedMode: boolean;
  onIncidentCreated: () => void;
  announce: (msg: string) => void;
}

const SAMPLE_REPORTS = [
  {
    label: '🌊 Flash Flood',
    type: 'flood',
    text: 'Severe flash flooding near 104 Main Street, water rising rapidly past 3 feet! Elderly resident trapped on ground floor porch, road submerged.',
    location: '104 Main Street, Riverside'
  },
  {
    label: '🔥 Structure Fire',
    type: 'fire',
    text: 'Heavy black smoke pouring from commercial warehouse near East 4th Ave. Multiple explosions heard from chemical storage bay. Evacuation ongoing.',
    location: 'East 4th Ave & Bay Street'
  },
  {
    label: '🚧 Blocked Highway',
    type: 'blocked_road',
    text: 'Mudslide completely blocking two northbound lanes on Route 101 MM 42. Large boulder obstructing shoulder. No injuries observed.',
    location: 'Route 101 Northbound MM 42'
  },
  {
    label: '⚡ Fallen Infrastructure',
    type: 'infrastructure',
    text: 'High voltage utility pole snapped on Willow Creek Drive. Live wires sparking on wet pavement across residential driveway. No casualties reported.',
    location: 'Willow Creek Drive near Oak Court'
  }
];

export const ReportIncidentView: React.FC<Props> = ({
  isSimulatedMode,
  onIncidentCreated,
  announce
}) => {
  const online = useOnlineStatus();

  const [reportText, setReportText] = useState('');
  const [locationOverride, setLocationOverride] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Speech to Text feature detection
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle Speech-to-Text
  const handleToggleVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMsg('Voice transcription is not supported in this browser. Please type or paste your report.');
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      announce('Voice recording stopped.');
    } else {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          let currentTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
          }
          setReportText(prev => (prev ? prev + ' ' : '') + currentTranscript);
        };

        recognition.onerror = (event: any) => {
          setIsRecording(false);
          setErrorMsg(
            `Voice input stopped: ${event?.error || 'the microphone reported an error'}. You can keep typing the report.`
          );
          announce('Voice input stopped.');
        };

        recognition.onend = () => {
          setIsRecording(false);
        };

        recognition.start();
        recognitionRef.current = recognition;
        setIsRecording(true);
        announce('Listening for voice report...');
      } catch (err: any) {
        setErrorMsg(
          `Could not start the microphone: ${err?.message || 'the browser blocked voice input'}. You can keep typing the report.`
        );
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setFileError('File exceeds 10MB maximum limit.');
      return;
    }

    setSelectedFile(file);
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setFilePreviewUrl(url);
    } else {
      setFilePreviewUrl(null);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFilePreviewUrl(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSampleClick = (sample: typeof SAMPLE_REPORTS[0]) => {
    setReportText(sample.text);
    setLocationOverride(sample.location);
    setAnalysisResult(null);
    setErrorMsg(null);
    setSaveSuccess(false);
    announce(`Loaded sample: ${sample.label}`);
  };

  const handleAnalyze = async () => {
    if (!reportText.trim() && !selectedFile) {
      setErrorMsg('Please enter emergency text or attach an image.');
      return;
    }

    try {
      setIsAnalyzing(true);
      setErrorMsg(null);
      setSaveSuccess(false);
      announce('Analyzing incident with ResQ AI...');

      const result = await analyzeIncident(reportText, selectedFile || undefined, locationOverride, isSimulatedMode);
      setAnalysisResult(result);
      announce(`Analysis complete: classified as ${result.extraction.incident_type} with ${result.suggested_priority.level} priority.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Analysis failed. Please check backend status.');
      announce('Analysis failed.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveToQueue = async () => {
    if (!analysisResult) return;

    try {
      setIsSaving(true);
      setErrorMsg(null);
      announce('Saving incident to operational queue...');

      await createIncident({
        extraction: analysisResult.extraction,
        is_simulated: isSimulatedMode,
        reported_location_override: locationOverride || analysisResult.extraction.reported_location || undefined,
        idempotency_key: `client-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
      });

      setSaveSuccess(true);
      announce('Incident successfully saved to queue.');
      onIncidentCreated();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save incident.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {!online && <OfflineState message="You are offline. A report you write now is kept on this device and marked as not delivered, and on-demand AI extraction is unavailable until the connection returns." />}
      {/* View Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <span>Report &amp; Extract Incident</span>
          {isSimulatedMode && (
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-300 font-semibold shadow-2xs">
              Simulated Mode Active
            </span>
          )}
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Turn unstructured emergency dispatch logs, witness text, transcripts, or scene photographs into verified structured intelligence.
        </p>
      </div>

      {/* Example Presets */}
      <div className="p-4 sm:p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-2.5">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
          One-Click Demo Scenarios
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {SAMPLE_REPORTS.map((sample, i) => (
            <button
              key={i}
              onClick={() => handleSampleClick(sample)}
              className="px-3.5 py-2.5 text-left rounded-lg bg-slate-50 hover:bg-blue-50/70 border border-slate-200 text-xs font-medium text-slate-800 transition hover:border-blue-300 shadow-2xs"
            >
              <div className="font-semibold text-slate-900">{sample.label}</div>
              <div className="text-[11px] text-slate-500 truncate mt-0.5">{sample.location}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Input Form */}
      <div className="p-5 sm:p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
        {/* Text Area with Voice input option */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <label htmlFor="report-text" className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Emergency Report Content <span className="text-red-600">*</span>
            </label>
            <button
              type="button"
              onClick={handleToggleVoice}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition border ${
                isRecording
                  ? 'bg-red-50 text-red-900 border-red-300 animate-pulse'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 shadow-2xs'
              }`}
              title="Voice transcription (Speech-to-Text)"
            >
              {isRecording ? <MicOff className="w-3.5 h-3.5 text-red-600" /> : <Mic className="w-3.5 h-3.5 text-blue-600" />}
              <span>{isRecording ? 'Listening...' : 'Voice Dictation'}</span>
            </button>
          </div>

          <textarea
            id="report-text"
            rows={4}
            value={reportText}
            onChange={(e) => setReportText(e.target.value)}
            placeholder="Type or paste emergency dispatches, field notes, or 911 caller transcripts..."
            className="w-full rounded-xl bg-white border border-slate-300 p-3 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 shadow-2xs transition"
          />
        </div>

        {/* Location Override Input */}
        <div className="space-y-1.5">
          <label htmlFor="report-location" className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Reported Location <span className="text-slate-500 font-normal">(Optional, leave empty if unknown)</span>
          </label>
          <input
            id="report-location"
            type="text"
            value={locationOverride}
            onChange={(e) => setLocationOverride(e.target.value)}
            placeholder="e.g. 440 Riverfront Blvd, Maplewood Valley"
            className="w-full rounded-xl bg-white border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 shadow-2xs transition"
          />
        </div>

        {/* File Dropzone / Attachment */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
            Scene Photograph / Document Attachment
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer shadow-2xs transition"
            >
              <Upload className="w-4 h-4 text-blue-600" />
              <span>Choose Photo or PDF (Max 10MB)</span>
            </label>

            {selectedFile && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                <span className="font-medium text-slate-800">{selectedFile.name}</span>
                <span className="text-[11px] text-slate-500">({(selectedFile.size / 1024).toFixed(0)} KB)</span>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="text-slate-400 hover:text-red-600 p-0.5"
                  aria-label="Remove attached file"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {fileError && <p className="text-xs text-red-600 mt-1">{fileError}</p>}

          {filePreviewUrl && (
            <div className="mt-2 w-36 h-28 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 shadow-2xs">
              <img src={filePreviewUrl} alt="Incident preview" className="w-full h-full object-cover" />
            </div>
          )}
        </div>

        {/* Error Feedback */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Action Button */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-50 shadow-xs"
          >
            <Sparkles className="w-4 h-4" />
            <span>{isAnalyzing ? 'Extracting Intelligence...' : 'Analyze on Demand'}</span>
          </button>
        </div>
      </div>

      {/* Structured Extraction Live Preview */}
      {analysisResult && (
        <div className="p-6 rounded-xl bg-white border-2 border-blue-200 space-y-4 shadow-md">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                Extraction Preview
              </span>
              <PriorityBadge priority={analysisResult.suggested_priority.level} />
              {analysisResult.is_simulated && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-300">
                  Simulated Analysis
                </span>
              )}
            </div>

            <div className="text-xs text-slate-500 flex items-center gap-3">
              <span>Claims: {analysisResult.extraction.evidence_items.length}</span>
              {analysisResult.extraction.conflicting_information.length > 0 && (
                <span className="text-amber-800 font-semibold">
                  ⚠️ {analysisResult.extraction.conflicting_information.length} Conflict(s)
                </span>
              )}
            </div>
          </div>

          {/* Classification & Summary */}
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase">Classification</div>
            <div className="text-base font-bold text-slate-900 mt-0.5">
              {analysisResult.extraction.incident_type}
            </div>
            <p className="text-xs text-slate-700 mt-1.5 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              {analysisResult.extraction.summary}
            </p>
          </div>

          {/* Deterministic Priority Reasoning */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
            <div className="font-bold text-slate-800">Deterministic Engine Reasons:</div>
            <ul className="list-disc list-inside space-y-1 text-slate-700">
              {analysisResult.suggested_priority.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>

          {/* Evidence items with Provenance */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-500 uppercase">
              Extracted Evidence Claims ({analysisResult.extraction.evidence_items.length})
            </div>
            <div className="space-y-2">
              {analysisResult.extraction.evidence_items.map((ev: any, idx: number) => (
                <div key={idx} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-900">{ev.claim}</span>
                  <ProvenanceBadge provenance={ev.provenance} />
                </div>
              ))}
            </div>
          </div>

          {/* Missing / Conflicting info */}
          {analysisResult.extraction.missing_information.length > 0 && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-1">
              <span className="font-bold text-amber-900">Information Gaps Identified:</span>
              <ul className="list-disc list-inside">
                {analysisResult.extraction.missing_information.map((m: string, i: number) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Save Action */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between flex-wrap gap-3">
            {saveSuccess ? (
              <div className="flex items-center gap-2 text-emerald-700 text-xs font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Incident saved to Queue successfully!</span>
              </div>
            ) : (
              <span className="text-xs text-slate-500">
                Confirm intelligence extraction to add to active response queue.
              </span>
            )}

            <button
              onClick={handleSaveToQueue}
              disabled={isSaving || saveSuccess}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-50 shadow-xs"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Saving...' : saveSuccess ? 'Saved' : 'Save Incident to Queue'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
