import React from 'react';
import { CircleAlert, Send, Sparkles, Terminal } from 'lucide-react';
import type { TwinCopilotAnswer } from '@resq-ai/shared';
import { Badge, Button, Card, cx } from '../../ui';

/**
 * Feature 6 — AI disaster copilot.
 *
 * There is deliberately no language model here. `answerTwinCopilot` reads the
 * flood assessment, the Dijkstra router, the allocation engine and the drone
 * planner, and if the simulation state cannot answer a question it says so
 * rather than inventing a figure. Every answer cites the engines it used.
 *
 * ⚠️ SIMULATED: answers describe the synthetic exercise only.
 */

interface Props {
  answer: TwinCopilotAnswer | null;
  onAsk: (question: string) => void;
  /** True while the demo is driving the panel. */
  locked?: boolean;
  /** Label of the currently selected building, offered as a ready-made question. */
  selectedBuildingLabel?: string | null;
}

const DEFAULT_SUGGESTIONS = [
  'Which buildings are most exposed?',
  'Which ambulance can reach Incident A fastest?',
  'What happens if the bridge closes?',
  'Which areas have limited rescue coverage?'
];

export const TwinCopilotPanel: React.FC<Props> = ({ answer, onAsk, locked = false, selectedBuildingLabel }) => {
  const inputId = React.useId();
  const [question, setQuestion] = React.useState('');

  const suggestions = answer?.suggestions ?? DEFAULT_SUGGESTIONS;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = question.trim();
    if (trimmed.length === 0) return;
    onAsk(trimmed);
    setQuestion('');
  };

  const ask = (text: string) => {
    onAsk(text);
    setQuestion('');
  };

  return (
    <Card
      title="AI disaster copilot"
      description="Ask about the current simulation state. Answers are computed by the deterministic engines — no number is invented."
      icon={Sparkles}
      tone="accent"
      bodyClassName="space-y-3.5"
    >
      <form onSubmit={submit} className="space-y-2">
        <label htmlFor={inputId} className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
          Your question
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id={inputId}
            type="text"
            value={question}
            disabled={locked}
            onChange={event => setQuestion(event.target.value)}
            placeholder="e.g. Which buildings are most exposed?"
            className="min-h-tap min-w-[12rem] flex-1 rounded-control border border-line-strong bg-white px-3 py-2 text-xs text-ink placeholder:text-ink-faint disabled:opacity-60"
          />
          <Button type="submit" variant="primary" icon={Send} disabled={locked || question.trim().length === 0}>
            Ask
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {selectedBuildingLabel && (
          <button
            type="button"
            disabled={locked}
            onClick={() => ask(`What is the situation at ${selectedBuildingLabel}?`)}
            className="min-h-tap rounded-full border border-line-strong bg-white px-3 py-1.5 text-[11px] font-semibold text-ink-muted transition duration-fast hover:bg-surface-sunken disabled:opacity-60"
          >
            Situation at {selectedBuildingLabel}
          </button>
        )}
        {suggestions.map(suggestion => (
          <button
            key={suggestion}
            type="button"
            disabled={locked}
            onClick={() => ask(suggestion)}
            className="min-h-tap rounded-full border border-line-strong bg-white px-3 py-1.5 text-left text-[11px] font-semibold text-ink-muted transition duration-fast hover:bg-surface-sunken disabled:opacity-60"
          >
            {suggestion}
          </button>
        ))}
      </div>

      {answer ? (
        <div className="space-y-2.5 rounded-card border border-accent-border bg-accent-soft px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent" icon={Sparkles} srPrefix="Answer intent">
              {answer.intent.replace(/_/g, ' ').toLowerCase()}
            </Badge>
            <span className="text-[11px] text-ink-subtle">You asked: “{answer.question}”</span>
          </div>

          <p data-testid="twin-copilot-answer" className="text-xs text-ink leading-5">
            {answer.answer}
          </p>

          {answer.facts.length > 0 && (
            <dl className="space-y-1 border-t border-accent-border pt-2">
              {answer.facts.map(fact => (
                <div key={`${fact.label}-${fact.value}`} className="flex items-baseline justify-between gap-3">
                  <dt className="min-w-0 text-[11px] text-ink-muted">{fact.label}</dt>
                  <dd data-metric className={cx('shrink-0 text-[11px] font-semibold tabular-nums text-ink')}>
                    {fact.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          <p className="flex flex-wrap items-center gap-1.5 text-[10px] text-ink-subtle">
            <Terminal className="h-3 w-3 shrink-0" aria-hidden="true" />
            Computed by
            {answer.citations.map(citation => (
              <code key={citation} className="rounded bg-surface px-1 py-0.5 font-mono text-[10px] text-ink-muted">
                {citation}
              </code>
            ))}
          </p>
        </div>
      ) : (
        <p className="flex items-start gap-2 rounded-card border border-dashed border-line-strong bg-surface-muted px-3 py-2.5 text-[11px] text-ink-subtle leading-4">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
          <span>
            Ask a question, or pick one above. The copilot answers only from the current flood level, closures, routes
            and flight plan — it will say “not available” rather than guess.
          </span>
        </p>
      )}
    </Card>
  );
};
