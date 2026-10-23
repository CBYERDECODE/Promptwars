import { IncidentType, PeopleAtRisk, PriorityEvaluation, PriorityLevel, ReportedInjuries } from './types.js';

export interface PriorityInput {
  incident_type: IncidentType;
  hazard_indicators: string[];
  people_at_risk: PeopleAtRisk;
  reported_injuries: ReportedInjuries;
  access_constraints: string[];
  missing_information: string[];
  conflicting_information: string[];
  reported_location: string | null;
}

export const PRIORITY_DISCLAIMER = 'Suggested priority - decision support only. In immediate danger, contact local emergency services now. Do not wait for AI analysis.';

/**
 * Deterministic pure function evaluating incident priority.
 * Guaranteed explainable: provides every matched rule and clear human-readable rationale.
 * Missing or conflicting key facts strictly force "Needs review".
 */
export function evaluatePriority(input: PriorityInput): PriorityEvaluation {
  const reasons: string[] = [];

  // Rule 0: Critical Missing or Conflicting Information checks
  const hasConflicts = input.conflicting_information && input.conflicting_information.length > 0;
  const missingLocation = !input.reported_location || input.reported_location.trim().length === 0;
  
  if (hasConflicts) {
    reasons.push(
      `Forced to "Needs review" due to ${input.conflicting_information.length} unresolved conflicting statement(s): ${input.conflicting_information.join('; ')}`
    );
    return {
      level: 'Needs review',
      reasons,
      disclaimer: PRIORITY_DISCLAIMER
    };
  }

  if (missingLocation) {
    reasons.push('Forced to "Needs review" because reported location is missing or undetermined (actionable dispatch requires verified location).');
    return {
      level: 'Needs review',
      reasons,
      disclaimer: PRIORITY_DISCLAIMER
    };
  }

  // Look for life-safety critical flags
  const hazardText = input.hazard_indicators.map(h => h.toLowerCase()).join(' ');
  const constraintsText = input.access_constraints.map(c => c.toLowerCase()).join(' ');

  const isLifeThreatening = 
    (input.reported_injuries.estimated_count !== null && input.reported_injuries.estimated_count > 0) ||
    (input.people_at_risk.estimated_count !== null && input.people_at_risk.estimated_count > 0) ||
    /trapped|drowning|suffocat|collapse|explosion|burning structure|unconscious|cardiac|severe bleeding/i.test(hazardText) ||
    /trapped|submerged/i.test(constraintsText);

  const isSevereHazard = 
    input.incident_type === 'MEDICAL_EMERGENCY' ||
    (input.incident_type === 'FIRE' && /structure|wildfire|spreading|gas/i.test(hazardText)) ||
    (input.incident_type === 'FLOOD' && /swift|rising rapidly|deep|dam failure|overflow/i.test(hazardText)) ||
    (input.incident_type === 'HAZARDOUS_MATERIAL' && /toxic|fumes|flammable|chlorine|ammonia/i.test(hazardText)) ||
    (input.incident_type === 'INFRASTRUCTURE_DAMAGE' && /bridge collapse|power lines down live|gas main/i.test(hazardText));

  // 1. Critical Evaluation
  if (isLifeThreatening && isSevereHazard) {
    if (input.reported_injuries.estimated_count && input.reported_injuries.estimated_count > 0) {
      reasons.push(`Direct life safety threat: ${input.reported_injuries.estimated_count} injury/injuries reported.`);
    }
    if (input.people_at_risk.estimated_count && input.people_at_risk.estimated_count > 0) {
      reasons.push(`Imminent danger to population: ~${input.people_at_risk.estimated_count} people reported at risk.`);
    }
    reasons.push(`Severe hazard present (${input.incident_type}) with critical indicators: ${input.hazard_indicators.slice(0, 3).join(', ')}.`);
    
    return {
      level: 'Critical',
      reasons,
      disclaimer: PRIORITY_DISCLAIMER
    };
  }

  // 2. High Evaluation
  const hasSevereAccessBlock = input.access_constraints.length > 0 && 
    /impassable|fully closed|bridge out|bridge washed|entirely blocked|no alternate route/i.test(constraintsText);

  if (isLifeThreatening || isSevereHazard || hasSevereAccessBlock) {
    if (isLifeThreatening) {
      reasons.push('Elevated risk: potential danger to people reported in vicinity.');
    }
    if (isSevereHazard) {
      reasons.push(`Active high-severity event (${input.incident_type}) requiring immediate mitigation.`);
    }
    if (hasSevereAccessBlock) {
      reasons.push(`Access constraints present cutting off emergency transit: ${input.access_constraints.join(', ')}.`);
    }
    return {
      level: 'High',
      reasons,
      disclaimer: PRIORITY_DISCLAIMER
    };
  }

  // 3. Moderate Evaluation
  const isModerateHazard =
    input.incident_type === 'BLOCKED_ROAD' ||
    input.incident_type === 'INFRASTRUCTURE_DAMAGE' ||
    input.hazard_indicators.length > 0;

  if (isModerateHazard) {
    reasons.push(`Localized operational disruption: incident type ${input.incident_type} with active indicators.`);
    if (input.hazard_indicators.length > 0) {
      reasons.push(`Identified indicators: ${input.hazard_indicators.join(', ')}.`);
    }
    return {
      level: 'Moderate',
      reasons,
      disclaimer: PRIORITY_DISCLAIMER
    };
  }

  // 4. Low Evaluation
  reasons.push('No immediate life-safety risk or critical infrastructure blockage detected.');
  reasons.push('Incident marked as Low priority for routine queue review.');
  return {
    level: 'Low',
    reasons,
    disclaimer: PRIORITY_DISCLAIMER
  };
}
