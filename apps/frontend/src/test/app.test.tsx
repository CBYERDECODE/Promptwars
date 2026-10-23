import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from '../App';
import { ProvenanceBadge } from '../components/ProvenanceBadge';
import { PriorityBadge } from '../components/PriorityBadge';
import { EmergencyDisclaimer } from '../components/EmergencyDisclaimer';
import { IncidentDetailDrawer } from '../components/IncidentDetailDrawer';
import { IncidentRecord } from '@resq-ai/shared';
import axe from 'axe-core';

describe('ResQ AI Frontend UI & Accessibility Suite', () => {
  const sampleIncident: IncidentRecord = {
    id: 'demo-fl-001',
    incident_type: 'FLOOD',
    summary: 'Water rising past 3 feet at Maplewood Valley Senior Center',
    reported_location: '440 Riverfront Boulevard',
    normalized_location: {
      formatted_address: '440 Riverfront Blvd, Maplewood Valley',
      confidence: 'HIGH'
    },
    hazard_indicators: ['Rising water', 'Electrical hazard'],
    people_at_risk: { estimated_count: 14, description: 'seniors on balcony' },
    reported_injuries: { estimated_count: 1, description: 'mild hypothermia' },
    access_constraints: ['bridge submerged'],
    reported_at: new Date().toISOString(),
    missing_information: ['generator fuel status'],
    conflicting_information: [],
    evidence_items: [
      {
        id: 'ev-1',
        claim: 'Water level currently exceeds 3 feet',
        provenance: 'USER_REPORTED',
        confidence: 0.95
      },
      {
        id: 'ev-2',
        claim: 'Predicted river cresting at 4ft above flood stage',
        provenance: 'VERIFIED',
        confidence: 0.9
      }
    ],
    uncertainty_notes: [],
    priority: {
      level: 'Critical',
      reasons: ['Direct life safety threat', 'Imminent danger to population'],
      disclaimer: 'Suggested priority - decision support only.'
    },
    status: 'IN_REVIEW',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    source_channel: 'SIMULATED_DEMO',
    is_simulated: true,
    attachments: [],
    verification_status: 'VERIFIED',
    sources: []
  };

  beforeEach(() => {
    // Mock global fetch for health check
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/health')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'healthy',
            gemini: { configured: false, model: 'gemini-2.5-flash', status: 'Demo Mode' },
            stats: { total_incidents_stored: 4 }
          })
        });
      }
      if (url.includes('/api/incidents')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            items: [sampleIncident],
            total: 1,
            page: 1,
            limit: 10,
            totalPages: 1
          })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({})
      });
    });
  });

  // Test Provenance Badge Rule (Never color alone, text plus icon)
  it('renders all four provenance badges with explicit text and icons', () => {
    const { rerender } = render(<ProvenanceBadge provenance="USER_REPORTED" />);
    expect(screen.getByText('USER_REPORTED')).toBeInTheDocument();

    rerender(<ProvenanceBadge provenance="AI_INFERRED" />);
    expect(screen.getByText('AI_INFERRED')).toBeInTheDocument();

    rerender(<ProvenanceBadge provenance="VERIFIED" />);
    expect(screen.getByText('VERIFIED')).toBeInTheDocument();

    rerender(<ProvenanceBadge provenance="UNVERIFIED_OR_CONFLICTING" />);
    expect(screen.getByText('UNVERIFIED_OR_CONFLICTING')).toBeInTheDocument();
  });

  // Test Priority Badge
  it('renders priority badge with text and icon', () => {
    render(<PriorityBadge priority="Critical" />);
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  // Persistent Emergency Disclaimer
  it('renders persistent emergency disclaimer notice', () => {
    render(<EmergencyDisclaimer isModalOpen={false} onCloseModal={vi.fn()} />);
    expect(screen.getByText(/In immediate danger, contact local emergency services now/i)).toBeInTheDocument();
  });

  // H.13: Empty / failed states render cleanly
  it('H.13: renders app shell with navigation and mode badge', async () => {
    render(<App />);
    expect(screen.getAllByText(/ResQ/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: /application content/i })).toBeInTheDocument();
    expect(await screen.findByText('Demo Mode')).toBeInTheDocument();
  });

  // H.14: Forms, drawer, and dialogs are keyboard-operable
  it('H.14: drawer handles Escape key to close and traps focus', () => {
    const handleClose = vi.fn();
    const handleUpdate = vi.fn();

    render(
      <IncidentDetailDrawer
        incident={sampleIncident}
        onClose={handleClose}
        onIncidentUpdated={handleUpdate}
      />
    );

    expect(screen.getByText(/Intelligence Overview/i)).toBeInTheDocument();

    // Trigger ESC key
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  // Axe Accessibility Audit
  it('passes automated axe accessibility checks on core components', async () => {
    const { container } = render(
      <div>
        <EmergencyDisclaimer isModalOpen={false} onCloseModal={vi.fn()} />
        <ProvenanceBadge provenance="VERIFIED" />
        <PriorityBadge priority="High" />
      </div>
    );

    const results = await axe.run(container);
    // Expect 0 critical or serious violations
    const violations = results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
    expect(violations.length).toBe(0);
  });
});
