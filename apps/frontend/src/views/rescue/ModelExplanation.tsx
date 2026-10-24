import React from 'react';
import { CircleAlert, Sparkles, TriangleAlert } from 'lucide-react';
import { ApiError, ExplainResponse, NarrativeResult, postExplain } from '../../api/client';
import { RescueExplainRequest } from '@resq-ai/shared';
import { Badge, Button, Card, LoadingBlock, cx } from '../../ui';

interface Props {
  /**
   * The SAME deterministic inputs the view sent to the plain endpoint. The
   * server recomputes the engine result from these and hands it to the model as
   * fixed facts, so the model can only describe a decision it did not make.
   */
  request: RescueExplainRequest;
  title?: string;
  description?: string;
  className?: string;
}

/**
 * On-demand plain-language explanation of a deterministic result.
 *
 * The model never allocates: it receives the already-computed numbers as fact
 * strings and may only rephrase them. The badge states where the text came from
 * (`GEMINI` or the deterministic `TEMPLATE` fallback) so a coordinator always
 * knows whether they are reading generated prose or shipped wording.
 */
export const ModelExplanation: React.FC<Props> = ({
  request,
  title = 'Plain-language explanation',
  description = 'Descriptive only. The allocation itself was decided by the deterministic engine, not by the model.',
  className
}) => {
  const [narrative, setNarrative] = React.useState<NarrativeResult | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // A different request means the previous explanation no longer applies.
  const requestKey = React.useMemo(() => JSON.stringify(request), [request]);
  React.useEffect(() => {
    setNarrative(null);
    setError(null);
  }, [requestKey]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response: ExplainResponse = await postExplain(request);
      setNarrative(response.narrative);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === 'NARRATIVE_RATE_LIMIT_EXCEEDED'
            ? 'Explanation requests are being rate limited. The deterministic results above are unaffected and remain complete.'
            : err.message
          : 'The explanation could not be generated. The deterministic results above are unaffected.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      title={title}
      description={description}
      icon={Sparkles}
      tone="accent"
      className={className}
      actions={
        <Button variant="secondary" size="sm" icon={Sparkles} loading={loading} onClick={() => void load()}>
          {narrative ? 'Regenerate' : 'Explain'}
        </Button>
      }
      bodyClassName="space-y-2.5"
    >
      {loading && <LoadingBlock label="Asking the model to explain the deterministic result" lines={3} />}

      {!loading && error && (
        <p role="alert" className="flex items-start gap-2 rounded-card border border-critical-border bg-critical-soft px-3 py-2.5 text-[11px] text-ink">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-critical" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      {!loading && !error && !narrative && (
        <p className="text-xs text-ink-subtle leading-5">
          No explanation requested yet. The numbers above are complete without it — an explanation only restates them in
          plain language.
        </p>
      )}

      {!loading && narrative && (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              tone={narrative.source === 'GEMINI' ? 'accent' : 'neutral'}
              icon={narrative.source === 'GEMINI' ? Sparkles : CircleAlert}
              srPrefix="Explanation source"
            >
              {narrative.source === 'GEMINI' ? 'AI-written explanation' : 'Deterministic template'}
            </Badge>
            <span className="text-[11px] text-ink-subtle">
              {narrative.source === 'GEMINI'
                ? 'Written by the configured model from the fixed facts above.'
                : 'The model was unavailable or its answer failed validation, so shipped wording is shown instead.'}
            </span>
          </div>

          <p
            className={cx('rounded-card border border-line bg-surface-muted px-3 py-2.5 text-xs text-ink-muted leading-5')}
          >
            {narrative.explanation}
          </p>

          {narrative.verification_suggestions.length > 0 && (
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">Suggested verification</h3>
              <ul className="mt-1 space-y-1">
                {narrative.verification_suggestions.map(suggestion => (
                  <li key={suggestion} className="flex items-start gap-1.5 text-[11px] text-ink-muted leading-4">
                    <CircleAlert className="mt-0.5 h-3 w-3 shrink-0 text-uncertain" aria-hidden="true" />
                    <span>{suggestion}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-uncertain leading-4">
                These are verification prompts, not confirmed facts. Never act on them without checking first.
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

/** Exposed for tests and for views that render an explanation block inline. */
export type { Props as ModelExplanationProps };
