import { IncidentRecord, IncidentReportExport } from '@resq-ai/shared';

export class ReportGeneratorService {
  public generateExport(incident: IncidentRecord): IncidentReportExport {
    const exportedAt = new Date().toISOString();

    const checklist = [
      {
        id: 'chk-1',
        item: 'Verify incident site access constraints and perimeter safety',
        completed: incident.status !== 'NEW',
        recommended_role: 'Operations / Incident Commander'
      },
      {
        id: 'chk-2',
        item: 'Cross-reference reported casualties and confirm emergency medical services triage',
        completed: incident.reported_injuries.estimated_count === 0,
        recommended_role: 'EMS Coordinator'
      },
      {
        id: 'chk-3',
        item: 'Resolve conflicting evidence claims with on-scene field inspection',
        completed: incident.conflicting_information.length === 0,
        recommended_role: 'Intelligence / Recon Lead'
      },
      {
        id: 'chk-4',
        item: 'Issue public warning notification through official emergency channels if warranted',
        completed: false,
        recommended_role: 'Public Information Officer (PIO)'
      },
      {
        id: 'chk-5',
        item: 'Log and track downstream infrastructure dependencies (power, transit, water)',
        completed: incident.status === 'RESOLVED',
        recommended_role: 'Infrastructure Liaison'
      }
    ];

    const recommendations = [
      {
        category: 'Tactical Access',
        advice: incident.access_constraints.length > 0
          ? `Primary route constraints detected: ${incident.access_constraints.join('; ')}. Establish staging zone upwind or on designated alternate corridor.`
          : 'Establish standard 100m standoff zone pending primary field unit recon.',
        is_executed_action: false as const
      },
      {
        category: 'Personnel Safety',
        advice: incident.people_at_risk.estimated_count && incident.people_at_risk.estimated_count > 0
          ? `Approx. ${incident.people_at_risk.estimated_count} people reported in danger area (${incident.people_at_risk.description || 'unspecified'}). Prioritize perimeter evacuation.`
          : 'Maintain continuous personnel accountability and standard PPE protocol.',
        is_executed_action: false as const
      },
      {
        category: 'Intelligence Verification',
        advice: incident.missing_information.length > 0
          ? `Crucial information gaps remain: ${incident.missing_information.join('; ')}. Task initial responding unit to verify these specific data points.`
          : 'All primary intelligence criteria established; monitor for environmental escalation.',
        is_executed_action: false as const
      }
    ];

    const markdown = `# RESQ AI INCIDENT ACTION REPORT
**Incident ID:** \`${incident.id}\`  
**Classification:** ${incident.incident_type}  
**Suggested Priority:** **${incident.priority.level.toUpperCase()}** *(Decision Support Only)*  
**Current Status:** ${incident.status}  
**Export Timestamp:** ${exportedAt}  
${incident.is_simulated ? '> **NOTE: THIS INCIDENT IS SIMULATED DEMO DATA.**\n' : ''}
---

## 1. Executive Summary
${incident.summary}

**Location:** ${incident.reported_location || 'Location Not Specified (Action Pending)'}  
${incident.normalized_location ? `**Normalized Address:** ${incident.normalized_location.formatted_address} (Confidence: ${incident.normalized_location.confidence})` : ''}  
**Reported At:** ${incident.reported_at}  

---

## 2. Priority Evaluation & Rationale
> **Disclaimer:** ${incident.priority.disclaimer}

**Determined Level:** \`${incident.priority.level}\`  
**Deterministic Engine Rationale:**
${incident.priority.reasons.map(r => `- ${r}`).join('\n')}

---

## 3. Hazard Indicators & Constraints
### Hazard Indicators:
${incident.hazard_indicators.length > 0 ? incident.hazard_indicators.map(h => `- ⚠️ ${h}`).join('\n') : '- None formally identified'}

### Access Constraints:
${incident.access_constraints.length > 0 ? incident.access_constraints.map(c => `- 🚧 ${c}`).join('\n') : '- No access constraints reported'}

### Casualties & Population at Risk:
- **Estimated People at Risk:** ${incident.people_at_risk.estimated_count ?? 'Undetermined'} ${incident.people_at_risk.description ? `(${incident.people_at_risk.description})` : ''}
- **Reported Injuries:** ${incident.reported_injuries.estimated_count ?? 'None confirmed'} ${incident.reported_injuries.description ? `(${incident.reported_injuries.description})` : ''}

---

## 4. Evidence Traceability & Provenance
| Claim | Provenance | Confidence | Source / Reference |
| :--- | :--- | :--- | :--- |
${incident.evidence_items.map(e => `| ${e.claim.replace(/\|/g, '-')} | **${e.provenance}** | ${(e.confidence * 100).toFixed(0)}% | ${e.source_excerpt ? e.source_excerpt.replace(/\|/g, '-') : (e.source_name || 'N/A')} |`).join('\n')}

---

## 5. Intelligence Gaps & Conflicts
${incident.missing_information.length > 0 ? `### Missing Information:\n${incident.missing_information.map(m => `- [ ] ${m}`).join('\n')}\n` : ''}
${incident.conflicting_information.length > 0 ? `### Conflicting Information (Needs Human Resolution):\n${incident.conflicting_information.map(c => `- ❗ ${c}`).join('\n')}\n` : ''}
${incident.uncertainty_notes.length > 0 ? `### Model & Analytic Uncertainties:\n${incident.uncertainty_notes.map(u => `- ℹ️ ${u}`).join('\n')}\n` : ''}

---

## 6. Decision Support Checklist
*Note: Checklist items represent standard operational guidelines and do not confirm action execution.*
${checklist.map(c => `- [${c.completed ? 'x' : ' '}] **${c.item}** (Assigned: *${c.recommended_role}*)`).join('\n')}

---

## 7. Recommended Actions vs. Executed Operations
> **CRITICAL NOTICE:** The recommendations below are AI/Rule-generated decision support advice. They **DO NOT** represent executed actions or dispatched resources.

${recommendations.map(r => `### [RECOMMENDED ADVICE - NOT EXECUTED] ${r.category}
> ${r.advice}
`).join('\n')}

---
*Report generated deterministically by ResQ AI Decision Support Engine.*
`;

    return {
      incident_id: incident.id,
      exported_at: exportedAt,
      markdown,
      structured_data: incident,
      checklist,
      recommendations
    };
  }
}
