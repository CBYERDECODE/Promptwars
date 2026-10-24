import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import axe from 'axe-core';
import {
  ALLOCATION_PARAMETERS,
  ALL_STRATEGIES,
  CRISIS_REPLAY_BANNER,
  MILL_BRIDGE_EDGE_KEY,
  RADAR_FRAMING,
  RADAR_PARAMETERS,
  RADAR_WEIGHTS,
  STRATEGY_LABELS,
  assessZones,
  computePlan,
  computeReplay,
  getSimulatedDataset,
  type AllocationStrategy,
  type PlanScenario
} from '@resq-ai/shared';

/**
 * Every network call is replaced so the views are tested against the REAL
 * deterministic engines (imported from `@resq-ai/shared`) rather than
 * hand-written fixtures. If a view drifted from the engine contract, these
 * tests would fail on the contract itself.
 */
vi.mock('../api/client', async importOriginal => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    fetchRescueDataset: vi.fn(),
    postRadar: vi.fn(),
    postPlans: vi.fn(),
    postPlan: vi.fn(),
    postReplay: vi.fn(),
    postExplain: vi.fn(),
    postDecision: vi.fn()
  };
});

import * as api from '../api/client';
import { ToastProvider } from '../ui';
import { InvisibleVictimsRadar } from '../views/rescue/InvisibleVictimsRadar';
import { FairRescue } from '../views/rescue/FairRescue';
import { RescueBrain } from '../views/rescue/RescueBrain';
import { CrisisReplay } from '../views/rescue/CrisisReplay';
import { DemoTour } from '../views/rescue/DemoTour';
import { DecisionPanel } from '../views/rescue/DecisionPanel';
import { ZoneTable } from '../views/rescue/ZoneTable';

const dataset = getSimulatedDataset();

/** Fixed clock so every snapshot in this file is reproducible. */
const FIXED_NOW = '2026-09-12T08:00:00.000Z';

const SIMULATED_NOTICE =
  'SIMULATED EXERCISE. The city, road times, populations, units and incidents are fictional.';

function buildDatasetResponse(): api.RescueDatasetResponse {
  return {
    is_simulated: true,
    label: dataset.label,
    city: dataset.city,
    notice: SIMULATED_NOTICE,
    dataset,
    framing: RADAR_FRAMING,
    replay_banner: CRISIS_REPLAY_BANNER,
    methods: {
      strategies: ALL_STRATEGIES.map(id => ({ id, label: STRATEGY_LABELS[id] })),
      radar_weights: { ...RADAR_WEIGHTS },
      radar_parameters: { ...RADAR_PARAMETERS },
      allocation_parameters: { ...ALLOCATION_PARAMETERS }
    }
  };
}

/** Wraps a view in the toast context that `DecisionPanel` requires. */
function renderApp(node: React.ReactElement) {
  return render(<ToastProvider>{node}</ToastProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(api.fetchRescueDataset).mockResolvedValue(buildDatasetResponse());

  vi.mocked(api.postRadar).mockImplementation(async body => ({
    is_simulated: true,
    result: assessZones(dataset, {
      window_hours: body?.window_hours ?? 3,
      blocked_edge_keys: body?.blocked_edge_keys ?? [],
      now: FIXED_NOW
    }),
    weights: { ...RADAR_WEIGHTS },
    parameters: { ...RADAR_PARAMETERS }
  }));

  vi.mocked(api.postPlans).mockImplementation(async body => ({
    is_simulated: true,
    generated_at: FIXED_NOW,
    dataset_label: dataset.label,
    notice: SIMULATED_NOTICE,
    plans: ALL_STRATEGIES.map(strategy => computePlan(dataset, strategy, body?.scenario ?? {})),
    parameters: { ...ALLOCATION_PARAMETERS }
  }));

  vi.mocked(api.postPlan).mockImplementation(async body => ({
    is_simulated: true,
    result: computePlan(dataset, body.strategy, body.scenario ?? {}),
    parameters: { ...ALLOCATION_PARAMETERS }
  }));

  vi.mocked(api.postReplay).mockImplementation(async body => ({
    is_simulated: true,
    result: computeReplay(dataset, body.strategy, body.override, { scenario: body.scenario })
  }));

  vi.mocked(api.postExplain).mockResolvedValue({
    is_simulated: true,
    kind: 'PLAN',
    result: null as never,
    narrative: {
      is_simulated: true,
      kind: 'PLAN',
      source: 'TEMPLATE',
      explanation: 'Every listed incident above was ranked by the deterministic engine.',
      verification_suggestions: ['Confirm the road status before dispatch.']
    }
  });
});

