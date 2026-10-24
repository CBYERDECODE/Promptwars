import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axe from 'axe-core';

/**
 * A failed read or a refused write must never be presented as an empty result or
 * a successful one. These tests pin the three places where that could happen.
 */
vi.mock('../api/client', async importOriginal => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    fetchIncidentReport: vi.fn(),
    patchIncident: vi.fn(),
    fetchSources: vi.fn()
  };
});

import * as api from '../api/client';
import { IncidentDetailDrawer } from '../components/IncidentDetailDrawer';
import { VerifiedSourcesView } from '../views/VerifiedSourcesView';
import { IncidentRecord } from '@resq-ai/shared';

const sampleIncident: IncidentRecord = {
  id: 'demo-fl-001',
  incident_type: 'FLOOD',
  summary: 'Water rising past 3 feet at Maplewood Valley Senior Center',
  reported_location: '440 Riverfront Boulevard',
  normalized_location: { formatted_address: '440 Riverfront Blvd, Maplewood Valley', confidence: 'HIGH' },
  hazard_indicators: ['Rising water'],
  people_at_risk: { estimated_count: 14, description: 'seniors on balcony' },
  reported_injuries: { estimated_count: 0, description: 'none reported' },
  access_constraints: [],
  reported_at: new Date('2026-09-12T08:00:00.000Z').toISOString(),
  missing_information: [],
  conflicting_information: [],
  evidence_items: [],
  uncertainty_notes: [],
  priority: {
    level: 'Critical',
    reasons: ['Direct life safety threat'],
    disclaimer: 'Suggested priority - decision support only.'
  },
  status: 'IN_REVIEW',
  created_at: new Date('2026-09-12T08:00:00.000Z').toISOString(),
  updated_at: new Date('2026-09-12T08:00:00.000Z').toISOString(),
  source_channel: 'SIMULATED_DEMO',
  is_simulated: true,
  attachments: [],
  verification_status: 'VERIFIED',
  sources: []
};

async function expectNoSeriousA11yViolations(container: HTMLElement) {
  const results = await axe.run(container);
  const blocking = results.violations.filter(
    violation => violation.impact === 'critical' || violation.impact === 'serious'
  );
  expect(blocking.map(v => `${v.id} (${v.impact}): ${v.help}`).join('\n')).toBe('');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('IncidentDetailDrawer — honest failure reporting', () => {
  it('reports a failed report export instead of rendering an empty report', async () => {
    vi.mocked(api.fetchIncidentReport).mockRejectedValue(
      new api.ApiError(500, 'REPORT_FAILED', 'Report generation failed on the server.')
    );

    render(
      <IncidentDetailDrawer incident={sampleIncident} onClose={vi.fn()} onIncidentUpdated={vi.fn()} />
    );

    fireEvent.click(screen.getByRole('button', { name: /export action report/i }));

    expect(await screen.findByText('Report export unavailable')).toBeInTheDocument();
    expect(screen.getByText(/failed request, not an empty report/i)).toBeInTheDocument();

    // Export controls are inert while there is nothing to export — no dead buttons.
    expect(screen.getByRole('button', { name: /copy markdown/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /download \.md/i })).toBeDisabled();
  });

  it('surfaces a refused status change and keeps the previous status', async () => {
    vi.mocked(api.patchIncident).mockRejectedValue(
      new api.ApiError(422, 'INVALID_STATUS', 'FUSED is not a valid target status.')
    );
    const onIncidentUpdated = vi.fn();

    render(
      <IncidentDetailDrawer
        incident={sampleIncident}
        onClose={vi.fn()}
        onIncidentUpdated={onIncidentUpdated}
      />
    );

    fireEvent.change(screen.getByLabelText(/update incident status/i), { target: { value: 'RESOLVED' } });

    expect(await screen.findByText('Status not updated')).toBeInTheDocument();
    expect(screen.getByText(/FUSED is not a valid target status/i)).toBeInTheDocument();
    // Nothing was applied, so the parent must not be told the incident changed.
    expect(onIncidentUpdated).not.toHaveBeenCalled();
  });

  it('passes automated accessibility checks while showing both failure states', async () => {
    vi.mocked(api.fetchIncidentReport).mockRejectedValue(
      new api.ApiError(500, 'REPORT_FAILED', 'Report generation failed on the server.')
    );
    vi.mocked(api.patchIncident).mockRejectedValue(
      new api.ApiError(422, 'INVALID_STATUS', 'FUSED is not a valid target status.')
    );

    const { container } = render(
      <IncidentDetailDrawer incident={sampleIncident} onClose={vi.fn()} onIncidentUpdated={vi.fn()} />
    );

    fireEvent.change(screen.getByLabelText(/update incident status/i), { target: { value: 'RESOLVED' } });
    await screen.findByText('Status not updated');
    fireEvent.click(screen.getByRole('button', { name: /export action report/i }));
    await screen.findByText('Report export unavailable');

    await expectNoSeriousA11yViolations(container);
  });
});

describe('VerifiedSourcesView — honest loading and error states', () => {
  it('reports a failed source-directory read and lets the operator retry', async () => {
    vi.mocked(api.fetchSources).mockRejectedValueOnce(
      new api.ApiError(503, 'SOURCES_UNAVAILABLE', 'The grounding source directory is unreachable.')
    );

    render(<VerifiedSourcesView announce={vi.fn()} />);

    expect(await screen.findByText('Grounding source directory unavailable')).toBeInTheDocument();
    expect(screen.getByText(/grounding source directory is unreachable/i)).toBeInTheDocument();
    // The status must not claim the key is missing when we simply could not read it.
    expect(screen.getByText(/status unknown/i)).toBeInTheDocument();

    vi.mocked(api.fetchSources).mockResolvedValueOnce({ service_configured: true } as any);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() =>
      expect(screen.queryByText('Grounding source directory unavailable')).not.toBeInTheDocument()
    );
    expect(await screen.findByText(/grounding tool is ready/i)).toBeInTheDocument();
  });

  it('passes automated accessibility checks in the error state', async () => {
    vi.mocked(api.fetchSources).mockRejectedValue(
      new api.ApiError(503, 'SOURCES_UNAVAILABLE', 'The grounding source directory is unreachable.')
    );

    const { container } = render(<VerifiedSourcesView announce={vi.fn()} />);
    await screen.findByText('Grounding source directory unavailable');

    await expectNoSeriousA11yViolations(container);
  });
});
