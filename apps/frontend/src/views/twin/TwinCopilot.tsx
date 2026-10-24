import { useEffect, useRef, useState } from 'react';
import { Bot, Send } from 'lucide-react';
import { Button } from '../../ui';
import { CopilotAnswer, SUGGESTED_QUESTIONS } from './sim/copilot';

export interface CopilotMessage {
  id: number;
  question: string;
  answer: CopilotAnswer;
}

export function TwinCopilot({ messages, onAsk }: { messages: CopilotMessage[]; onAsk: (q: string) => void }) {
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [messages]);
  const submit = (q: string) => {
    if (!q.trim()) return;
    onAsk(q.trim());
    setDraft('');
  };
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <p className="text-[11px] text-ink-subtle">
        Rule-based copilot: every figure is computed from the live simulation state (flood grid, road graph, A*/Dijkstra). It does not call an external model and cannot dispatch anything.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTED_QUESTIONS.map(q => (
          <button key={q} type="button" onClick={() => submit(q)} className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-left text-[11px] font-medium text-blue-800 hover:bg-blue-100">
            {q}
          </button>
        ))}
      </div>
      <div className="min-h-[200px] flex-1 space-y-3 overflow-auto pr-1" aria-live="polite" data-testid="copilot-log">
        {messages.length === 0 ? <p className="text-xs text-ink-muted">Ask a question about the current simulation.</p> : null}
        {messages.map(m => (
          <div key={m.id} className="space-y-1.5">
            <p className="ml-6 rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white">{m.question}</p>
            <div className="mr-2 rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-sm">
              <p className="flex items-center gap-1.5 font-semibold text-ink">
                <Bot className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" /> {m.answer.title}
              </p>
              <ul className="mt-1 space-y-0.5 text-ink-muted">
                {m.answer.lines.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
              <p className="mt-1.5 border-t border-line pt-1 text-[10px] text-ink-subtle">Basis: {m.answer.basis}</p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form
        className="flex gap-2"
        onSubmit={e => {
          e.preventDefault();
          submit(draft);
        }}
      >
        <label htmlFor="twin-copilot-input" className="sr-only">Ask the disaster copilot</label>
        <input id="twin-copilot-input" value={draft} onChange={e => setDraft(e.target.value)} placeholder="e.g. Which ambulance can reach Incident B fastest?" className="min-w-0 flex-1 rounded-md border border-line-strong px-2.5 py-1.5 text-xs" />
        <Button size="sm" variant="primary" icon={Send} type="submit" aria-label="Ask">Ask</Button>
      </form>
    </div>
  );
}
