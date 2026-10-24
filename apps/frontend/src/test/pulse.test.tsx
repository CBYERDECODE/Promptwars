import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import axe from 'axe-core';
import { PULSE_DELIVERY_NOTICE, deriveIdempotencyKey, type QueuedPulse } from '@resq-ai/shared';

/**
 * The Pulse surface is tested against its own contract: a report is a draft on
 * the device until the SERVER says otherwise. Every test below that touches
 * delivery therefore asserts on the exact payload that would reach the API, and
 * on the wording the reporter actually sees.
 */
vi.mock('../api/client', async importOriginal => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, createIncident: vi.fn() };
});

import * as api from '../api/client';
import { RescuePulseView } from '../views/rescue/RescuePulseView';
import { PULSE_STORAGE_KEY } from '../hooks/usePulseQueue';

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

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function renderPulse() {
  return render(<RescuePulseView />);
}

function fillReport({ location = 'Riverside Walk, by the old mill', notes = 'Water rising fast' } = {}) {
  fireEvent.change(screen.getByLabelText(/Where is it/i), { target: { value: location } });
  fireEvent.change(screen.getByLabelText(/Anything else you can see/i), { target: { value: notes } });
}

function submitReport() {
  fireEvent.click(screen.getByRole('button', { name: /Save report on this device/i }));
}

/** A stored row that passes validation, used to probe the read path. */
function storedRow(overrides: Partial<QueuedPulse> = {}): QueuedPulse {
  const draft = {
    incident_type: 'FLOOD' as const,
    location_text: 'Riverside Walk',
    people_estimate: null,
    immediate_danger: false,
    notes: '',
    client_id: 'client-stored-1',
    created_at: '2026-09-12T08:00:00.000Z',
    is_simulated: true as const
  };
  return {
    ...draft,
    idempotency_key: deriveIdempotencyKey(draft),
    status: 'NOT_DELIVERED',
    attempts: 0,
    last_attempt_at: null,
    last_error: null,
    server_incident_id: null,
    ...overrides
  };
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
  window.localStorage.clear();
  onlineState = true;
});

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