/** Fails a test on any axe violation of serious or critical impact. */
async function expectNoSeriousA11yViolations(container: HTMLElement) {
  const results = await axe.run(container);
  const blocking = results.violations.filter(
    violation => violation.impact === 'critical' || violation.impact === 'serious'
  );
  const summary = blocking
    .map(violation => `${violation.id} (${violation.impact}): ${violation.help} → ${violation.nodes[0]?.target?.join(' ')}`)
    .join('\n');
  expect(summary).toBe('');
}

describe('Invisible Victims Radar', () => {
  it('labels the exercise as simulated and frames the score as a reason to verify', async () => {
    renderApp(<InvisibleVictimsRadar />);

    await screen.findByRole('heading', { name: /Invisible Victims Radar/i });

    expect((await screen.findAllByText(/simulated exercise/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(dataset.city, { exact: false }).length).toBeGreaterThan(0);
    // The non-negotiable framing statement ships with the result.
    expect(await screen.findByText(RADAR_FRAMING)).toBeInTheDocument();

    // Silence is modelled as a data gap: the radar must say so explicitly.
    expect(screen.getByText(/Silence is treated as a data gap, never as safety/i)).toBeInTheDocument();
  });

  it('recomputes with a blocked road and never claims victims are present', async () => {
    renderApp(<InvisibleVictimsRadar />);
    await screen.findByText(RADAR_FRAMING);

    fireEvent.click(screen.getByRole('button', { name: /Simulate Mill Bridge closure/i }));

    await waitFor(() =>
      expect(vi.mocked(api.postRadar)).toHaveBeenLastCalledWith({
        window_hours: 3,
        blocked_edge_keys: [MILL_BRIDGE_EDGE_KEY]
      })
    );

    // Wording guarantee: verification, never a claim of people trapped.
    expect(screen.getAllByText(/Warrants verification/i).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/never a statement that people are trapped/i)
    ).toBeInTheDocument();
  });

  it('renders the accessible sortable table with aria-sort driven by keyboard-activatable headers', async () => {
    const zones = assessZones(dataset, { window_hours: 3, now: FIXED_NOW }).zones;
    render(<ZoneTable zones={zones} dataset={dataset} />);

    const table = screen.getByRole('table');
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.length).toBeGreaterThan(0);

    // The priority column is sortable and exposes its direction to assistive tech.
    const sortButton = within(table).getByRole('button', { name: /Verification priority/i });
    const columnHeader = sortButton.closest('th');
    expect(columnHeader).not.toBeNull();

    fireEvent.click(sortButton);
    expect(
      ['ascending', 'descending'].includes(columnHeader!.getAttribute('aria-sort') ?? '')
    ).toBe(true);

    const firstDirection = columnHeader!.getAttribute('aria-sort');
    fireEvent.click(sortButton);
    expect(columnHeader!.getAttribute('aria-sort')).not.toBe(firstDirection);
  });

  it('passes automated accessibility checks', async () => {
    const { container } = renderApp(<InvisibleVictimsRadar />);
    await screen.findByText(RADAR_FRAMING);
    await expectNoSeriousA11yViolations(container);
  });
});

describe('FairRescue', () => {
  it('compares all three deterministic strategies and names who is disadvantaged', async () => {
    renderApp(<FairRescue />);

    await screen.findByRole('heading', { name: /FairRescue/i });

    // Every strategy is offered and the comparison is side-by-side.
    const radiogroup = await screen.findByRole('radiogroup', { name: /Strategy under review/i });
    for (const label of Object.values(STRATEGY_LABELS)) {
      expect(within(radiogroup).getByRole('radio', { name: label })).toBeInTheDocument();
    }

    expect(screen.getAllByText(/Who is disadvantaged/i).length).toBeGreaterThan(0);
    // Parameters come from the shared engine, not hard-coded UI copy.
    expect(await screen.findByText(/How these plans are produced/i)).toBeInTheDocument();
  });

  it('switches the plan under review when another strategy is chosen', async () => {
    renderApp(<FairRescue />);
    const radiogroup = await screen.findByRole('radiogroup', { name: /Strategy under review/i });

    const severityFirst = within(radiogroup).getByRole('radio', { name: STRATEGY_LABELS.SEVERITY_FIRST });
    expect(severityFirst).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(severityFirst);
    expect(severityFirst).toHaveAttribute('aria-checked', 'true');
  });

  it('passes automated accessibility checks', async () => {
    const { container } = renderApp(<FairRescue />);
    await screen.findAllByText(/Who is disadvantaged/i);
    await expectNoSeriousA11yViolations(container);
  });
});

