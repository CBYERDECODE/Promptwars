import { IncidentRecord, FusionCandidate } from '@resq-ai/shared';
import { IIncidentRepository } from '../repository/types.js';
import { AppError } from '../middleware/errorHandler.js';

export interface FusionPreviewResult {
  candidate: FusionCandidate;
  primary: IncidentRecord;
  secondary: IncidentRecord;
  suggested_merged_summary: string;
  combined_hazard_indicators: string[];
  combined_access_constraints: string[];
  conflicting_claims: string[];
  gemini_explanation?: string;
}

export class FusionService {
  constructor(private repo: IIncidentRepository) {}

  /**
   * Deterministic signal detection for candidate matching.
   * Compares type, location proximity / text, and time window (within 24 hours).
   */
  public async findCandidates(incidentId: string): Promise<FusionCandidate[]> {
    const target = await this.repo.findById(incidentId);
    if (!target) return [];

    const all = await this.repo.find({ is_simulated: target.is_simulated }, { limit: 100 });
    const candidates: FusionCandidate[] = [];

    const targetTime = new Date(target.reported_at).getTime();

    for (const other of all.items) {
      if (other.id === target.id) continue;

      let score = 0;
      const matchingFactors: string[] = [];
      const conflictingFields: string[] = [];

      // 1. Same Incident Type
      if (other.incident_type === target.incident_type) {
        score += 0.35;
        matchingFactors.push(`Identical incident classification (${target.incident_type})`);
      } else {
        conflictingFields.push(`Classification difference: ${target.incident_type} vs ${other.incident_type}`);
      }

      // 2. Time Window Check (within 4 hours = high, within 24 hours = moderate)
      const otherTime = new Date(other.reported_at).getTime();
      const diffHours = Math.abs(targetTime - otherTime) / (1000 * 60 * 60);

      if (diffHours <= 4) {
        score += 0.35;
        matchingFactors.push(`Close temporal proximity (within ${diffHours.toFixed(1)} hrs)`);
      } else if (diffHours <= 24) {
        score += 0.15;
        matchingFactors.push(`Same 24h operational window (${diffHours.toFixed(1)} hrs apart)`);
      }

      // 3. Location / Address Similarity
      const locA = (target.reported_location || target.normalized_location?.formatted_address || '').toLowerCase();
      const locB = (other.reported_location || other.normalized_location?.formatted_address || '').toLowerCase();

      if (locA && locB) {
        const wordsA = locA.split(/[\s,.-]+/).filter(w => w.length > 3);
        const wordsB = locB.split(/[\s,.-]+/).filter(w => w.length > 3);
        const commonWords = wordsA.filter(w => wordsB.includes(w));

        if (commonWords.length >= 2) {
          score += 0.3;
          matchingFactors.push(`Location keywords overlap: ${commonWords.slice(0, 3).join(', ')}`);
        } else if (commonWords.length === 1) {
          score += 0.15;
          matchingFactors.push(`Minor location overlap: ${commonWords[0]}`);
        } else {
          conflictingFields.push(`Discrepant location descriptions: "${target.reported_location}" vs "${other.reported_location}"`);
        }
      }

      // 4. Injuries / Risk Conflicts
      if (
        (target.reported_injuries.estimated_count || 0) !== (other.reported_injuries.estimated_count || 0)
      ) {
        conflictingFields.push(
          `Casualty count variance: ${target.reported_injuries.estimated_count ?? 'none'} vs ${other.reported_injuries.estimated_count ?? 'none'}`
        );
      }

      if (score >= 0.45) {
        candidates.push({
          primary_id: target.id,
          secondary_id: other.id,
          similarity_score: Math.min(1.0, score),
          matching_factors: matchingFactors,
          conflicting_fields: conflictingFields
        });
      }
    }

    candidates.sort((a, b) => b.similarity_score - a.similarity_score);
    return candidates;
  }

