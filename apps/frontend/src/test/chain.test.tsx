import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import {
  CHAIN_FRAMING,
  CHAIN_NOTICE,
  COMMODITIES,
  MILL_BRIDGE_EDGE_KEY,
  SUPPLY_PARAMETERS,
  computeSupplyPlan,
  getSimulatedDataset,
  type SupplyScenario
} from '@resq-ai/shared';

/**
 * The Chain surface is tested against the REAL deterministic engine, exactly as
 * the rescue views are: the mocked network call runs `computeSupplyPlan` itself,
 * so a view that drifted from the engine's contract would fail here rather than
 * silently agreeing with a hand-written fixture.
 */
vi.mock('../api/client', async importOriginal => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, postChainPlan: vi.fn(), postChainDecision: vi.fn() };
});

import * as api from '../api/client';
import { ToastProvider } from '../ui';
import { ReliefChain } from '../views/rescue/ReliefChain';

const dataset = getSimulatedDataset();

function buildPlanResponse(scenario: SupplyScenario = {}): api.ChainPlanResponse {
  return {
    is_simulated: true,
    label: 'SIMULATED — relief supply chain exercise',
    notice: CHAIN_NOTICE,
    framing: CHAIN_FRAMING,
    result: computeSupplyPlan(dataset, scenario),
    commodities: COMMODITIES,
    parameters: { ...SUPPLY_PARAMETERS }
  };
}

function renderChain() {
  return render(
    <ToastProvider>
      <ReliefChain />
    </ToastProvider>
  );
}

/* ------------------------------------------------------------------ */
/* Connectivity control                                               */
/* ------------------------------------------------------------------ */

let onlineState = true;

beforeAll(() => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => onlineState });
});

function setOnline(next: boolean) {
  onlineState = next;
  window.dispatchEvent(new Event(next ? 'online' : 'offline'));
}

async function expectNoSeriousA11yViolations(container: HTMLElement) {
  const results = await axe.run(container);
  const blocking = results.violations.filter(
    violation => violation.impact === 'critical' || violation.impact === 'serious'
  );
  const summary = blocking
    .map(violation => `${violation.id} (${violation.impact}): ${violation.help}`)
    .join('\n');
  expect(summary).toBe('');
}

beforeEach(() => {
  vi.clearAllMocks();
  onlineState = true;
  vi.mocked(api.postChainPlan).mockImplementation(async body => buildPlanResponse(body?.scenario ?? {}));
  vi.mocked(api.postChainDecision).mockResolvedValue({
    is_simulated: true,
    decision: 'APPROVED',
    coordinator_note: 'Approved as proposed',
    plan_signature: 'sig',
    active_constraints: [],
    recorded_at: '2026-09-12T08:00:00.000Z',
    log_entry_id: 'log-chain-001',
    notice: 'Recorded in the audit log.'
  });
});

/* ------------------------------------------------------------------ */
/* Honesty                                                            */
/* ------------------------------------------------------------------ */