describe('RescueBrain', () => {
  it('recomputes the same engine when an event toggle changes and diffs the result', async () => {
    renderApp(<RescueBrain />);

    await screen.findByRole('heading', { name: /RescueBrain/i });
    await waitFor(() => expect(vi.mocked(api.postPlan)).toHaveBeenCalledTimes(1));

    // Baseline: no scenario toggles are in force.
    expect(vi.mocked(api.postPlan)).toHaveBeenLastCalledWith({
      strategy: 'COVERAGE_BALANCED',
      scenario: expect.objectContaining({ blocked_edge_keys: [] })
    });

    fireEvent.click(screen.getByRole('checkbox', { name: /Close Mill Bridge/i }));

    await waitFor(() =>
      expect(vi.mocked(api.postPlan)).toHaveBeenLastCalledWith({
        strategy: 'COVERAGE_BALANCED',
        scenario: expect.objectContaining({ blocked_edge_keys: [MILL_BRIDGE_EDGE_KEY] })
      })
    );

    // The previous plan is kept so the cost of the event is visible, not just its result.
    expect(screen.getByText(/Previous plan versus the plan after the events above were applied/i)).toBeInTheDocument();
    expect(screen.getByText(/Average response/i)).toBeInTheDocument();
  });

  it('passes automated accessibility checks', async () => {
    const { container } = renderApp(<RescueBrain />);
    await screen.findByText(/Event toggles/i);
    await expectNoSeriousA11yViolations(container);
  });
});

describe('CrisisReplay', () => {
  it('always shows the permanent hypothetical banner, even before any result loads', async () => {
    renderApp(<CrisisReplay />);

    expect(await screen.findByText(CRISIS_REPLAY_BANNER)).toBeInTheDocument();
  });

  it('compares a forced pairing against the baseline and lists its assumptions', async () => {
    renderApp(<CrisisReplay />);
    await screen.findByText(CRISIS_REPLAY_BANNER);

    await waitFor(() => expect(vi.mocked(api.postReplay)).toHaveBeenCalled());

    const firstCall = vi.mocked(api.postReplay).mock.calls[0][0];
    expect(firstCall.override.unit_id).toBeTruthy();
    expect(firstCall.override.incident_id).toBeTruthy();

    expect(await screen.findByText(/What was tested/i)).toBeInTheDocument();
    expect(screen.getByText(/Assumptions/i)).toBeInTheDocument();
    // The banner is rendered outside the shell's state machine, so it cannot be
    // hidden by a loading or error state.
    expect(screen.getByText(CRISIS_REPLAY_BANNER).closest('[role="note"]')).not.toBeNull();
  });

  it('passes automated accessibility checks', async () => {
    const { container } = renderApp(<CrisisReplay />);
    await screen.findByText(/What was tested/i);
    await expectNoSeriousA11yViolations(container);
  });
});

describe('Guided demo', () => {
  it('drives every deterministic endpoint and stops on a human approval step', async () => {
    renderApp(<DemoTour onExit={vi.fn()} />);

    await screen.findByRole('heading', { name: /Guided demo/i });

    await waitFor(() => {
      expect(vi.mocked(api.postRadar)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(api.postPlans)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(api.postPlan)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(api.postReplay)).toHaveBeenCalledTimes(1);
    });

    // The tour never writes a decision on its own — that is a human step.
    expect(vi.mocked(api.postDecision)).not.toHaveBeenCalled();
  });

  it('is keyboard-operable: arrow keys move between steps and Space pauses', async () => {
    const { container } = renderApp(<DemoTour onExit={vi.fn()} />);
    await screen.findByRole('heading', { name: /Guided demo/i });

    const currentStep = () => {
      const stepper = screen.getByRole('list', { name: /Guided demo steps/i });
      return stepper.querySelector('[aria-current="step"]')?.textContent ?? '';
    };

    expect(currentStep()).toMatch(/Reports arrive/i);

    fireEvent.keyDown(container.firstElementChild as Element, { key: 'ArrowRight' });
    expect(currentStep()).toMatch(/Radar flags zones/i);

    fireEvent.keyDown(container.firstElementChild as Element, { key: 'ArrowLeft' });
    expect(currentStep()).toMatch(/Reports arrive/i);

    // Space is the documented pause control.
    const pauseToggle = screen.getByRole('button', { name: /Pause/i });
    const wasPressed = pauseToggle.getAttribute('aria-pressed');
    fireEvent.keyDown(container.firstElementChild as Element, { key: ' ' });
    expect(
      screen.getByRole('button', { name: /Pause|Play/i }).getAttribute('aria-pressed')
    ).not.toBe(wasPressed);
  });

  it('passes automated accessibility checks', async () => {
    const { container } = renderApp(<DemoTour onExit={vi.fn()} />);
    await screen.findByRole('list', { name: /Guided demo steps/i });
    await expectNoSeriousA11yViolations(container);
  });
});

