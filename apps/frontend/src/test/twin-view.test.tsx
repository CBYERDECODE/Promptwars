import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ToastProvider } from '../ui';
import { TwinDisasterView } from '../views/TwinDisasterView';

vi.mock('../components/twin/TwinMapBasemap', () => ({
  TwinMapBasemap: () => <div data-testid="twin-map-mock">Map</div>
}));

vi.mock('../components/twin/TwinScene', () => ({
  TwinScene: () => <div data-testid="twin-scene-mock">3D scene</div>
}));

function renderTwin() {
  return render(
    <ToastProvider>
      <TwinDisasterView />
    </ToastProvider>
  );
}

describe('TwinDisasterView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mounts the command view with simulated labelling', async () => {
    renderTwin();
    expect(await screen.findByTestId('twin-disaster-view')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /SIMULATED — Riverbend 3D disaster twin/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Urban Flood Emergency/i })).toBeInTheDocument();
  });

  it('updates the flood slider and exposed-building table', async () => {
    renderTwin();
    const slider = screen.getByLabelText(/Modelled water level/i);
    fireEvent.change(slider, { target: { value: '4.3' } });
    await waitFor(() => {
      expect(slider).toHaveAttribute('aria-valuetext', '4.3 metres');
    });
    const table = screen.getByRole('table', { name: /Modelled building flood exposure/i });
    expect(table).toBeInTheDocument();
  });

  it('answers the copilot from simulation state', async () => {
    renderTwin();
    fireEvent.click(screen.getByRole('button', { name: 'Copilot' }));
    fireEvent.click(screen.getByRole('button', { name: /Which buildings are most exposed/i }));
    await waitFor(() => {
      expect(screen.getByTestId('twin-copilot-answer')).toBeInTheDocument();
    });
    expect(screen.getByTestId('twin-copilot-answer').textContent?.toLowerCase()).toMatch(/modelled|water|building/);
  });

  it('generates a route and shows Dijkstra reasoning', async () => {
    renderTwin();
    fireEvent.click(screen.getByRole('button', { name: 'Routes' }));
    fireEvent.click(screen.getByRole('button', { name: /Generate optimised route/i }));
    await waitFor(() => {
      expect(screen.getByText(/Why this route/i)).toBeInTheDocument();
    });
  });

  it('starts the one-click demo and advances the step badge', async () => {
    vi.useFakeTimers();
    try {
      renderTwin();
      fireEvent.click(screen.getByRole('button', { name: /Urban Flood Emergency/i }));
      expect(screen.getByText(/Step 1\//)).toBeInTheDocument();
      await act(async () => {
        vi.advanceTimersByTime(13_500);
      });
      expect(screen.getByText(/Step 2\//)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
