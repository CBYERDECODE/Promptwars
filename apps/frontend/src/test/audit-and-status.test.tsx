import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axe from 'axe-core';

/**
 * The audit trail and the status bar are the two places where the product either
 * tells the truth or does not. These tests pin the honesty of both: a refused
 * purge must never look like a completed one, and connectivity must never be
 * implied rather than stated.
 */
vi.mock('../api/client', async importOriginal => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, fetchActivityLogs: vi.fn(), clearActivityLogs: vi.fn() };
});

import * as api from '../api/client';
import { ToastProvider } from '../ui';
import { ActivityLogView } from '../views/ActivityLogView';
import { Header } from '../components/Header';

const ENTRIES: api.ActivityLogEntry[] = [
  {
    id: 'log-1',
    timestamp: '2026-09-12T08:00:00.000Z',
    action_type: 'INCIDENT_CREATED',
    incident_id: 'demo-fl-001',
    summary: 'Incident created from operator report'
  },
  {
    id: 'log-2',
    timestamp: '2026-09-12T08:05:00.000Z',
    action_type: 'RESCUE_PLAN_APPROVED',
    summary: 'Coordinator APPROVED the rescue proposal. Note: "Nearest unit is correct."'
  }
];

let onlineState = true;

beforeAll(() => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => onlineState });
});

function setOnline(next: boolean) {
  onlineState = next;
  window.dispatchEvent(new Event(next ? 'online' : 'offline'));
}

function renderActivityLog() {
  return render(
    <ToastProvider>
      <ActivityLogView />
    </ToastProvider>
  );
}

async function expectNoSeriousA11yViolations(container: HTMLElement) {
  const results = await axe.run(container);
  const blocking = results.violations.filter(
    violation => violation.impact === 'critical' || violation.impact === 'serious'
  );
  expect(blocking.map(v => `${v.id} (${v.impact}): ${v.help}`).join('\n')).toBe('');
}

beforeEach(() => {
  vi.clearAllMocks();
  onlineState = true;
  vi.mocked(api.fetchActivityLogs).mockResolvedValue({ entries: ENTRIES });
  vi.mocked(api.clearActivityLogs).mockResolvedValue(undefined);
});

/* ------------------------------------------------------------------ */
/* Reading the trail stays honest                                      */
/* ------------------------------------------------------------------ */

describe('ActivityLogView — reading the audit trail', () => {
  it('renders the sanitized entries returned by the server', async () => {
    renderActivityLog();

    expect(await screen.findByText('Incident created from operator report')).toBeInTheDocument();
    expect(screen.getByText('RESCUE_PLAN_APPROVED')).toBeInTheDocument();
    expect(screen.getByText('2 entries')).toBeInTheDocument();
  });

  it('reports a failed read as an error, never as an empty trail', async () => {
    vi.mocked(api.fetchActivityLogs).mockRejectedValue(
      new api.ApiError(500, 'STORAGE_FAILED', 'The activity log could not be read.')
    );

    renderActivityLog();

    expect(await screen.findByText('Could not read the audit trail')).toBeInTheDocument();
    expect(screen.getByText('The activity log could not be read.')).toBeInTheDocument();
    // The dangerous falsehood: an unreadable trail presented as "nothing happened".
    expect(screen.queryByText('No activity recorded yet')).not.toBeInTheDocument();
  });

  it('states offline plainly and disables the destructive action', async () => {
    setOnline(false);
    renderActivityLog();

    expect(await screen.findByText(/You appear to be offline/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clear Log/i })).toBeDisabled();
  });
});

/* ------------------------------------------------------------------ */
/* Purging is authorized and honest                                    */
/* ------------------------------------------------------------------ */

describe('ActivityLogView — purging the audit trail', () => {
  async function openPurgeDialog() {
    renderActivityLog();
    await screen.findByText('Incident created from operator report');
    fireEvent.click(screen.getByRole('button', { name: /Clear Log/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  }

  it('sends the coordinator token and only empties the list once the server confirms', async () => {
    await openPurgeDialog();

    fireEvent.change(screen.getByLabelText(/Coordinator token/i), { target: { value: 'board-token' } });
    fireEvent.click(screen.getByRole('button', { name: /Purge log/i }));

    await waitFor(() => expect(vi.mocked(api.clearActivityLogs)).toHaveBeenCalledWith('board-token'));
    expect(await screen.findByText('No activity recorded yet')).toBeInTheDocument();
    expect(screen.queryByText('Incident created from operator report')).not.toBeInTheDocument();
  });

  it('does NOT empty the list when the server refuses the purge', async () => {
    vi.mocked(api.clearActivityLogs).mockRejectedValue(
      new api.ApiError(401, 'ADMIN_UNAUTHORIZED', 'A valid administrative token is required for this action.')
    );

    await openPurgeDialog();
    fireEvent.click(screen.getByRole('button', { name: /Purge log/i }));

    await waitFor(() =>
      expect(screen.getAllByText(/a valid administrative token is required/i).length).toBeGreaterThan(0)
    );
    // Nothing was deleted, so the trail must still be on screen.
    expect(screen.getByText('Incident created from operator report')).toBeInTheDocument();
    expect(screen.queryByText('No activity recorded yet')).not.toBeInTheDocument();
  });

  it('passes automated accessibility checks with the trail and the dialog on screen', async () => {
    const { container } = renderActivityLog();
    await screen.findByText('Incident created from operator report');
    fireEvent.click(screen.getByRole('button', { name: /Clear Log/i }));
    await screen.findByRole('dialog');

    await expectNoSeriousA11yViolations(container);
  });
});

/* ------------------------------------------------------------------ */
/* Persistent connectivity in the status bar                            */
/* ------------------------------------------------------------------ */

describe('Header — connectivity state', () => {
  const headerProps = {
    health: null,
    isSimulatedMode: true,
    onToggleSimulated: vi.fn(),
    onOpenHotlineModal: vi.fn()
  };

  it('states the connection with an icon and a text label when online', async () => {
    render(<Header {...headerProps} />);
    expect(await screen.findByText('Online')).toBeInTheDocument();
  });

  it('states the connection when offline rather than implying it is online', async () => {
    setOnline(false);
    render(<Header {...headerProps} />);

    expect(await screen.findByText('Offline')).toBeInTheDocument();
    expect(screen.queryByText('Online')).not.toBeInTheDocument();
  });
});