  public async previewFusion(primaryId: string, secondaryId: string): Promise<FusionPreviewResult | null> {
    const primary = await this.repo.findById(primaryId);
    const secondary = await this.repo.findById(secondaryId);

    if (!primary || !secondary) return null;

    // Detect conflicts between both records
    const conflictingClaims: string[] = [];
    if (primary.summary !== secondary.summary) {
      conflictingClaims.push(`Primary summary: "${primary.summary.slice(0, 80)}..." vs Secondary summary: "${secondary.summary.slice(0, 80)}..."`);
    }
    if (primary.reported_location !== secondary.reported_location) {
      conflictingClaims.push(`Location divergence: "${primary.reported_location}" vs "${secondary.reported_location}"`);
    }
    if ((primary.reported_injuries.estimated_count || 0) !== (secondary.reported_injuries.estimated_count || 0)) {
      conflictingClaims.push(`Reported injuries divergence: ${primary.reported_injuries.estimated_count ?? 0} vs ${secondary.reported_injuries.estimated_count ?? 0}`);
    }

    // Merge hazards uniquely
    const combinedHazards = Array.from(new Set([...primary.hazard_indicators, ...secondary.hazard_indicators]));
    const combinedConstraints = Array.from(new Set([...primary.access_constraints, ...secondary.access_constraints]));

    // Build the merged summary from each report's ORIGINAL (banner-stripped) summary so that
    // a repeated merge can never stack "[FUSED INCIDENT]" prefixes or connector phrases.
    const suggestedMergedSummary = `[FUSED INCIDENT] Combined intelligence from Report ${primary.id} and Report ${secondary.id}. ${FusionService.stripFusionArtifacts(primary.summary)} Supplementary report details: ${FusionService.stripFusionArtifacts(secondary.summary)}`;

    return {
      candidate: {
        primary_id: primary.id,
        secondary_id: secondary.id,
        similarity_score: 0.8,
        matching_factors: [`Same incident class: ${primary.incident_type}`],
        conflicting_fields: conflictingClaims
      },
      primary,
      secondary,
      suggested_merged_summary: suggestedMergedSummary,
      combined_hazard_indicators: combinedHazards,
      combined_access_constraints: combinedConstraints,
      conflicting_claims: conflictingClaims,
      gemini_explanation: `Both reports refer to ${primary.incident_type} occurrences within the same operational period. Fusing combines ${primary.evidence_items.length + secondary.evidence_items.length} distinct evidence claims while preserving all provenance audits.`
    };
  }

  /**
   * Removes any fusion banner/connector artifacts already present in a summary so that
   * merged summaries stay stable across repeated or chained fusions.
   */
  private static stripFusionArtifacts(summary: string): string {
    return summary
      .replace(/\[FUSED INCIDENT\]\s*/gi, '')
      .replace(/Combined intelligence from Report \S+ and Report \S+\.\s*/gi, '')
      .replace(/Supplementary report details:\s*/gi, '')
      .trim();
  }

  /** Removes duplicate entries (by `id`) while preserving the first occurrence and order. */
  private static dedupeById<T extends { id: string }>(items: T[]): T[] {
    const seen = new Set<string>();
    const result: T[] = [];
    for (const item of items) {
      if (item && typeof item.id === 'string') {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
      }
      result.push(item);
    }
    return result;
  }

