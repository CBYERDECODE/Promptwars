import { describe, it, expect } from 'vitest';
import { evaluatePriority, PRIORITY_DISCLAIMER } from './priority.js';
import { PriorityInput } from './priority.js';

describe('Deterministic Priority Engine', () => {
  it('forces "Needs review" when conflicting information is present', () => {
    const input: PriorityInput = {
      incident_type: 'FLOOD',
      hazard_indicators: ['rising water'],
      people_at_risk: { estimated_count: 5, description: 'trapped residents' },
      reported_injuries: { estimated_count: 0, description: null },
      access_constraints: [],
      missing_information: [],
      conflicting_information: ['Witness A reports water receded, Witness B reports water rising rapidly'],
      reported_location: '123 River Road, Riverside'
    };

    const result = evaluatePriority(input);
    expect(result.level).toBe('Needs review');
    expect(result.reasons[0]).toContain('Needs review');
    expect(result.reasons[0]).toContain('conflicting');
    expect(result.disclaimer).toBe(PRIORITY_DISCLAIMER);
  });

  it('forces "Needs review" when reported location is missing or empty', () => {
    const input: PriorityInput = {
      incident_type: 'FIRE',
      hazard_indicators: ['heavy black smoke'],
      people_at_risk: { estimated_count: 2, description: 'residents inside' },
      reported_injuries: { estimated_count: 1, description: 'smoke inhalation' },
      access_constraints: [],
      missing_information: ['exact address'],
      conflicting_information: [],
      reported_location: null
    };

    const result = evaluatePriority(input);
    expect(result.level).toBe('Needs review');
    expect(result.reasons[0]).toContain('location is missing');
  });

  it('evaluates Critical priority for severe hazard with active life safety threat', () => {
    const input: PriorityInput = {
      incident_type: 'FLOOD',
      hazard_indicators: ['swift rising water', 'trapped residents'],
      people_at_risk: { estimated_count: 8, description: 'stranded on roof' },
      reported_injuries: { estimated_count: 2, description: 'hypothermia' },
      access_constraints: ['road submerged'],
      missing_information: [],
      conflicting_information: [],
      reported_location: 'Bridge St & Waterway Ave, Sector 4'
    };

    const result = evaluatePriority(input);
    expect(result.level).toBe('Critical');
    expect(result.reasons.some(r => r.includes('Direct life safety threat'))).toBe(true);
    expect(result.reasons.some(r => r.includes('Imminent danger'))).toBe(true);
  });

  it('evaluates High priority when access constraints or elevated risks exist without direct life casualty', () => {
    const input: PriorityInput = {
      incident_type: 'BLOCKED_ROAD',
      hazard_indicators: ['large landslide across highway'],
      people_at_risk: { estimated_count: null, description: null },
      reported_injuries: { estimated_count: 0, description: null },
      access_constraints: ['impassable for emergency vehicles, no alternate route'],
      missing_information: [],
      conflicting_information: [],
      reported_location: 'Highway 101, Mile Marker 42'
    };

    const result = evaluatePriority(input);
    expect(result.level).toBe('High');
    expect(result.reasons.some(r => r.includes('Access constraints'))).toBe(true);
  });

  it('evaluates Moderate priority for localized road blockage or utility disruption with no life threat', () => {
    const input: PriorityInput = {
      incident_type: 'BLOCKED_ROAD',
      hazard_indicators: ['minor branch fell across single lane'],
      people_at_risk: { estimated_count: 0, description: null },
      reported_injuries: { estimated_count: 0, description: null },
      access_constraints: ['one lane blocked, bypass open'],
      missing_information: [],
      conflicting_information: [],
      reported_location: 'Maple St & 5th Ave'
    };

    const result = evaluatePriority(input);
    expect(result.level).toBe('Moderate');
  });

  it('evaluates Low priority for minor informational reports without hazards', () => {
    const input: PriorityInput = {
      incident_type: 'OTHER',
      hazard_indicators: [],
      people_at_risk: { estimated_count: 0, description: null },
      reported_injuries: { estimated_count: 0, description: null },
      access_constraints: [],
      missing_information: [],
      conflicting_information: [],
      reported_location: 'Central Plaza fountain'
    };

    const result = evaluatePriority(input);
    expect(result.level).toBe('Low');
    expect(result.reasons.some(r => r.includes('No immediate life-safety risk'))).toBe(true);
  });
});