describe('Coordinator decision panel', () => {
  function recordDecision(record: Partial<api.RescueDecisionRecord> = {}) {
    vi.mocked(api.postDecision).mockImplementation(async (body, idempotencyKey) => ({
      is_simulated: true,
      decision: body.decision,
      strategy: body.strategy,
      coordinator_note: body.coordinator_note,
      plan_signature: body.plan_signature,
      active_constraints: body.active_constraints ?? [],
      recorded_at: FIXED_NOW,
      log_entry_id: `log-${idempotencyKey.slice(-6)}`,
      notice: 'Recorded in the audit trail.',
      ...record
    }));
  }

  async function submitDecision(note: string) {
    fireEvent.click(screen.getByRole('radio', { name: 'Approve' }));
    fireEvent.change(screen.getByLabelText(/Coordinator note/i), { target: { value: note } });
    fireEvent.click(screen.getByRole('button', { name: /Review and record decision/i }));
    const confirm = await screen.findByRole('button', { name: /^Record decision$/i });
    // The submit resolves asynchronously and updates both the panel and the
    // toast queue, so flush it inside `act` to keep the test output clean.
    await act(async () => {
      fireEvent.click(confirm);
    });
  }

  it('requires a written note before a decision can be sent', async () => {
    recordDecision();
    renderApp(
      <DecisionPanel
        strategy="COVERAGE_BALANCED"
        strategyLabel={STRATEGY_LABELS.COVERAGE_BALANCED}
        planSignature="amb-1|inc-northgate"
        activeConstraints={[]}
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Approve' }));
    expect(screen.getByRole('button', { name: /Review and record decision/i })).toBeDisabled();
    expect(vi.mocked(api.postDecision)).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Coordinator note/i), { target: { value: 'Bridge closure verified.' } });
    expect(screen.getByRole('button', { name: /Review and record decision/i })).toBeEnabled();
  });

  it('sends an identical Idempotency-Key for a repeated submission so no second audit entry is written', async () => {
    recordDecision();
    const signature = 'amb-1|inc-northgate';
    renderApp(
      <DecisionPanel
        strategy="COVERAGE_BALANCED"
        strategyLabel={STRATEGY_LABELS.COVERAGE_BALANCED}
        planSignature={signature}
        activeConstraints={['Mill Bridge closed']}
      />
    );

    await submitDecision('Road closure confirmed by the field team.');
    await screen.findByText(/written to the audit trail/i);

    // A coordinator retrying the same intent must not fork the audit trail.
    await submitDecision('Road closure confirmed by the field team.');

    await waitFor(() => expect(vi.mocked(api.postDecision)).toHaveBeenCalledTimes(2));

    const calls = vi.mocked(api.postDecision).mock.calls;
    expect(calls[0][1]).toBe(calls[1][1]);
    expect(calls[0][0]).toMatchObject({ plan_signature: signature, decision: 'APPROVED' });

    expect(screen.getAllByText(/written to the audit trail/i).length).toBeGreaterThan(0);
  });

  it('surfaces an authorization failure without claiming the decision was recorded', async () => {
    vi.mocked(api.postDecision).mockRejectedValue(
      new api.ApiError(401, 'UNAUTHORIZED', 'Coordinator authorization is required.')
    );

    renderApp(
      <DecisionPanel
        strategy="FASTEST"
        strategyLabel={STRATEGY_LABELS.FASTEST}
        planSignature="amb-2|inc-marketrow-square"
        activeConstraints={[]}
      />
    );

    await submitDecision('Fastest plan accepted for the inner city.');

    // The failure is surfaced (in the panel and/or as a toast) …
    await waitFor(() =>
      expect(screen.getAllByText(/authorization is required/i).length).toBeGreaterThan(0)
    );
    // … and the panel never claims a decision was recorded.
    expect(screen.queryByText(/written to the audit trail/i)).not.toBeInTheDocument();
  });
});

/** Guards the shared engine contract the views depend on. */
describe('shared engine contract used by the views', () => {
  it('is deterministic: identical inputs produce identical plans', () => {
    const scenario: PlanScenario = { blocked_edge_keys: [MILL_BRIDGE_EDGE_KEY] };
    const strategy: AllocationStrategy = 'COVERAGE_BALANCED';
    expect(computePlan(dataset, strategy, scenario)).toEqual(computePlan(dataset, strategy, scenario));
  });
});