describe('ReliefChain — honesty of the proposal', () => {
  it('labels the exercise as simulated and frames the plan as a proposal, never a dispatch', async () => {
    renderChain();

    await screen.findByText(CHAIN_FRAMING);
    // The server-supplied notice is mounted verbatim by the shell.
    expect(screen.getByText(CHAIN_NOTICE)).toBeInTheDocument();
    // The only action on this surface is a human decision, and the copy says so.
    expect(screen.getByText(/never dispatches a shipment/i)).toBeInTheDocument();
  });

  it('names the data-gap zone and states plainly who the plan leaves short', async () => {
    renderChain();
    await screen.findByText(CHAIN_FRAMING);

    const summary = screen.getByTestId('chain-disadvantaged');
    expect(summary.textContent).toMatch(/served first and a data gap is served last/i);
    expect(summary.textContent).toMatch(/Cedar Hollow/);

    // Silence is modelled as a data gap, never as a safe area.
    expect(screen.getByText(/This is a data gap, not evidence that the area is safe/i)).toBeInTheDocument();
    expect(screen.getAllByText('Data-gap estimate').length).toBeGreaterThan(0);
  });

  it('renders the engine’s own shipment and unmet counts, not invented ones', async () => {
    renderChain();
    await screen.findByText(CHAIN_FRAMING);

    const plan = computeSupplyPlan(dataset, {});
    expect(screen.getByText(`Distribution proposal (${plan.shipments.length})`)).toBeInTheDocument();
    expect(screen.getByText(`Unmet need (${plan.unmet.length})`)).toBeInTheDocument();
  });

  it('recomputes from the scenario and surfaces the closed segment as a constraint', async () => {
    renderChain();
    await screen.findByText(CHAIN_FRAMING);

    fireEvent.click(screen.getByLabelText(/Close the Mill Bridge/i));

    await waitFor(() =>
      expect(vi.mocked(api.postChainPlan)).toHaveBeenLastCalledWith({
        scenario: {
          blocked_edge_keys: [MILL_BRIDGE_EDGE_KEY],
          unavailable_depot_ids: [],
          planning_horizon_days: SUPPLY_PARAMETERS.planningHorizonDays
        }
      })
    );

    expect(await screen.findByText(/road segment\(s\) closed: Mill Bridge/i)).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/* Human decision                                                     */
/* ------------------------------------------------------------------ */

describe('ReliefChain — the decision stays with a human', () => {
  it('will not submit without a decision and a note, then records both with an idempotency key', async () => {
    renderChain();
    await screen.findByText(CHAIN_FRAMING);

    const submit = screen.getByRole('button', { name: /Review and record decision/i });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: 'Approve' }));
    fireEvent.change(screen.getByLabelText(/Coordinator note/i), {
      target: { value: 'Nearest-depot plan looks right' }
    });
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    fireEvent.click(screen.getByRole('button', { name: /^Record decision$/i }));

    await waitFor(() => expect(vi.mocked(api.postChainDecision)).toHaveBeenCalledTimes(1));
    const [payload, key] = vi.mocked(api.postChainDecision).mock.calls[0];
    expect(payload.decision).toBe('APPROVED');
    expect(payload.coordinator_note).toBe('Nearest-depot plan looks right');
    // The proposal a coordinator signs off is identified by its own signature.
    expect(payload.plan_signature).toContain('->');
    expect(key).toMatch(/^resq-chain-[0-9a-f]{8}$/);

    expect(await screen.findByText(/Approved — written to the audit trail/i)).toBeInTheDocument();
    expect(screen.getByText('log-chain-001')).toBeInTheDocument();
  });

  it('reuses the same idempotency key when the identical decision is recorded twice', async () => {
    renderChain();
    await screen.findByText(CHAIN_FRAMING);

    fireEvent.click(screen.getByRole('radio', { name: 'Approve' }));
    fireEvent.change(screen.getByLabelText(/Coordinator note/i), { target: { value: 'Approved as proposed' } });

    fireEvent.click(screen.getByRole('button', { name: /Review and record decision/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Record decision$/i }));
    await waitFor(() => expect(vi.mocked(api.postChainDecision)).toHaveBeenCalledTimes(1));
    const firstKey = vi.mocked(api.postChainDecision).mock.calls[0][1];

    // A double-click must not look like two approvals to the audit trail.
    fireEvent.click(screen.getByRole('button', { name: /Review and record decision/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Record decision$/i }));
    await waitFor(() => expect(vi.mocked(api.postChainDecision)).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.postChainDecision).mock.calls[1][1]).toBe(firstKey);
  });

  it('surfaces an authorization failure without claiming the decision was recorded', async () => {
    vi.mocked(api.postChainDecision).mockRejectedValue(
      new api.ApiError(401, 'UNAUTHORIZED', 'Coordinator token required')
    );

    renderChain();
    await screen.findByText(CHAIN_FRAMING);

    fireEvent.click(screen.getByRole('radio', { name: 'Reject' }));
    fireEvent.change(screen.getByLabelText(/Coordinator note/i), { target: { value: 'Stock split is wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /Review and record decision/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Record decision$/i }));

    await waitFor(() =>
      expect(screen.getAllByText(/coordinator authorization is required/i).length).toBeGreaterThan(0)
    );
    expect(screen.queryByText(/written to the audit trail/i)).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/* Loading / error / offline                                          */
/* ------------------------------------------------------------------ */

describe('ReliefChain — degraded states', () => {
  it('offers a retry when the proposal cannot be computed', async () => {
    vi.mocked(api.postChainPlan).mockRejectedValue(new Error('Backend unavailable'));

    renderChain();

    expect(await screen.findByText('Could not load the rescue intelligence data')).toBeInTheDocument();
    expect(screen.getByText('Backend unavailable')).toBeInTheDocument();
  });

  it('warns when offline rather than implying the plan is current', async () => {
    setOnline(false);
    renderChain();

    expect(await screen.findByText(/You appear to be offline/i)).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/* Accessibility                                                      */
/* ------------------------------------------------------------------ */

describe('ReliefChain — accessibility', () => {
  it('passes automated accessibility checks with a full proposal on screen', async () => {
    const { container } = renderChain();
    await screen.findByText(CHAIN_FRAMING);

    await expectNoSeriousA11yViolations(container);
  });
});
