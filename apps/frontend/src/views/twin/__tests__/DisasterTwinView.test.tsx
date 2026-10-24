import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DisasterTwinView, DEMO_TITLE } from '../DisasterTwinView';

describe('DisasterTwinView', () => {
  it('renders the simulated twin with a 2D fallback when WebGL is unavailable', () => {
    render(<DisasterTwinView />);
    expect(screen.getByRole('heading', { name: /3D Disaster Twin/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: DEMO_TITLE })).toBeInTheDocument();
    expect(screen.getByTestId('twin-fallback-map')).toBeInTheDocument();
    expect(screen.getAllByText(/simulated/i).length).toBeGreaterThan(0);
  });

  it('updates exposure metrics when the water level slider moves', () => {
    render(<DisasterTwinView />);
    const slider = screen.getByLabelText(/Water level above river datum/i);
    fireEvent.change(slider, { target: { value: '0' } });
    expect(screen.getByText('0 exposed')).toBeInTheDocument();
    fireEvent.change(slider, { target: { value: '3' } });
    expect(screen.queryByText('0 exposed')).not.toBeInTheDocument();
    expect(screen.getByText(/^[1-9]\d* exposed$/)).toBeInTheDocument();
  });

  it('generates a route and shows a comparison after closing Mill Bridge', () => {
    render(<DisasterTwinView />);
    fireEvent.change(screen.getByLabelText(/Water level above river datum/i), { target: { value: '2.2' } });
    fireEvent.click(screen.getByRole('tab', { name: /Route/i }));
    fireEvent.click(screen.getByRole('button', { name: /Generate optimised route/i }));
    expect(screen.getByText(/Why this route/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Close Mill Bridge/i }));
    expect(screen.getByText('Previous route (dashed)')).toBeInTheDocument();
    expect(screen.getByTestId('route-compare')).toHaveTextContent(/avoids .*Mill Bridge/);
  });

  it('answers copilot questions from the simulation state', () => {
    render(<DisasterTwinView />);
    fireEvent.click(screen.getByRole('tab', { name: /Copilot/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Which ambulance can reach Incident A fastest?' }));
    const log = screen.getByTestId('copilot-log');
    expect(log).toHaveTextContent(/AMB-\d/);
    expect(log).toHaveTextContent(/Basis:/);
  });

  it('starts a virtual drone mission with inspection statistics', () => {
    render(<DisasterTwinView />);
    fireEvent.click(screen.getByRole('tab', { name: /Drone/i }));
    expect(screen.getByText(/does not connect to or control any real aircraft/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Start mission/i }));
    expect(screen.getByText('Points inspected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pause mission/i })).toBeInTheDocument();
  });
});