  /** Removes duplicate strings while preserving the first occurrence and order. */
  private static dedupeStrings(items: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of items) {
      if (typeof item !== 'string') continue;
      if (seen.has(item)) continue;
      seen.add(item);
      result.push(item);
    }
    return result;
  }

  /**
   * Explicit confirmation of fusion by human decision-maker.
   * Merging is NEVER automatic.
   * Preserves every original report (author, source ID, timestamps, attachments, conflicting claims).
   *
   * IDEMPOTENT & NON-DESTRUCTIVE: this operation is a single-shot transition. Attempting to fuse an
   * already-fused incident, an already-fused secondary, the same pair twice, or an incident with
   * itself is rejected with a 409/400 and leaves all stored data untouched. Combined evidence,
   * conflicts, and original reports are de-duplicated so a merge can never duplicate records.
   */
  public async confirmFusion(
    primaryId: string,
    secondaryId: string,
    resolutionNotes?: string
  ): Promise<IncidentRecord> {
    // Guard: a fusion requires two distinct reports.
    if (primaryId === secondaryId) {
      throw new AppError(
        400,
        'FUSION_INVALID_PAIR',
        'A fusion requires two distinct emergency reports; the primary and secondary incident IDs are identical.'
      );
    }

    const primary = await this.repo.findById(primaryId);
    const secondary = await this.repo.findById(secondaryId);

    if (!primary || !secondary) {
      throw new AppError(
        404,
        'FUSION_NOT_FOUND',
        'One or both incidents could not be found for fusion.'
      );
    }

    // Guard: reject already-fused incidents and duplicate pairs (idempotency barrier).
    const pairAlreadyMerged =
      (primary.merged_incident_ids || []).includes(secondary.id) ||
      (secondary.merged_incident_ids || []).includes(primary.id);

    const alreadyFused =
      primary.is_fused === true ||
      secondary.is_fused === true ||
      primary.status === 'FUSED' ||
      secondary.status === 'FUSED' ||
      pairAlreadyMerged;

    if (alreadyFused) {
      throw new AppError(
        409,
        'FUSION_ALREADY_PERFORMED',
        `Fusion for ${primaryId} + ${secondaryId} has already been performed. The existing fused record is unchanged; no data was duplicated.`
      );
    }

    const preview = await this.previewFusion(primaryId, secondaryId);
    if (!preview) {
      throw new AppError(500, 'FUSION_PREVIEW_FAILED', 'Unable to compute a fusion preview for the requested incidents.');
    }

    // Combined evidence items preserving exact provenance and source IDs (de-duplicated by ID).
    const combinedEvidence = FusionService.dedupeById([
      ...primary.evidence_items,
      ...secondary.evidence_items.map(e => ({
        ...e,
        id: `fused-${e.id}`,
        claim: `[From ${secondary.id}] ${e.claim}`
      }))
    ]);

    // Combine attachments (de-duplicated by ID)
    const combinedAttachments = FusionService.dedupeById([
      ...primary.attachments,
      ...secondary.attachments
    ]);

    // Preserve conflicting information explicitly (de-duplicated so repeats cannot inflate it)
    const combinedConflicts = FusionService.dedupeStrings([
      ...primary.conflicting_information,
      ...secondary.conflicting_information,
      ...preview.conflicting_claims
    ]);

    if (resolutionNotes) {
      combinedConflicts.push(`Human Resolution Note: ${resolutionNotes}`);
    }

    // Original reports audit trail (de-duplicated by ID so originals are never duplicated)
    const originalReports = FusionService.dedupeById([
      ...(primary.original_reports || [primary]),
      ...(secondary.original_reports || [secondary])
    ] as IncidentRecord[]);

    const mergedIncidentIds = Array.from(
      new Set([primary.id, secondary.id, ...(primary.merged_incident_ids || []), ...(secondary.merged_incident_ids || [])])
    );

    // Update primary record as the fused master
    const updatedPrimary: IncidentRecord = {
      ...primary,
      summary: preview.suggested_merged_summary,
      hazard_indicators: preview.combined_hazard_indicators,
      access_constraints: preview.combined_access_constraints,
      evidence_items: combinedEvidence,
      attachments: combinedAttachments,
      conflicting_information: combinedConflicts,
      is_fused: true,
      merged_incident_ids: mergedIncidentIds,
      original_reports: originalReports,
      updated_at: new Date().toISOString()
    };

    await this.repo.update(primary.id, updatedPrimary);

    // Mark secondary as FUSED status linking back to primary
    await this.repo.update(secondary.id, {
      status: 'FUSED',
      updated_at: new Date().toISOString()
    });

    return updatedPrimary;
  }
}