describe('RescuePulse — honesty of the delivery state', () => {
  it('shows the safety notice and never claims delivery before the server confirms it', async () => {
    let resolveDelivery!: (value: { id: string }) => void;
    vi.mocked(api.createIncident).mockImplementation(
      () => new Promise(resolve => {
        resolveDelivery = resolve as (value: { id: string }) => void;
      }) as ReturnType<typeof api.createIncident>
    );

    renderPulse();
    fillReport();
    submitReport();

    // The verbatim notice ships with the surface.
    expect(screen.getByText(PULSE_DELIVERY_NOTICE)).toBeInTheDocument();

    // In flight: "Sending" — never "Delivered".
    expect(await screen.findByText('Sending')).toBeInTheDocument();
    expect(screen.queryByText('Delivered')).not.toBeInTheDocument();

    await act(async () => {
      resolveDelivery({ id: 'sim-4f2a91bc' });
    });

    // Only the server's answer moves the entry to delivered.
    expect(await screen.findByText('Delivered')).toBeInTheDocument();
    expect(screen.getByText('sim-4f2a91bc')).toBeInTheDocument();
  });

  it('sends only what the reporter stated, leaving unknown fields explicitly unknown', async () => {
    vi.mocked(api.createIncident).mockResolvedValue({ id: 'sim-payload' } as never);

    renderPulse();
    // Note the headcount is deliberately left blank.
    fillReport({ location: 'Riverside Walk, by the old mill' });
    submitReport();

    await waitFor(() => expect(vi.mocked(api.createIncident)).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(api.createIncident).mock.calls[0][0];

    expect(payload.is_simulated).toBe(true);
    expect(payload.extraction.reported_location).toBe('Riverside Walk, by the old mill');
    expect(payload.extraction.people_at_risk.estimated_count).toBeNull();
    expect(payload.extraction.evidence_items[0].provenance).toBe('USER_REPORTED');
    // The device never assigns a severity or a casualty figure.
    expect(JSON.stringify(payload.extraction)).not.toContain('Critical');
  });
});

describe('RescuePulse — offline queue and reconnect', () => {
  it('stores an offline report without attempting delivery, and says so plainly', async () => {
    setOnline(false);
    renderPulse();

    expect(await screen.findByText(/You appear to be offline/i)).toBeInTheDocument();

    fillReport();
    submitReport();

    expect(await screen.findByText(/NOT been delivered/i)).toBeInTheDocument();
    expect(vi.mocked(api.createIncident)).not.toHaveBeenCalled();
    expect(screen.getByText('Not delivered')).toBeInTheDocument();

    // It survives as a device-local row.
    const stored = JSON.parse(window.localStorage.getItem(PULSE_STORAGE_KEY) ?? '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe('NOT_DELIVERED');
  });

  it('delivers queued reports automatically once the connection returns', async () => {
    setOnline(false);
    renderPulse();
    fillReport();
    submitReport();
    await screen.findByText('Not delivered');
    expect(vi.mocked(api.createIncident)).not.toHaveBeenCalled();

    vi.mocked(api.createIncident).mockResolvedValue({ id: 'sim-reconnect' } as never);

    await act(async () => {
      setOnline(true);
    });

    await waitFor(() => expect(vi.mocked(api.createIncident)).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Delivered')).toBeInTheDocument();
  });
});

describe('RescuePulse — failures are kept, not hidden', () => {
  it('keeps a failed report and reuses its idempotency key on retry', async () => {
    vi.mocked(api.createIncident).mockRejectedValue(new Error('Server unavailable'));

    renderPulse();
    fillReport();
    submitReport();

    await screen.findByText('Not delivered — last attempt failed');
    expect(screen.getByText(/Last attempt failed: Server unavailable/i)).toBeInTheDocument();

    const firstKey = vi.mocked(api.createIncident).mock.calls[0][0].idempotency_key;
    expect(firstKey).toBeTruthy();

    vi.mocked(api.createIncident).mockResolvedValue({ id: 'sim-retry' } as never);
    fireEvent.click(screen.getByRole('button', { name: /Retry sending/i }));

    await waitFor(() => expect(vi.mocked(api.createIncident)).toHaveBeenCalledTimes(2));
    // A retry of an unchanged report must not fork the audit trail server-side.
    expect(vi.mocked(api.createIncident).mock.calls[1][0].idempotency_key).toBe(firstKey);
    expect(await screen.findByText('Delivered')).toBeInTheDocument();
  });
});

describe('RescuePulse — storage integrity', () => {
  it('reports a stored row it cannot validate instead of silently sending it', async () => {
    window.localStorage.setItem(
      PULSE_STORAGE_KEY,
      JSON.stringify([{ ...storedRow(), is_simulated: false }])
    );

    renderPulse();

    expect(await screen.findByText(/could not be read and has not been sent/i)).toBeInTheDocument();
    expect(vi.mocked(api.createIncident)).not.toHaveBeenCalled();
    // The unusable row is not rendered as a sendable report.
    expect(screen.queryByText('Not delivered')).not.toBeInTheDocument();
  });

  it('restores a valid queued report from storage after a reload', async () => {
    window.localStorage.setItem(PULSE_STORAGE_KEY, JSON.stringify([storedRow()]));

    renderPulse();

    expect(await screen.findByText(/1 stored report — 1 not yet confirmed/i)).toBeInTheDocument();
    expect(screen.getByText('Not delivered')).toBeInTheDocument();
    expect(vi.mocked(api.createIncident)).not.toHaveBeenCalled();
  });
});

describe('RescuePulse — accessibility', () => {
  it('passes automated accessibility checks with a queued report present', async () => {
    vi.mocked(api.createIncident).mockRejectedValue(new Error('Server unavailable'));
    const { container } = renderPulse();

    fillReport();
    submitReport();
    await screen.findByText('Not delivered — last attempt failed');

    await expectNoSeriousA11yViolations(container);
  });
});
